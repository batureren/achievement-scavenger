// lib.rs ---
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use reqwest;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

pub struct DiscordState {
    tx: Mutex<mpsc::Sender<RpcCommand>>,
}

#[derive(Clone)]
pub enum RpcCommand {
    Update {
        game_name: String,
        unlocked: u32,
        total: u32,
        hunting: String,
    },
    Clear,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn spawn_discord_thread(rx: mpsc::Receiver<RpcCommand>) {
    std::thread::spawn(move || {
        let mut client = DiscordIpcClient::new("1516543215178617072").unwrap();
        let mut connected = false;

        for cmd in rx {
            if !connected {
                if client.connect().is_ok() {
                    connected = true;
                }
            }

            if !connected {
                continue;
            }

            match cmd {
                RpcCommand::Update {
                    game_name,
                    unlocked,
                    total,
                    hunting,
                } => {
                    let pct = if total > 0 {
                        (unlocked as f32 / total as f32 * 100.0) as u32
                    } else {
                        0
                    };

                    let details = format!("🏆 {}", game_name);

                    let state = if !hunting.is_empty() {
                        format!("⭐ Hunting: \"{}\" ({}%)", hunting, pct)
                    } else {
                        format!("📊 {} / {} Achievements ({}%)", unlocked, total, pct)
                    };

                    let payload = activity::Activity::new().details(&details).state(&state);

                    if client.set_activity(payload).is_err() {
                        connected = false;
                        let _ = client.close();
                    }
                }
                RpcCommand::Clear => {
                    if client.clear_activity().is_err() {
                        connected = false;
                        let _ = client.close();
                    }
                }
            }
        }
    });
}

#[tauri::command]
async fn take_unlock_screenshot(
    app_handle: tauri::AppHandle,
    game_name: String,
    ach_title: String,
    ach_icon_url: String,
) -> Result<String, String> {
    let mut icon_img_opt = None;
    if let Ok(response) = reqwest::get(&ach_icon_url).await {
        if let Ok(bytes) = response.bytes().await {
            if let Ok(img) = image::load_from_memory(&bytes) {
                icon_img_opt = Some(img);
            }
        }
    }

    let window = app_handle.get_webview_window("main");
    let was_visible = if let Some(ref w) = window {
        let vis = w.is_visible().unwrap_or(false);
        if vis {
            let _ = w.hide();
            std::thread::sleep(std::time::Duration::from_millis(150));
        }
        vis
    } else {
        false
    };

    let app_handle_clone = app_handle.clone();
    let capture_result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let primary = monitors
            .into_iter()
            .find(|m| m.is_primary())
            .ok_or("No primary monitor found")?;

        let mut screen_img = primary.capture_image().map_err(|e| e.to_string())?;

        if let Some(icon_img) = icon_img_opt {
            let icon_resized =
                image::imageops::resize(&icon_img, 96, 96, image::imageops::FilterType::Lanczos3);
            let x = 20;
            let y = screen_img
                .height()
                .saturating_sub(icon_resized.height() + 20);
            image::imageops::overlay(&mut screen_img, &icon_resized, x as i64, y as i64);
        }

        let safe_game_name = game_name.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");
        let safe_ach_name = ach_title.replace(|c: char| !c.is_alphanumeric() && c != ' ', "_");

        let mut path = app_handle_clone
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        path.push("Screenshots");
        path.push(&safe_game_name);
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;

        let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
        path.push(format!("{}_{}.png", safe_ach_name, timestamp));

        screen_img.save(&path).map_err(|e| e.to_string())?;

        Ok(path.to_string_lossy().to_string())
    })
    .await;

    if was_visible {
        if let Some(ref w) = window {
            let _ = w.show();
        }
    }

    match capture_result {
        Ok(inner_result) => inner_result,
        Err(e) => Err(format!("Thread error: {}", e)),
    }
}

#[tauri::command]
fn open_screenshots_folder(app_handle: tauri::AppHandle) -> Result<(), String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    path.push("Screenshots");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("explorer")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn update_discord_rpc(
    game_name: String,
    unlocked: u32,
    total: u32,
    hunting: String,
    state: tauri::State<DiscordState>,
) {
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.send(RpcCommand::Update {
            game_name,
            unlocked,
            total,
            hunting,
        });
    }
}

#[tauri::command]
fn clear_discord_rpc(state: tauri::State<DiscordState>) {
    if let Ok(tx) = state.tx.lock() {
        let _ = tx.send(RpcCommand::Clear);
    }
}

