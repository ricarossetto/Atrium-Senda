//! Camada de biblioteca do ATRIUM Senda desktop (Tauri 2).
//! Sobe o servidor local (Node empacotado), espera a porta responder e abre a janela.

use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Estado gerenciado pelo Tauri: id do processo do servidor Node.
struct ServerChild(Mutex<Option<Child>>);

fn config_root() -> PathBuf {
    // %APPDATA%\ATRIUM — dados cifrados do escritório e logs do aplicativo.
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::temp_dir())
        .join("ATRIUM")
}

fn logs_dir() -> PathBuf {
    config_root().join("logs")
}

fn data_dir() -> PathBuf {
    config_root().join("data")
}

fn find_free_port() -> Option<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).ok()?;
    let port = listener.local_addr().ok()?.port();
    drop(listener);
    Some(port)
}

/// Verificação mínima de /api/health sem depender de cliente HTTP.
fn http_health_ok(port: u16) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let request = b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }
    let mut buf = [0u8; 512];
    let Ok(n) = stream.read(&mut buf) else {
        return false;
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.0 200") || head.starts_with("HTTP/1.1 200")
}

fn wait_for_server(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if http_health_ok(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

/// Copia a saída do servidor para o arquivo de log (uma linha por vez).
fn drain_to_log<R: Read + Send + 'static>(reader: R, label: &'static str) {
    let dir = logs_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("server.log");
    thread::spawn(move || {
        let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) else {
            return;
        };
        for line in BufReader::new(reader).lines() {
            match line {
                Ok(line) => {
                    let _ = writeln!(file, "[{}] {}", label, line);
                    let _ = file.flush();
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Diretório de recursos indisponível: {e}"))?;
    let node = resource_dir.join("node").join("node.exe");
    let app_dir = resource_dir.join("app");
    let server = app_dir.join("server.mjs");
    if !node.exists() {
        return Err(format!("Node empacotado não encontrado em {}", node.display()));
    }
    if !server.exists() {
        return Err(format!("Servidor empacotado não encontrado em {}", server.display()));
    }
    let _ = fs::create_dir_all(data_dir());
    let _ = fs::create_dir_all(logs_dir());

    let mut command = Command::new(&node);
    command
        .arg(&server)
        .current_dir(&app_dir)
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("JURISFLOW_DATA_DIR", data_dir())
        .env("KELLER_SKIP_COLLECTOR_ENV", "true")
        .env("COOKIE_SECURE", "false")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command
        .spawn()
        .map_err(|e| format!("Não foi possível iniciar o servidor local: {e}"))?;
    if let Some(stdout) = child.stdout.take() {
        drain_to_log(stdout, "out");
    }
    if let Some(stderr) = child.stderr.take() {
        drain_to_log(stderr, "err");
    }
    Ok(child)
}

fn kill_server(child: &mut Option<Child>) {
    if let Some(mut child) = child.take() {
        #[cfg(windows)]
        {
            // /T encerra a árvore: o servidor pode ter subprocessos (coletor, Chromium).
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(not(windows))]
        {
            let _ = child.kill();
        }
        let _ = child.wait();
    }
}

/// Verifica atualização uma vez por dia, em segundo plano. Falhas não bloqueiam o uso.
fn spawn_update_check(app: tauri::AppHandle) {
    thread::spawn(move || {
        let marker = config_root().join("update-check.txt");
        let due = fs::read_to_string(&marker)
            .ok()
            .map(|text| text.trim().parse::<u64>().unwrap_or(0))
            .map(|last| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs().saturating_sub(last) > 86_400)
                    .unwrap_or(true)
            })
            .unwrap_or(true);
        if !due {
            return;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            use tauri_plugin_updater::UpdaterExt;
            let result = async {
                let updater = app.updater()?;
                let update = updater.check().await?;
                if let Some(update) = update {
                    update.download_and_install(|_chunk, _total| {}, || {}).await?;
                    app.restart();
                }
                Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
            }
            .await;
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let _ = fs::write(&marker, now.to_string());
            if let Err(error) = result {
                let _ = fs::create_dir_all(logs_dir());
                let _ = fs::write(logs_dir().join("update-check.log"), format!("{error}"));
            }
        });
    });
}

pub fn run() {
    let port = match find_free_port() {
        Some(port) => port,
        None => {
            eprintln!("ATRIUM: não foi possível reservar uma porta local.");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerChild(Mutex::new(None)))
        .setup(move |app| {
            let handle = app.handle().clone();
            match spawn_server(&handle, port) {
                Ok(child) => {
                    if let Ok(mut guard) = app.state::<ServerChild>().0.lock() {
                        *guard = Some(child);
                    }
                }
                Err(message) => {
                    let _ = fs::create_dir_all(logs_dir());
                    let _ = fs::write(logs_dir().join("startup-error.log"), &message);
                    eprintln!("ATRIUM: {message}");
                    std::process::exit(1);
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                thread::spawn(move || {
                    let ready = wait_for_server(port, Duration::from_secs(90));
                    if ready {
                        let url = format!("http://127.0.0.1:{port}/");
                        if let Ok(url) = tauri::Url::parse(&url) {
                            let _ = window.navigate(url);
                        }
                    } else {
                        let _ = fs::create_dir_all(logs_dir());
                        let _ = fs::write(
                            logs_dir().join("startup-error.log"),
                            "O servidor local não respondeu /api/health em 90 segundos.",
                        );
                        eprintln!("ATRIUM: o servidor local não respondeu a tempo; consulte logs\\server.log.");
                        std::process::exit(1);
                    }
                });
            }
            spawn_update_check(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao montar o aplicativo ATRIUM")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Ok(mut guard) = app.state::<ServerChild>().0.lock() {
                    kill_server(&mut guard);
                }
            }
        });
}
