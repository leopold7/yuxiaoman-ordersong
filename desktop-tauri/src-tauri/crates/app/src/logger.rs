//! 极简日志: 写到 stderr + exe 同目录的 ordersong.log

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::SystemTime;

fn log_file_path() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe.parent()
        .unwrap_or(std::path::Path::new("."))
        .join("ordersong.log")
}

/// 写一行日志 (自动追加时间戳与换行)
pub fn write_log(line: &str) {
    let path = log_file_path();
    let ts = SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let formatted = format!("[{ts}] {line}\n");
    eprintln!("{}", formatted.trim_end());
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = f.write_all(formatted.as_bytes());
    }
}