fn get_data_path(app_handle: &tauri::AppHandle, filename: &str) -> Result<PathBuf, String> {
    let mut path = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(filename);
    Ok(path)
}

fn is_valid_json(data: &str) -> bool {
    !data.trim().is_empty() && serde_json::from_str::<Value>(data).is_ok()
}

fn read_json_with_fallback(path: &PathBuf) -> String {
    if let Ok(data) = fs::read_to_string(path) {
        if is_valid_json(&data) {
            return data;
        }
    }
    let backup_path = PathBuf::from(format!("{}.bak", path.to_string_lossy()));
    if let Ok(data) = fs::read_to_string(&backup_path) {
        if is_valid_json(&data) {
            return data;
        }
    }
    "{}".to_string()
}

fn write_json_atomic(path: &PathBuf, data: &str) -> Result<(), String> {
    if !is_valid_json(data) {
        return Err("Refusing to save invalid JSON".to_string());
    }
    if let Ok(existing) = fs::read_to_string(path) {
        if is_valid_json(&existing) {
            let backup_path = PathBuf::from(format!("{}.bak", path.to_string_lossy()));
            let _ = fs::write(backup_path, &existing);
        }
    }
    let tmp_path = PathBuf::from(format!("{}.tmp", path.to_string_lossy()));
    fs::write(&tmp_path, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_file_dialog(filename: String, content: String) -> Result<String, String> {
    if let Some(file_path) = rfd::AsyncFileDialog::new()
        .set_file_name(&filename)
        .save_file()
        .await
    {
        fs::write(file_path.path(), content).map_err(|e| e.to_string())?;
        Ok(file_path.path().to_string_lossy().to_string())
    } else {
        Err("Cancelled by user".to_string())
    }
}

#[tauri::command]
fn set_custom_window_size(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_window_mode(app_handle: tauri::AppHandle, mode: String) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    match mode.as_str() {
        "WINDOWED" => {
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            window.set_decorations(true).map_err(|e| e.to_string())?;
            window.unmaximize().map_err(|e| e.to_string())?;
        }
        "BORDERLESS" => {
            window.set_fullscreen(false).map_err(|e| e.to_string())?;
            window.set_decorations(false).map_err(|e| e.to_string())?;
            window.maximize().map_err(|e| e.to_string())?;
        }
        "FULLSCREEN" => {
            window.set_decorations(true).map_err(|e| e.to_string())?;
            window.set_fullscreen(true).map_err(|e| e.to_string())?;
        }
        _ => return Err("Invalid window mode".to_string()),
    }
    Ok(())
}

#[tauri::command]
#[allow(unused_variables)]
fn launch_steam_game(app_id: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", &format!("steam://rungameid/{}", app_id)])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_always_on_top(app_handle: tauri::AppHandle, value: bool) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(unused_variables)]
fn set_window_opacity(app_handle: tauri::AppHandle, opacity: f32) -> Result<(), String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    #[cfg(target_os = "windows")]
    {
        mod ffi {
            #[link(name = "user32")]
            extern "system" {
                pub fn GetWindowLongA(hWnd: isize, nIndex: i32) -> i32;
                pub fn SetWindowLongA(hWnd: isize, nIndex: i32, dwNewLong: i32) -> i32;
                pub fn SetLayeredWindowAttributes(
                    hwnd: isize,
                    crKey: u32,
                    bAlpha: u8,
                    dwFlags: u32,
                ) -> i32;
            }
        }
        if let Ok(hwnd) = window.hwnd() {
            let hwnd_isize = hwnd.0 as isize;
            unsafe {
                const GWL_EXSTYLE: i32 = -20;
                const WS_EX_LAYERED: i32 = 0x00080000;
                const LWA_ALPHA: u32 = 0x00000002;
                let ex_style = ffi::GetWindowLongA(hwnd_isize, GWL_EXSTYLE);
                ffi::SetWindowLongA(hwnd_isize, GWL_EXSTYLE, ex_style | WS_EX_LAYERED);
                let alpha = (opacity.clamp(0.0, 1.0) * 255.0) as u8;
                ffi::SetLayeredWindowAttributes(hwnd_isize, 0, alpha, LWA_ALPHA);
            }
        }
    }
    Ok(())
}

// --- Persistence ---
#[tauri::command]
fn load_api_key(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "api_key.txt")?;
    match fs::read_to_string(path) {
        Ok(key) => Ok(key.trim().to_string()),
        Err(_) => Ok("".to_string()),
    }
}
#[tauri::command]
fn save_api_key(app_handle: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "api_key.txt")?;
    fs::write(path, key.trim()).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_ra_credentials(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "ra_creds.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_ra_credentials(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "ra_creds.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_xbox_credentials(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "xbox_creds.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_xbox_credentials(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "xbox_creds.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_psn_credentials(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "psn_creds.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_psn_credentials(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "psn_creds.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}

// --- PlayStation Network API ---
#[tauri::command]
async fn authenticate_psn(npsso: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client build error: {}", e))?;

    let auth_url = "https://ca.account.sony.com/api/authz/v3/oauth/authorize";
    let res = client.get(auth_url)
        .query(&[
            ("access_type", "offline"),
            ("client_id", "09515159-7237-4370-9b40-3806e67c0891"),
            ("redirect_uri", "com.scee.psxandroid.scecompcall://redirect"),
            ("response_type", "code"),
            ("scope", "psn:mobile.v2.core psn:clientapp")
        ])
        .header("Cookie", format!("npsso={}", npsso.trim()))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = res.status();

    if status.is_client_error() || status.is_server_error() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("Sony rejected the auth request ({}). Details: {}", status, err_body));
    }

    let location = res.headers().get("location")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("No redirect location found. HTTP Status: {}", status))?;

    let code = location.split("code=").nth(1).and_then(|s| s.split('&').next())
        .ok_or_else(|| format!("No code found. NPSSO might be expired. Redirected to: {}", location))?;

    let token_url = "https://ca.account.sony.com/api/authz/v3/oauth/token";
    let mut params = std::collections::HashMap::new();
    params.insert("code", code);
    params.insert("grant_type", "authorization_code");
    params.insert("redirect_uri", "com.scee.psxandroid.scecompcall://redirect");
    params.insert("token_format", "jwt");

    let token_res = client.post(token_url)
        .header("Authorization", "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if !token_res.status().is_success() {
        let err_body = token_res.text().await.unwrap_or_default();
        return Err(format!("Failed to get access token: {}", err_body));
    }

    let token_json: serde_json::Value = token_res.json().await.map_err(|e| format!("Failed to parse token JSON: {}", e))?;
    let access_token = token_json["access_token"].as_str().ok_or("No access token returned in JSON.")?;
    let refresh_token = token_json["refresh_token"].as_str().unwrap_or("");
    let expires_in = token_json["expires_in"].as_u64().unwrap_or(3600);
    let expires_at = now_millis() + expires_in.saturating_mul(1000);

    Ok(serde_json::json!({
        "accessToken": access_token,
        "accountId": "me",
        "refreshToken": refresh_token,
        "expiresAt": expires_at
    }).to_string())
}

