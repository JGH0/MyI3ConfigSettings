// src-tauri/src/lib.rs
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
	.plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![set_executable])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn set_executable(path: String) -> Result<(), String> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(0o755); // rwxr-xr-x
    fs::set_permissions(&path, permissions).map_err(|e| e.to_string())?;
    Ok(())
}