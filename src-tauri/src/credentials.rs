use std::{
    path::Path,
    sync::{Arc, Mutex},
};

use keyring::Entry;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

// Only the Rust backend holds the session copy. Dropping/replacing it wipes the
// owned buffers; it is never serialized to the webview or persisted by the app.
#[derive(Clone)]
pub struct CredentialStore(Arc<Mutex<CredentialSession<NativeCredentialStore>>>);

impl CredentialStore {
    pub fn new(directory: &Path) -> Self {
        Self(Arc::new(Mutex::new(CredentialSession::new(
            NativeCredentialStore,
            directory,
        ))))
    }

    fn read_key(&self) -> AppResult<Option<Zeroizing<String>>> {
        self.0.lock().map_err(|_| unavailable())?.read_key()
    }

    fn save_key(&self, key: &str) -> AppResult<()> {
        self.0.lock().map_err(|_| unavailable())?.save_key(key)
    }

    fn delete_key(&self) -> AppResult<()> {
        self.0.lock().map_err(|_| unavailable())?.delete_key()
    }
}

trait SecureCredentials {
    fn read_key(&self) -> AppResult<Option<Zeroizing<String>>>;
    fn save_key(&self, key: &str) -> AppResult<()>;
    fn delete_key(&self) -> AppResult<()>;
}

struct CredentialSession<B> {
    backend: B,
    // None = not loaded; Some(None) = successfully checked, no saved key.
    cached: Option<Option<Zeroizing<String>>>,
    #[cfg(target_os = "macos")]
    legacy: crate::local_credentials::LocalCredentialStore,
}

impl<B: SecureCredentials> CredentialSession<B> {
    fn new(backend: B, _directory: &Path) -> Self {
        Self {
            backend,
            cached: None,
            #[cfg(target_os = "macos")]
            legacy: crate::local_credentials::LocalCredentialStore::new(_directory),
        }
    }

    fn read_key(&mut self) -> AppResult<Option<Zeroizing<String>>> {
        if let Some(cached) = &self.cached {
            return Ok(cached.clone());
        }
        #[cfg(target_os = "macos")]
        if let Some(key) = self.legacy.read_key()? {
            // The local file is the most recently saved key. Never fall back to
            // using plaintext if secure storage or verification fails.
            self.save_key(&key)?;
            return Ok(self.cached.as_ref().and_then(Clone::clone));
        }
        let key = self.backend.read_key()?;
        self.cached = Some(key.clone());
        Ok(key)
    }

    fn save_key(&mut self, key: &str) -> AppResult<()> {
        self.cached = None;
        self.backend.save_key(key)?;
        let verified = self.backend.read_key()?;
        if verified.as_deref().map(String::as_str) != Some(key) {
            return Err(AppError::new("credentials", "The saved API key could not be verified in the OS credential store. The previous local file has been kept. Try saving again in Settings."));
        }
        #[cfg(target_os = "macos")]
        self.legacy.delete_key().map_err(|_| AppError::new(
            "credentials",
            "The API key is in Keychain, but its old plaintext file could not be removed. Check your application data directory permissions and retry in Settings.",
        ))?;
        self.cached = Some(verified);
        Ok(())
    }

    fn delete_key(&mut self) -> AppResult<()> {
        self.cached = None;
        // Remove the legacy source first so it cannot restore a deleted key.
        #[cfg(target_os = "macos")]
        self.legacy.delete_key()?;
        self.backend.delete_key()?;
        self.cached = Some(None);
        Ok(())
    }
}

#[derive(Serialize)]
pub struct Settings {
    pub credential_exists: bool,
    pub credential_storage: &'static str,
}

fn unavailable() -> AppError {
    AppError::new("credentials", "The API key storage is unavailable.")
}

struct NativeCredentialStore;

impl NativeCredentialStore {
    fn entry(&self) -> AppResult<Entry> {
        Entry::new("ai.jev.agent", "typesafe-api-key").map_err(|_| unavailable())
    }
}

impl SecureCredentials for NativeCredentialStore {
    fn read_key(&self) -> AppResult<Option<Zeroizing<String>>> {
        match self.entry()?.get_password() {
            Ok(key) => Ok(Some(Zeroizing::new(key))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(AppError::new(
                "credentials",
                "The OS credential store could not be read. Check that it is unlocked.",
            )),
        }
    }

    fn save_key(&self, key: &str) -> AppResult<()> {
        self.entry()?.set_password(key).map_err(|_| {
            AppError::new(
                "credentials",
                "The API key could not be saved in the OS credential store.",
            )
        })
    }

    fn delete_key(&self) -> AppResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(AppError::new(
                "credentials",
                "The API key could not be removed from the OS credential store.",
            )),
        }
    }
}