#[tauri::command]
async fn refresh_psn_token(refresh_token: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| format!("Client build error: {}", e))?;

    let token_url = "https://ca.account.sony.com/api/authz/v3/oauth/token";
    let trimmed_refresh = refresh_token.trim();
    let mut params = std::collections::HashMap::new();
    params.insert("refresh_token", trimmed_refresh);
    params.insert("grant_type", "refresh_token");
    params.insert("scope", "psn:mobile.v2.core psn:clientapp");
    params.insert("token_format", "jwt");

    let token_res = client.post(token_url)
        .header("Authorization", "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=")
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    if !token_res.status().is_success() {
        let err_body = token_res.text().await.unwrap_or_default();
        return Err(format!("Failed to refresh access token: {}", err_body));
    }

    let token_json: serde_json::Value = token_res.json().await.map_err(|e| format!("Failed to parse refresh token JSON: {}", e))?;
    let access_token = token_json["access_token"].as_str().ok_or("No access token returned in refresh response.")?;
    let new_refresh_token = token_json["refresh_token"].as_str().unwrap_or(trimmed_refresh);
    let expires_in = token_json["expires_in"].as_u64().unwrap_or(3600);
    let expires_at = now_millis() + expires_in.saturating_mul(1000);

    Ok(serde_json::json!({
        "accessToken": access_token,
        "accountId": "me",
        "refreshToken": new_refresh_token,
        "expiresAt": expires_at
    }).to_string())
}

#[tauri::command]
async fn get_psn_recent_games(
    access_token: String,
    account_id: String,
    limit: Option<u32>,
    offset: Option<u32>,
) -> Result<String, String> {
    let client = reqwest::Client::new();
    let limit = limit.unwrap_or(10);
    let offset = offset.unwrap_or(0);
    let url = format!(
        "https://m.np.playstation.com/api/trophy/v1/users/{}/trophyTitles?limit={}&offset={}",
        account_id, limit, offset
    );
    let res = client.get(&url).header("Authorization", format!("Bearer {}", access_token)).send().await.map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok("{\"error\": \"INVALID_TOKEN\"}".to_string());
    }
    if !res.status().is_success() { return Ok("{\"error\": \"API_ERROR\"}".to_string()); }

    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

