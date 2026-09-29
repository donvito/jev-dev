mod client;
mod credentials;
mod error;
mod native;
mod storage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let database = storage::Database::open(&directory.join("jev-agent.sqlite3"))?;
            app.manage(database);
            app.manage(client::ApiClient::new()?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials::get_settings,
            credentials::save_api_key,
            credentials::delete_api_key,
            storage::load_workspace,
            storage::save_workspace,
            storage::list_runs,
            storage::save_run,
            client::execute_request,
            native::save_export,
            native::open_documentation,
        ])
        .run(tauri::generate_context!())
        .expect("jev dev could not start its desktop runtime");
}
