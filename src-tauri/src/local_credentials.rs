use std::{
    fs::{self, DirBuilder, OpenOptions, Permissions},
    io::{ErrorKind, Read, Write},
    os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};

use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

const KEY_FILE: &str = "typesafe-api-key";
const MAX_KEY_BYTES: usize = 4096;

pub struct LocalCredentialStore {
    directory: PathBuf,
}

impl LocalCredentialStore {
    pub fn new(directory: &Path) -> Self {
        Self {
            directory: directory.join("credentials"),
        }
    }

    fn key_path(&self) -> PathBuf {
        self.directory.join(KEY_FILE)
    }

    // A missing directory is normal until the first key is saved. Only saves
    // create it, and a file or symlink at this location is never followed.
    fn prepare_directory(&self, create: bool) -> AppResult<bool> {
        match fs::symlink_metadata(&self.directory) {
            Ok(metadata) if metadata.is_dir() => {}
            Ok(_) => return Err(local_storage_error()),
            Err(error) if error.kind() == ErrorKind::NotFound && !create => return Ok(false),
            Err(error) if error.kind() == ErrorKind::NotFound => {
                match DirBuilder::new().mode(0o700).create(&self.directory) {
                    Ok(()) => {}
                    Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
                    Err(_) => return Err(local_storage_error()),
                }
            }
            Err(_) => return Err(local_storage_error()),
        }

        let directory = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW)
            .open(&self.directory)
            .map_err(|_| local_storage_error())?;
        directory
            .set_permissions(Permissions::from_mode(0o700))
            .map_err(|_| local_storage_error())?;
        Ok(true)
    }

    fn key_exists(&self) -> AppResult<bool> {
        match fs::symlink_metadata(self.key_path()) {
            Ok(metadata) if metadata.is_file() => Ok(true),
            Ok(_) => Err(local_storage_error()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
            Err(_) => Err(local_storage_error()),
        }
    }

    pub fn read_key(&self) -> AppResult<Option<Zeroizing<String>>> {
        if !self.prepare_directory(false)? || !self.key_exists()? {
            return Ok(None);
        }

        // NOFOLLOW prevents a replacement symlink from being followed after
        // the metadata check. NONBLOCK also prevents a replacement FIFO from
        // holding the worker indefinitely before its type can be checked.
        let file = OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(self.key_path())
            .map_err(|_| local_storage_error())?;
        if !file
            .metadata()
            .map_err(|_| local_storage_error())?
            .is_file()
        {
            return Err(local_storage_error());
        }
        file.set_permissions(Permissions::from_mode(0o600))
            .map_err(|_| local_storage_error())?;
        let mut bytes = Zeroizing::new(Vec::new());
        file.take((MAX_KEY_BYTES + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|_| local_storage_error())?;
        if !valid_key(&bytes) {
            return Err(invalid_stored_key());
        }
        // valid_key accepts only ASCII, so this conversion cannot fail.
        let key = std::str::from_utf8(&bytes).map_err(|_| invalid_stored_key())?;
        Ok(Some(Zeroizing::new(key.to_owned())))
    }

    pub fn save_key(&self, key: &str) -> AppResult<()> {
        if !valid_key(key.as_bytes()) {
            return Err(AppError::new(
                "invalid_api_key",
                "Enter an API key with no spaces or line breaks.",
            ));
        }
        self.prepare_directory(true)?;
        self.key_exists()?;

        // Write a private file first, then atomically replace the old key so a
        // failed write never leaves a partial credential behind.
        let mut temporary =
            tempfile::NamedTempFile::new_in(&self.directory).map_err(|_| local_storage_error())?;
        temporary
            .as_file()
            .set_permissions(Permissions::from_mode(0o600))
            .map_err(|_| local_storage_error())?;
        temporary
            .write_all(key.as_bytes())
            .map_err(|_| local_storage_error())?;
        temporary
            .as_file()
            .sync_all()
            .map_err(|_| local_storage_error())?;
        temporary
            .persist(self.key_path())
            .map_err(|_| local_storage_error())?;
        Ok(())
    }

    pub fn delete_key(&self) -> AppResult<()> {
        if !self.prepare_directory(false)? || !self.key_exists()? {
            return Ok(());
        }
        match fs::remove_file(self.key_path()) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
            Err(_) => Err(local_storage_error()),
        }
    }
}

fn valid_key(bytes: &[u8]) -> bool {
    !bytes.is_empty() && bytes.len() <= MAX_KEY_BYTES && bytes.iter().all(u8::is_ascii_graphic)
}

fn local_storage_error() -> AppError {
    AppError::new(
        "credentials",
        "The local API key file could not be accessed. Check your application data directory permissions.",
    )
}