async fn fetch_for_service(
    client: &reqwest::Client,
    access_token: &str,
    account_id: &str,
    np_communication_id: &str,
    service: &str,
) -> (serde_json::Value, serde_json::Value, bool) {
    let mut unauthorized = false;

    let schema_url = format!(
        "https://m.np.playstation.com/api/trophy/v1/npCommunicationIds/{}/trophyGroups/all/trophies?npServiceName={}",
        np_communication_id, service
    );
    let schema_json = match client.get(&schema_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send().await
    {
        Ok(res) => {
            if res.status() == reqwest::StatusCode::UNAUTHORIZED { unauthorized = true; }
            res.json::<serde_json::Value>().await.unwrap_or(serde_json::json!({}))
        }
        Err(_) => serde_json::json!({}),
    };

    let progress_url = format!(
        "https://m.np.playstation.com/api/trophy/v1/users/{}/npCommunicationIds/{}/trophyGroups/all/trophies?npServiceName={}",
        account_id, np_communication_id, service
    );
    let progress_json = match client.get(&progress_url)
        .header("Authorization", format!("Bearer {}", access_token))
        .send().await
    {
        Ok(res) => {
            if res.status() == reqwest::StatusCode::UNAUTHORIZED { unauthorized = true; }
            res.json::<serde_json::Value>().await.unwrap_or(serde_json::json!({}))
        }
        Err(_) => serde_json::json!({}),
    };

    (schema_json, progress_json, unauthorized)
}

#[tauri::command]
async fn get_psn_trophies(access_token: String, account_id: String, np_communication_id: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let (mut schema_json, mut progress_json, mut unauthorized) =
        fetch_for_service(&client, &access_token, &account_id, &np_communication_id, "trophy2").await;

    let has_trophies = schema_json.get("trophies")
        .and_then(|t| t.as_array())
        .map(|a| !a.is_empty())
        .unwrap_or(false);

    if !has_trophies {
        let (fb_schema, fb_progress, fb_unauthorized) =
            fetch_for_service(&client, &access_token, &account_id, &np_communication_id, "trophy").await;
        unauthorized = unauthorized || fb_unauthorized;
        let fb_has_trophies = fb_schema.get("trophies")
            .and_then(|t| t.as_array())
            .map(|a| !a.is_empty())
            .unwrap_or(false);
        if fb_has_trophies {
            schema_json = fb_schema;
            progress_json = fb_progress;
        }
    }

    let mut payload = serde_json::json!({ "schema": schema_json, "progress": progress_json });
    if unauthorized {
        payload["error"] = serde_json::Value::String("INVALID_TOKEN".to_string());
    }

    Ok(payload.to_string())
}

#[tauri::command]
fn load_user_links(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "user_links.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("[]".to_string()),
    }
}
#[tauri::command]
fn save_user_links(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "user_links.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_tracked(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "tracked.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_tracked(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "tracked.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_local_edits(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "local_edits.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_local_edits(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "local_edits.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_settings(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "settings.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_settings(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "settings.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_history(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "history.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_history(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "history.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}
#[tauri::command]
fn load_chapters(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "chapters.json")?;
    match fs::read_to_string(path) {
        Ok(data) => Ok(data),
        Err(_) => Ok("{}".to_string()),
    }
}
#[tauri::command]
fn save_chapters(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "chapters.json")?;
    fs::write(path, data).map_err(|e| e.to_string())
}

// --- Steam Status ---
#[tauri::command]
fn get_local_steam_status() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use winreg::enums::*;
        use winreg::RegKey;

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let active_process = match hkcu.open_subkey("Software\\Valve\\Steam\\ActiveProcess") {
            Ok(k) => k,
            Err(e) => return Err(e.to_string()),
        };
        
        let active_user: u32 = active_process.get_value("ActiveUser").unwrap_or(0);
        if active_user == 0 {
            return Ok("NOT_LOGGED_IN".to_string());
        }
        
        let steam_id_64 = (active_user as u64) + 76561197960265728;
        let apps_key = match hkcu.open_subkey("Software\\Valve\\Steam\\Apps") {
            Ok(k) => k,
            Err(_) => return Ok(format!("|||{}", steam_id_64)),
        };
        
        let mut running_ids: Vec<String> = Vec::new();
        for subkey_name in apps_key.enum_keys().filter_map(|k| k.ok()) {
            let app_id: u32 = match subkey_name.parse() {
                Ok(id) => id,
                Err(_) => continue,
            };
                        
            if let Ok(app_subkey) = apps_key.open_subkey(&subkey_name) {
                let running: u32 = app_subkey.get_value("Running").unwrap_or(0);
                if running == 1 {
                    running_ids.push(app_id.to_string());
                }
            }
        }
        Ok(format!("{}|||{}", running_ids.join(","), steam_id_64))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok("NOT_LOGGED_IN".to_string())
    }
}

// --- Steam API ---
#[tauri::command]
async fn get_achievements(
    steam_id: String,
    app_id: String,
    api_key: String,
    lang: String,
) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let url = format!("http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid={}&key={}&steamid={}&l={}", app_id, api_key, steam_id, lang);
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("{\"error\": \"PRIVATE_PROFILE\"}".to_string());
    }
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.to_string())
}
#[tauri::command]
async fn get_game_schema(app_id: String, api_key: String, lang: String) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let url = format!(
        "http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key={}&appid={}&l={}",
        api_key, app_id, lang
    );
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("{\"error\": \"API_ERROR\"}".to_string());
    }
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.to_string())
}
#[tauri::command]
async fn get_global_achievement_percentages(app_id: String) -> Result<String, String> {
    let url = format!("http://api.steampowered.com/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid={}", app_id);
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("{}".to_string());
    }
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.to_string())
}
#[tauri::command]
async fn get_app_name(app_id: String, lang: String) -> Result<String, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}&filters=basic&l={}",
        app_id, lang
    );
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("".to_string());
    }
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    let name = json[&app_id]["data"]["name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    Ok(name)
}

