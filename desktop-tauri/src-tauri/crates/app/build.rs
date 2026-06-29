fn main() {
    // 任何 ACL / capability 改动都重新触发 tauri-build, 避免运行时
    println!("cargo:rerun-if-changed=permissions");
    println!("cargo:rerun-if-changed=capabilities");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new()))
        .expect("failed to run tauri-build");
}