// Keep file I/O and any native credential authorization off the event loop
// and the asynchronous runtime workers.
async fn credential_task<T: Send + 'static>(
    operation: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|_| unavailable())?
}

pub async fn get_key(store: &CredentialStore) -> AppResult<Zeroizing<String>> {
    let store = store.clone();
    credential_task(move || {
        store
            .read_key()?
            .filter(|key| !key.is_empty())
            .ok_or_else(|| {
                AppError::new(
                    "missing_api_key",
                    "Add your TypeSafe API key in Settings to run a live evaluation.",
                )
            })
    })
    .await
}

#[tauri::command]
pub async fn get_settings(store: State<'_, CredentialStore>) -> AppResult<Settings> {
    let store = store.inner().clone();
    credential_task(move || {
        Ok(Settings {
            credential_exists: store.read_key()?.is_some_and(|key| !key.is_empty()),
            credential_storage: if cfg!(target_os = "macos") {
                "keychain"
            } else {
                "os_store"
            },
        })
    })
    .await
}

fn validated_key(api_key: String) -> AppResult<Zeroizing<String>> {
    let key = Zeroizing::new(api_key);
    let trimmed = key.trim();
    if trimmed.is_empty() || trimmed.len() > 4096 || !trimmed.bytes().all(|b| b.is_ascii_graphic())
    {
        return Err(AppError::new(
            "invalid_api_key",
            "Enter an API key with no spaces or line breaks.",
        ));
    }
    Ok(key)
}

#[tauri::command]
pub async fn save_api_key(store: State<'_, CredentialStore>, api_key: String) -> AppResult<()> {
    let key = validated_key(api_key)?;
    let store = store.inner().clone();
    credential_task(move || store.save_key(key.trim())).await
}