#[tauri::command]
async fn get_steam_owned_games(steam_id: String, api_key: String) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let url = format!(
        "http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key={}&steamid={}&include_appinfo=true&include_played_free_games=true",
        api_key, steam_id
    );
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("{\"error\": \"API_ERROR\"}".to_string());
    }
    let json: Value = res.json().await.map_err(|e| e.to_string())?;
    Ok(json.to_string())
}

// --- RetroAchievements API ---
#[tauri::command]
async fn get_ra_recent_game(user: String, api_key: String, count: Option<u32>) -> Result<String, String> {
    let count = count.unwrap_or(1);
    let url = format!(
        "https://retroachievements.org/API/API_GetUserRecentlyPlayedGames.php?z={}&y={}&u={}&c={}",
        user, api_key, user, count
    );
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() { return Ok("[]".to_string()); }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn get_ra_achievements(
    user: String,
    api_key: String,
    game_id: String,
) -> Result<String, String> {
    let url = format!(
        "https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?z={}&y={}&u={}&g={}",
        user, api_key, user, game_id
    );
    let res = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Ok("{}".to_string());
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

// --- Xbox Live API (via OpenXBL) ---
const OPENXBL_BASE: &str = "https://xbl.io/api/v2";
fn openxbl_client(api_key: &str) -> Result<reqwest::Client, String> {
    use reqwest::header::{HeaderMap, HeaderValue};
    let mut headers = HeaderMap::new();
    let clean_key = api_key.trim();
    headers.insert(
        "X-Authorization",
        HeaderValue::from_str(clean_key).map_err(|e| e.to_string())?,
    );
    headers.insert("Accept", HeaderValue::from_static("application/json"));

    reqwest::Client::builder()
        .user_agent("Dalvik/2.1.0 (Linux; U; Android 13; SM-S918B Build/TP1A.220624.014)")
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn get_xbox_account(api_key: String) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let client = openxbl_client(&api_key)?;
    let url = format!("{}/account", OPENXBL_BASE);
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok("{\"error\": \"INVALID_KEY\"}".to_string());
    }
    if !res.status().is_success() {
        let status = res.status().as_u16();
        let body_text = res.text().await.unwrap_or_default();
        let snippet = if body_text.len() > 150 {
            format!("{}...", &body_text[..150])
        } else {
            body_text
        };
        let details = format!(
            "HTTP {} - {}",
            status,
            snippet.replace('\n', " ").replace('\r', "")
        );
        let error_json = serde_json::json!({ "error": "API_ERROR", "details": details });
        return Ok(error_json.to_string());
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}
#[tauri::command]
async fn get_xbox_recent_games(api_key: String, _xuid: String) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let client = openxbl_client(&api_key)?;
    let url = format!("{}/player/titleHistory", OPENXBL_BASE);
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok("{\"error\": \"INVALID_KEY\"}".to_string());
    }
    if !res.status().is_success() {
        return Ok("{\"titles\": []}".to_string());
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}
#[tauri::command]
async fn get_xbox_achievements(
    api_key: String,
    xuid: String,
    title_id: String,
) -> Result<String, String> {
    if api_key.is_empty() {
        return Ok("{\"error\": \"NO_API_KEY\"}".to_string());
    }
    let client = openxbl_client(&api_key)?;
    let url = format!("{}/achievements/player/{}/{}", OPENXBL_BASE, xuid, title_id);
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Ok("{\"error\": \"INVALID_KEY\"}".to_string());
    }
    if !res.status().is_success() {
        return Ok("{\"error\": \"API_ERROR\"}".to_string());
    }
    let text = res.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
fn get_window_size(app_handle: tauri::AppHandle) -> Result<String, String> {
    let window = app_handle
        .get_webview_window("main")
        .ok_or("Window not found")?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let logical_w = size.width as f64 / scale;
    let logical_h = size.height as f64 / scale;
    Ok(format!("{}x{}", logical_w as u32, logical_h as u32))
}
#[tauri::command]
async fn get_steam_header_image(app_id: String) -> Result<String, String> {
    let url = format!(
        "https://store.steampowered.com/api/appdetails?appids={}",
        app_id
    );
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json.get(&app_id)
        .and_then(|v| v.get("data"))
        .and_then(|v| v.get("header_image"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "No header image found".to_string())
}
#[tauri::command]
fn set_window_transparent(window: tauri::Window, transparent: bool) {
    let _ = window.set_decorations(!transparent);
    let _ = window.set_shadow(!transparent);
}

#[tauri::command]
fn load_checklists(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "checklists.json")?;
    Ok(read_json_with_fallback(&path))
}

#[tauri::command]
fn save_checklists(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "checklists.json")?;
    write_json_atomic(&path, &data)
}

