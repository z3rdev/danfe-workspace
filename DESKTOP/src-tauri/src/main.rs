#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[tauri::command]
fn open_output_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Nao foi possivel abrir a pasta: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("A abertura da pasta esta disponivel no Windows.".to_string())
    }
}

#[tauri::command]
fn reveal_output_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let file_path = std::path::Path::new(&path);
        if !file_path.is_file() {
            return Err("Arquivo nao encontrado no computador.".to_string());
        }

        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", file_path.display()))
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Nao foi possivel localizar o arquivo: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        Err("A localizacao do arquivo esta disponivel no Windows.".to_string())
    }
}

mod tray_icon_image;
mod downloads;

#[tauri::command]
fn save_output_download(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let directory = app.path().download_dir()
        .map_err(|error| format!("Nao foi possivel localizar Downloads: {error}"))?;
    downloads::save_pdf(std::path::Path::new(&path), &directory)
        .map(|saved| saved.to_string_lossy().into_owned())
}

#[cfg(windows)]
fn apply_rounded_corners(hwnd: windows::Win32::Foundation::HWND) {
    use std::ffi::c_void;
    use windows::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_COLOR_NONE,
        DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
    };
    use windows::Win32::Graphics::Gdi::{CreateRoundRectRgn, SetWindowRgn};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

    unsafe {
        let corner_preference = DWMWCP_DONOTROUND;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE,
            &corner_preference as *const _ as *const c_void,
            std::mem::size_of_val(&corner_preference) as u32,
        );

        let border_color = DWMWA_COLOR_NONE;
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR,
            &border_color as *const _ as *const c_void,
            std::mem::size_of_val(&border_color) as u32,
        );

        // SetWindowRgn works in window coordinates. Use the complete native
        // window size so the outer frame cannot remain square around the UI.
        let mut rect = windows::Win32::Foundation::RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_ok() {
            let width = (rect.right - rect.left).max(1);
            let height = (rect.bottom - rect.top).max(1);
            let region = CreateRoundRectRgn(0, 0, width + 1, height + 1, 16, 16);
            if !region.0.is_null() {
                // O Windows assume a posse da regiao depois de SetWindowRgn.
                let _ = SetWindowRgn(hwnd, Some(region), true);
            }
        }
    }
}

#[cfg(windows)]
fn remove_native_decorations(hwnd: windows::Win32::Foundation::HWND) -> tauri::Result<()> {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_STYLE, SWP_FRAMECHANGED,
        SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_CAPTION, WS_MAXIMIZEBOX, WS_MINIMIZEBOX,
        WS_SYSMENU, WS_THICKFRAME,
    };

    let style_mask = (WS_CAPTION.0
        | WS_THICKFRAME.0
        | WS_SYSMENU.0
        | WS_MINIMIZEBOX.0
        | WS_MAXIMIZEBOX.0) as isize;

    unsafe {
        let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
        SetWindowLongPtrW(hwnd, GWL_STYLE, style & !style_mask);
        let _ = SetWindowPos(
            hwnd,
            None,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
        );
    }

    apply_rounded_corners(hwnd);

    Ok(())
}

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        // Impede duas janelas/processos do DANFE e devolve o foco para a
        // instancia existente quando o executavel e aberto novamente.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![open_output_folder, reveal_output_file, save_output_download])
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "open", "Abrir DANFE", true, None::<&str>)?;
            let exit_item = MenuItem::with_id(app, "exit", "Encerrar", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&open_item, &exit_item])?;
            let tray_icon = Image::new(tray_icon_image::RGBA, 16, 16);

            TrayIconBuilder::with_id("danfe-tray")
                .icon(tray_icon)
                .tooltip("DANFE Workspace")
                .menu(&tray_menu)
                // O menu tambem aparece com clique esquerdo para deixar
                // "Encerrar" acessivel sem depender do botao direito.
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => show_main_window(app),
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                #[cfg(windows)]
                {
                    // The config flag is not enough on every Windows/Tauri
                    // combination; maximize before removing the native frame.
                    window.maximize()?;
                    let hwnd = window.hwnd()?;
                    remove_native_decorations(hwnd)?;
                    apply_rounded_corners(hwnd);

                    let hwnd_value = hwnd.0 as usize;
                    std::thread::spawn(move || {
                        std::thread::sleep(std::time::Duration::from_millis(120));
                        let hwnd = windows::Win32::Foundation::HWND(hwnd_value as *mut std::ffi::c_void);
                        apply_rounded_corners(hwnd);
                    });
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                tauri::WindowEvent::Resized(_) => {
                    #[cfg(windows)]
                    if window.is_minimized().unwrap_or(false) {
                        let _ = window.hide();
                    } else if let Ok(hwnd) = window.hwnd() {
                        apply_rounded_corners(hwnd);
                    }
                }
                tauri::WindowEvent::Focused(true) => {
                    #[cfg(windows)]
                    if let Ok(hwnd) = window.hwnd() {
                        apply_rounded_corners(hwnd);
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o aplicativo DANFE");
}
