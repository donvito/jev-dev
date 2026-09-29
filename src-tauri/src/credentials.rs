use keyring::Entry;
use serde::Serialize;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

const SERVICE: &str = "ai.jev.agent";
const ACCOUNT: &str = "typesafe-api-key";

#[derive(Serialize)]
pub struct Settings {
    pub credential_exists: bool,
}

fn entry() -> AppResult<Entry> {
    Entry::new(SERVICE, ACCOUNT)
        .map_err(|_| AppError::new("credentials", "The OS credential store is unavailable."))
}

pub fn get_key() -> AppResult<Zeroizing<String>> {
    match entry()?.get_password() {
        Ok(key) => Ok(Zeroizing::new(key)),
        Err(keyring::Error::NoEntry) => Err(AppError::new(
            "missing_api_key",
            "Add your TypeSafe API key in Settings to run a live evaluation.",
        )),
        Err(_) => Err(AppError::new(
            "credentials",
            "The OS credential store could not be read. Check that it is unlocked.",
        )),
    }
}

#[tauri::command]
pub fn get_settings() -> AppResult<Settings> {
    match entry()?.get_password() {
        Ok(key) => {
            let key = Zeroizing::new(key);
            Ok(Settings {
                credential_exists: !key.is_empty(),
            })
        }
        Err(keyring::Error::NoEntry) => Ok(Settings {
            credential_exists: false,
        }),
        Err(_) => Err(AppError::new(
            "credentials",
            "The OS credential store could not be read. Check that it is unlocked.",
        )),
    }
}

#[tauri::command]
pub fn save_api_key(api_key: String) -> AppResult<()> {
    let key = Zeroizing::new(api_key);
    let key = key.trim();
    if key.is_empty() || key.len() > 4096 || !key.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(AppError::new(
            "invalid_api_key",
            "Enter an API key with no spaces or line breaks.",
        ));
    }
    entry()?.set_password(key).map_err(|_| {
        AppError::new(
            "credentials",
            "The API key could not be saved in the OS credential store.",
        )
    })
}

#[tauri::command]
pub fn delete_api_key() -> AppResult<()> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(AppError::new(
            "credentials",
            "The API key could not be removed from the OS credential store.",
        )),
    }
}