#[tauri::command]
pub async fn delete_api_key(store: State<'_, CredentialStore>) -> AppResult<()> {
    let store = store.inner().clone();
    credential_task(move || store.delete_key()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credential_work_does_not_run_on_the_invoking_thread() {
        let caller = std::thread::current().id();
        let worker =
            tauri::async_runtime::block_on(credential_task(|| Ok(std::thread::current().id())))
                .unwrap();
        assert_ne!(caller, worker);
    }

    #[test]
    fn invalid_keys_are_rejected_without_accessing_the_credential_store() {
        for invalid in [
            "".into(),
            " \n ".into(),
            "a b".into(),
            "a\tb".into(),
            "x".repeat(4097),
        ] {
            let error = validated_key(invalid).unwrap_err();
            assert_eq!(error.kind, "invalid_api_key");
            assert_eq!(
                error.message,
                "Enter an API key with no spaces or line breaks."
            );
        }
    }

    use std::cell::{Cell, RefCell};

    #[derive(Default)]
    struct FakeSecureStore {
        key: RefCell<Option<Zeroizing<String>>>,
        reads: Cell<usize>,
        fail_read: Cell<bool>,
        fail_write: Cell<bool>,
        fail_delete: Cell<bool>,
        discard_write: Cell<bool>,
    }

    impl SecureCredentials for FakeSecureStore {
        fn read_key(&self) -> AppResult<Option<Zeroizing<String>>> {
            self.reads.set(self.reads.get() + 1);
            if self.fail_read.get() {
                return Err(unavailable());
            }
            Ok(self.key.borrow().clone())
        }
        fn save_key(&self, key: &str) -> AppResult<()> {
            if self.fail_write.get() {
                return Err(unavailable());
            }
            if !self.discard_write.get() {
                *self.key.borrow_mut() = Some(Zeroizing::new(key.to_owned()));
            }
            Ok(())
        }
        fn delete_key(&self) -> AppResult<()> {
            if self.fail_delete.get() {
                return Err(unavailable());
            }
            *self.key.borrow_mut() = None;
            Ok(())
        }
    }

    #[test]
    fn requests_reuse_one_secure_read_per_session() {
        let dir = tempfile::tempdir().unwrap();
        let backend = FakeSecureStore::default();
        backend.save_key("synthetic-key").unwrap();
        let mut session = CredentialSession::new(backend, dir.path());
        for _ in 0..20 {
            assert_eq!(
                session.read_key().unwrap().unwrap().as_str(),
                "synthetic-key"
            );
        }
        assert_eq!(session.backend.reads.get(), 1);
        let mut reopened = CredentialSession::new(session.backend, dir.path());
        reopened.read_key().unwrap();
        assert_eq!(reopened.backend.reads.get(), 2);
    }

    #[test]
    fn missing_key_is_cached_and_saving_and_removing_update_cache() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        assert!(session.read_key().unwrap().is_none());
        assert!(session.read_key().unwrap().is_none());
        assert_eq!(session.backend.reads.get(), 1);
        session.save_key("synthetic-key").unwrap();
        assert_eq!(
            session.read_key().unwrap().unwrap().as_str(),
            "synthetic-key"
        );
        assert_eq!(session.backend.reads.get(), 2);
        session.save_key("replacement-key").unwrap();
        assert_eq!(
            session.read_key().unwrap().unwrap().as_str(),
            "replacement-key"
        );
        session.delete_key().unwrap();
        assert!(session.read_key().unwrap().is_none());
        assert!(session.backend.key.borrow().is_none());
        assert_eq!(session.backend.reads.get(), 3);
    }

    #[test]
    fn denied_access_can_be_retried_without_caching_failure() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        session.backend.fail_read.set(true);
        assert!(session.read_key().is_err());
        assert!(session.cached.is_none());
        session.backend.fail_read.set(false);
        session.backend.save_key("synthetic-key").unwrap();
        assert_eq!(
            session.read_key().unwrap().unwrap().as_str(),
            "synthetic-key"
        );
    }

    #[test]
    fn failed_mutations_clear_the_session_copy() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        session.save_key("synthetic-key").unwrap();
        session.backend.fail_write.set(true);
        assert!(session.save_key("replacement-key").is_err());
        assert!(session.cached.is_none());
        session.read_key().unwrap();
        session.backend.fail_delete.set(true);
        assert!(session.delete_key().is_err());
        assert!(session.cached.is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn migration_verifies_the_latest_key_then_removes_plaintext() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        session.backend.save_key("old-keychain-key").unwrap();
        session.legacy.save_key("latest-local-key").unwrap();
        assert_eq!(
            session.read_key().unwrap().unwrap().as_str(),
            "latest-local-key"
        );
        assert!(session.legacy.read_key().unwrap().is_none());
        assert_eq!(
            session.backend.key.borrow().as_ref().unwrap().as_str(),
            "latest-local-key"
        );
        session.read_key().unwrap();
        assert_eq!(session.backend.reads.get(), 1);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn migration_failures_preserve_plaintext_and_never_use_it_as_fallback() {
        for failure in ["write", "read", "verification"] {
            let dir = tempfile::tempdir().unwrap();
            let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
            session.legacy.save_key("synthetic-key").unwrap();
            session.backend.fail_write.set(failure == "write");
            session.backend.fail_read.set(failure == "read");
            session.backend.discard_write.set(failure == "verification");
            assert!(session.read_key().is_err());
            assert!(session.cached.is_none());
            assert_eq!(
                session.legacy.read_key().unwrap().unwrap().as_str(),
                "synthetic-key"
            );
            session.backend.fail_write.set(false);
            session.backend.fail_read.set(false);
            session.backend.discard_write.set(false);
            assert_eq!(
                session.read_key().unwrap().unwrap().as_str(),
                "synthetic-key"
            );
            assert!(session.legacy.read_key().unwrap().is_none());
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn removal_also_removes_unmigrated_file() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        session.legacy.save_key("synthetic-key").unwrap();
        session.delete_key().unwrap();
        assert!(session.legacy.read_key().unwrap().is_none());
        assert!(session.read_key().unwrap().is_none());
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn plaintext_cleanup_failure_is_reported_without_caching_success() {
        let dir = tempfile::tempdir().unwrap();
        let mut session = CredentialSession::new(FakeSecureStore::default(), dir.path());
        // A non-regular legacy location must not be removed or silently ignored.
        std::fs::create_dir_all(dir.path().join("credentials/typesafe-api-key")).unwrap();
        let error = session.save_key("synthetic-key").unwrap_err();
        assert!(error
            .message
            .contains("old plaintext file could not be removed"));
        assert!(session.cached.is_none());
        assert_eq!(
            session.backend.key.borrow().as_ref().unwrap().as_str(),
            "synthetic-key"
        );
    }
}