fn invalid_stored_key() -> AppError {
    AppError::new(
        "invalid_api_key",
        "The saved API key file is invalid. Save your API key again in Settings.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;

    #[test]
    fn key_survives_reopening_and_can_be_replaced_and_removed() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        assert!(store.read_key().unwrap().is_none());
        store.delete_key().unwrap();
        assert!(!store.directory.exists());

        store.save_key("synthetic-first-key").unwrap();
        let reopened = LocalCredentialStore::new(directory.path());
        assert_eq!(
            reopened.read_key().unwrap().as_deref().map(String::as_str),
            Some("synthetic-first-key")
        );
        reopened.save_key("synthetic-replacement-key").unwrap();
        assert_eq!(
            store.read_key().unwrap().as_deref().map(String::as_str),
            Some("synthetic-replacement-key")
        );
        assert_eq!(fs::read_dir(&store.directory).unwrap().count(), 1);
        store.delete_key().unwrap();
        store.delete_key().unwrap();
        assert!(store.read_key().unwrap().is_none());
    }

    #[test]
    fn credential_directory_and_file_have_private_permissions() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        store.save_key("synthetic-key").unwrap();
        assert_eq!(
            fs::metadata(&store.directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(store.key_path()).unwrap().permissions().mode() & 0o777,
            0o600
        );

        fs::set_permissions(&store.directory, Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(store.key_path(), Permissions::from_mode(0o644)).unwrap();
        store.read_key().unwrap();
        assert_eq!(
            fs::metadata(&store.directory).unwrap().permissions().mode() & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(store.key_path()).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }

    #[test]
    fn invalid_save_preserves_the_previous_key() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        store.save_key("synthetic-original-key").unwrap();
        for invalid in ["", " a ", "a b", "a\nb", "a\tb", "\u{00e9}"] {
            assert_eq!(store.save_key(invalid).unwrap_err().kind, "invalid_api_key");
        }
        assert_eq!(
            store
                .save_key(&"x".repeat(MAX_KEY_BYTES + 1))
                .unwrap_err()
                .kind,
            "invalid_api_key"
        );
        assert_eq!(
            store.read_key().unwrap().as_deref().map(String::as_str),
            Some("synthetic-original-key")
        );
        assert_eq!(fs::read_dir(&store.directory).unwrap().count(), 1);
    }

    #[test]
    fn stored_keys_are_bounded_and_validated_without_exposing_their_contents() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        store.save_key(&"x".repeat(MAX_KEY_BYTES)).unwrap();
        assert_eq!(store.read_key().unwrap().unwrap().len(), MAX_KEY_BYTES);

        for bytes in [
            Vec::new(),
            b"synthetic-secret with spaces".to_vec(),
            b"synthetic-secret\n".to_vec(),
            vec![0xff],
            vec![b'x'; MAX_KEY_BYTES + 1],
        ] {
            fs::write(store.key_path(), bytes).unwrap();
            let error = store.read_key().unwrap_err();
            assert_eq!(error.kind, "invalid_api_key");
            assert!(!error.message.contains("synthetic-secret"));
        }
        // A corrupt regular file can still be replaced from Settings.
        store.save_key("synthetic-recovered-key").unwrap();
        assert!(store.read_key().unwrap().is_some());
    }

    #[test]
    fn credential_directory_symlinks_are_rejected_without_touching_the_target() {
        let directory = tempfile::tempdir().unwrap();
        let target = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        let target_key = target.path().join(KEY_FILE);
        fs::write(&target_key, "synthetic-outside-key").unwrap();
        symlink(target.path(), &store.directory).unwrap();

        assert_eq!(store.read_key().unwrap_err().kind, "credentials");
        assert_eq!(
            store.save_key("synthetic-new-key").unwrap_err().kind,
            "credentials"
        );
        assert_eq!(store.delete_key().unwrap_err().kind, "credentials");
        assert_eq!(
            fs::read_to_string(target_key).unwrap(),
            "synthetic-outside-key"
        );
    }

    #[test]
    fn credential_file_symlinks_are_rejected_without_touching_the_target() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        store.prepare_directory(true).unwrap();
        let target = directory.path().join("outside-key");
        fs::write(&target, "synthetic-outside-key").unwrap();
        symlink(&target, store.key_path()).unwrap();

        assert_eq!(store.read_key().unwrap_err().kind, "credentials");
        assert_eq!(
            store.save_key("synthetic-new-key").unwrap_err().kind,
            "credentials"
        );
        assert_eq!(store.delete_key().unwrap_err().kind, "credentials");
        assert_eq!(fs::read_to_string(target).unwrap(), "synthetic-outside-key");
        assert!(fs::symlink_metadata(store.key_path())
            .unwrap()
            .file_type()
            .is_symlink());
    }

    #[test]
    fn nonregular_credential_locations_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        let store = LocalCredentialStore::new(directory.path());
        fs::write(&store.directory, "synthetic-blocking-file").unwrap();
        assert_eq!(store.read_key().unwrap_err().kind, "credentials");
        assert_eq!(
            store.save_key("synthetic-key").unwrap_err().kind,
            "credentials"
        );
        assert_eq!(store.delete_key().unwrap_err().kind, "credentials");

        fs::remove_file(&store.directory).unwrap();
        store.prepare_directory(true).unwrap();
        fs::create_dir(store.key_path()).unwrap();
        assert_eq!(store.read_key().unwrap_err().kind, "credentials");
        assert_eq!(
            store.save_key("synthetic-key").unwrap_err().kind,
            "credentials"
        );
        assert_eq!(store.delete_key().unwrap_err().kind, "credentials");
    }
}
