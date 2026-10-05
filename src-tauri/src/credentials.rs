use std::{
    path::Path,
    sync::{Arc, Mutex},
};

#[cfg(not(target_os = "macos"))]
use keyring::Entry;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

#[cfg(target_os = "macos")]
use crate::local_credentials::LocalCredentialStore as Backend;
#[cfg(not(target_os = "macos"))]
type Backend = NativeCredentialStore;

// Serialize credential operations so concurrent experiments and Settings
// changes cannot race. The key never crosses back into the webview.
#[derive(Clone)]
pub struct CredentialStore(Arc<Mutex<Backend>>);

impl CredentialStore {
    pub fn new(directory: &Path) -> Self {
        Self(Arc::new(Mutex::new(Backend::new(directory))))
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

#[derive(Serialize)]
pub struct Settings {
    pub credential_exists: bool,
    pub credential_storage: &'static str,
}

fn unavailable() -> AppError {
    AppError::new("credentials", "The API key storage is unavailable.")
}

#[cfg(not(target_os = "macos"))]
struct NativeCredentialStore;

#[cfg(not(target_os = "macos"))]
impl NativeCredentialStore {
    fn new(_directory: &Path) -> Self {
        Self
    }

    fn entry(&self) -> AppResult<Entry> {
        Entry::new("ai.jev.agent", "typesafe-api-key").map_err(|_| unavailable())
    }

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
                "local_file"
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

    #[cfg(target_os = "macos")]
    #[test]
    fn live_requests_use_the_local_saved_key() {
        let directory = tempfile::tempdir().unwrap();
        let store = CredentialStore::new(directory.path());
        tauri::async_runtime::block_on(async {
            assert_eq!(get_key(&store).await.unwrap_err().kind, "missing_api_key");
            store.save_key("test-only-api-key").unwrap();
            assert_eq!(get_key(&store).await.unwrap().as_str(), "test-only-api-key");
            store.save_key("replacement-test-key").unwrap();
            assert_eq!(
                get_key(&store).await.unwrap().as_str(),
                "replacement-test-key"
            );
            store.delete_key().unwrap();
            assert_eq!(get_key(&store).await.unwrap_err().kind, "missing_api_key");
        });
    }
}
