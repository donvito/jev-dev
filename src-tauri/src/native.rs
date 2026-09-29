use crate::error::{AppError, AppResult};

/// A caller may suggest a filename, never a filesystem destination. Only the
/// path explicitly chosen in the native save dialog is written.
fn suggested_filename(filename: &str) -> String {
    let basename = filename.rsplit(['/', '\\']).next().unwrap_or("");
    let mut safe = String::new();
    for character in basename.chars() {
        let character = if character.is_control() || ":<>\"|?*".contains(character) {
            '_'
        } else {
            character
        };
        if safe.len() + character.len_utf8() > 180 {
            break;
        }
        safe.push(character);
    }
    let safe = safe.trim_matches(['.', ' ']);
    if safe.is_empty() {
        return "jev-export.json".into();
    }
    let stem = safe.split('.').next().unwrap_or("").to_ascii_uppercase();
    let reserved = matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|number| {
                matches!(number, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
        });
    if reserved {
        format!("export-{safe}")
    } else {
        safe.into()
    }
}

#[tauri::command]
pub async fn save_export(filename: String, contents: String) -> AppResult<bool> {
    let selected = rfd::AsyncFileDialog::new()
        .set_title("Export from jev dev")
        .set_file_name(suggested_filename(&filename))
        .save_file()
        .await;
    let Some(file) = selected else {
        return Ok(false);
    };
    file.write(contents.as_bytes()).await.map_err(|_| {
        AppError::new(
            "export",
            "The export could not be saved. Check the selected folder's permissions and available space.",
        )
    })?;
    Ok(true)
}

fn documentation_url(page: &str) -> AppResult<&'static str> {
    match page {
        "docs" => Ok("https://docs.typesafe.ai"),
        "keys" => Ok("https://console.typesafe.ai/settings/keys"),
        _ => Err(AppError::new(
            "validation",
            "Only the TypeSafe documentation and API key pages can be opened.",
        )),
    }
}

#[tauri::command]
pub async fn open_documentation(page: String) -> AppResult<()> {
    let url = documentation_url(&page)?;
    tauri::async_runtime::spawn_blocking(move || open::that(url))
        .await
        .map_err(|_| AppError::new("browser", "The default browser could not be opened."))?
        .map_err(|_| AppError::new("browser", "The default browser could not be opened."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_suggestions_never_contain_paths_or_reserved_names() {
        assert_eq!(suggested_filename("../../questions.json"), "questions.json");
        assert_eq!(suggested_filename("C:\\temp\\run.json"), "run.json");
        assert_eq!(suggested_filename("../.."), "jev-export.json");
        assert_eq!(suggested_filename("CON.json"), "export-CON.json");
        assert_eq!(suggested_filename("LPT9.txt"), "export-LPT9.txt");
        assert_eq!(suggested_filename("report?:1\n.json"), "report__1_.json");
        assert!(suggested_filename(&"実".repeat(200)).len() <= 180);
    }

    #[test]
    fn only_fixed_official_documentation_destinations_are_allowed() {
        assert_eq!(
            documentation_url("docs").unwrap(),
            "https://docs.typesafe.ai"
        );
        assert_eq!(
            documentation_url("keys").unwrap(),
            "https://console.typesafe.ai/settings/keys"
        );
        assert!(documentation_url("https://example.com").is_err());
        assert!(documentation_url("file:///tmp/anything").is_err());
    }
}