#[tauri::command]
fn load_checklist_progress(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "checklist_progress.json")?;
    Ok(read_json_with_fallback(&path))
}

#[tauri::command]
fn save_checklist_progress(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "checklist_progress.json")?;
    write_json_atomic(&path, &data)
}

#[tauri::command]
fn load_game_links(app_handle: tauri::AppHandle) -> Result<String, String> {
    let path = get_data_path(&app_handle, "game_links.json")?;
    Ok(read_json_with_fallback(&path))
}
#[tauri::command]
fn save_game_links(app_handle: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = get_data_path(&app_handle, "game_links.json")?;
    write_json_atomic(&path, &data)
}

// --- Entry Point ---
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
    std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let (tx, rx) = mpsc::channel();
    spawn_discord_thread(rx);
    tauri::Builder::default()
        .manage(DiscordState { tx: Mutex::new(tx) })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, shortcut, event| {
                if event.state == ShortcutState::Pressed && shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyT) {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) { 
                            let _ = window.hide(); 
                        } else { 
                            let _ = window.show(); 
                            let _ = window.set_focus(); 
                        }
                    }
                }
            }).build())
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show Tracker", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Achievement Scavenger")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => std::process::exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        
        .invoke_handler(tauri::generate_handler![
            get_local_steam_status, get_achievements, get_steam_owned_games, 
            get_window_size, get_game_schema, get_global_achievement_percentages, get_app_name, launch_steam_game,
            set_always_on_top, set_window_opacity, load_settings, save_settings, load_api_key, save_api_key,
            load_user_links, save_user_links, load_tracked, save_tracked, load_local_edits, save_local_edits,
            load_chapters, save_chapters, save_file_dialog, load_history, save_history, set_custom_window_size,
            load_ra_credentials, save_ra_credentials, get_ra_recent_game, get_ra_achievements, set_window_mode, get_steam_header_image,
            load_xbox_credentials, save_xbox_credentials, get_xbox_account, get_xbox_recent_games, get_xbox_achievements, set_window_transparent,
            load_psn_credentials, save_psn_credentials, authenticate_psn, refresh_psn_token, get_psn_recent_games, get_psn_trophies,
            update_discord_rpc, clear_discord_rpc, take_unlock_screenshot, open_screenshots_folder,
            load_checklists, save_checklists, load_checklist_progress, save_checklist_progress, load_game_links, save_game_links
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}