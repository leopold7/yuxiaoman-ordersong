//! 极简日志: 写到 stderr + `%APPDATA%/ordersong/ordersong.log`
//!
//! 早期写在 exe 同目录, 但安装包是 `installMode: perMachine`, 程序装在
//! `C:\Program Files\...` 下, 普通用户对该目录没有写权限, `OpenOptions::open`
//! 会直接失败并被静默吞掉 —— 结果就是线上版本根本没有日志可查.
//! 改写到用户数据目录 (与 shared-config.json 同级) 后才能真正落盘.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::SystemTime;

fn log_file_path() -> PathBuf {
    ordersong_core::paths::data_path("ordersong.log")
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
