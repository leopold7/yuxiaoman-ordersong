//! 跨客户端共享配置 (登录 cookie / 身份码 / 各项设置 / 黑名单历史)
//!
//! # 覆盖安装升级语义
//!
//! 本文件持久化在 `%APPDATA%/ordersong/shared-config.json`, 覆盖安装 **不会** 删除它.
//! 历史上前端启动时会把这里的全部存量值无条件写回 localStorage, 导致新版本代码里的
//! 默认值被旧值冲掉, 用户必须卸载 (手动删掉本文件) 才能看到新版内容.
//!
//! 现在的策略是「保留用户值, 只补新增字段」:
//! - 后端只作为「用户显式改过的值」的来源, 不再是全量真源;
//! - 前端 hydrate 时按 key 存在性合并 (见 `frontend/src/infra/storage/shared.ts`),
//!   后端没有的 key 一律保留新版本代码里的默认值;
//! - 本文件的 [`migrate`] 只处理少数「同一个 key 需要改变语义/结构」的一次性迁移.
//!
//! 之所以不用语义版本号大小比较来触发迁移: dev 分支多次构建版本号恒定
//! (`sync-version.mjs` 从根 package.json 同步), 版本号比较会漏判.
//! 「key 存在性」判定与版本号完全解耦, 对 dev / 正式版一致有效且天然幂等.

use std::path::PathBuf;

use axum::{extract::State, response::IntoResponse, Json};
use serde_json::{json, Map, Value};

use crate::error::{ApiError, ApiResult};
use crate::state::AppStateRef;

/// 当前配置结构版本, 每次需要一次性迁移时 +1, 并在 [`migrate`] 中补一个 `if from < N` 分支
const SCHEMA_VERSION: u32 = 1;

/// 内部版本字段名
///
/// 该 key 不在前端 `SHARED_KEYS` 白名单内, 前端按白名单取值, 不会误读, 因此
/// `GET /app-config` 原样返回也无副作用
const SCHEMA_KEY: &str = "__schemaVersion";

/// 登录态 key: 任何迁移步骤都 **不得** 修改或删除
///
/// 用户明确要求升级后不能重新扫码登录. 把这几个 key 集中声明成常量, 是为了让未来
/// 新增「强制重置某些 key」的迁移步骤时, 有一个机制上的兜底, 而不是依赖开发者记忆.
const PRESERVED_KEYS: &[&str] = &[
    "v3.wy.cookie",
    "v3.qq.cookie",
    "v3.bili.cookie",
    "v3.bili.user",
    "v3.wy.loginAt",
    "v3.qq.loginAt",
];

/// 持久化文件路径
pub fn shared_config_path() -> PathBuf {
    ordersong_core::paths::data_path("shared-config.json")
}

/// 迁移前的备份路径 (迁移逻辑若有缺陷, 用户可手动改名恢复)
fn backup_path() -> PathBuf {
    ordersong_core::paths::data_path("shared-config.json.bak")
}

/// 判断 key 是否属于登录态 (迁移禁区)
///
/// 当前版本的迁移步骤尚未需要删改任何 key, 故暂无调用方; 保留该函数是为了让未来
/// 新增迁移步骤时有现成的禁区判定, 避免有人直接对 map 做 retain 而误删登录态
#[allow(dead_code)]
fn is_preserved(key: &str) -> bool {
    PRESERVED_KEYS.contains(&key)
}

/// 就地迁移配置对象, 返回是否发生变更
///
/// `from` 为磁盘上记录的版本, 缺失 (存量老用户) 时由调用方传 0.
/// 实现必须保证 **幂等**: 重复执行得到相同结果, 防止异常重启导致数据损坏.
///
/// 目前 v0 -> v1 只是给存量配置打上版本标记, 不动任何业务 key ——
/// 「新增字段用新默认值」由前端按 key 存在性合并天然完成, 无需在此处理.
fn migrate(cfg: &mut Value, from: u32) -> bool {
    let mut changed = false;

    if from < 1 {
        // v0 -> v1: 仅打版本标记.
        // 存量用户的所有业务 key 原样保留, 登录态自然也不受影响.
        changed = true;
    }

    // 未来新增迁移步骤时, 在此追加 `if from < 2 { ... }`,
    // 并把 SCHEMA_VERSION 改成 2. 任何步骤都必须先用 is_preserved 跳过登录态:
    //
    // if from < 2 {
    //     if let Some(map) = cfg.as_object_mut() {
    //         map.retain(|k, _| is_preserved(k) || k != "v3.某个要重置的key");
    //     }
    //     changed = true;
    // }

    // 兜底自检: 迁移步骤如果误删了登录态 key, 这里无法恢复, 但至少保证
    // 结构合法 (非 object 时重建为空 object, 避免后续 as_object_mut 全部失效)
    if !cfg.is_object() {
        *cfg = Value::Object(Map::new());
        changed = true;
    }

    changed
}

/// 启动时从磁盘加载 (不存在 / 解析失败都回退成空对象)
///
/// 读取后会执行版本迁移并落盘. 落盘失败 (磁盘满 / 无权限) 只记日志, 不阻塞启动,
/// 内存中仍使用迁移后的值.
pub fn load_from_disk() -> Value {
    let p = shared_config_path();
    let raw = match std::fs::read_to_string(&p) {
        Ok(s) => s,
        // 文件不存在 = 全新安装, 前端全用新默认值, 无需迁移
        Err(_) => return json!({}),
    };

    let mut cfg: Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
        eprintln!("[shared-config] {} 解析失败, 按空配置处理", p.display());
        json!({})
    });

    let from = cfg.get(SCHEMA_KEY).and_then(Value::as_u64).unwrap_or(0) as u32;
    if from >= SCHEMA_VERSION {
        return cfg;
    }

    // 迁移前备份原文件, 控制爆炸半径
    if let Err(e) = std::fs::write(backup_path(), &raw) {
        eprintln!("[shared-config] 备份失败 (不影响启动)：{e}");
    }

    let changed = migrate(&mut cfg, from);
    if let Some(map) = cfg.as_object_mut() {
        map.insert(SCHEMA_KEY.to_string(), json!(SCHEMA_VERSION));
    }

    if changed {
        eprintln!("[shared-config] 配置已从 v{from} 迁移到 v{SCHEMA_VERSION}");
    }
    persist(&cfg);

    cfg
}

fn persist(v: &Value) {
    let p = shared_config_path();
    if let Ok(s) = serde_json::to_string(v) {
        if let Err(e) = std::fs::write(&p, s) {
            eprintln!("[shared-config] 落盘失败 {}：{e}", p.display());
        }
    }
}

/// GET `/app-config` - 返回完整共享配置
pub async fn get_config(State(state): State<AppStateRef>) -> impl IntoResponse {
    let v = state
        .shared_config
        .read()
        .map(|g| g.clone())
        .unwrap_or_else(|_| json!({}));
    Json(v)
}

/// POST `/app-config` - 浅合并 body (value 为 null 表示删除该 key)
pub async fn set_config(State(state): State<AppStateRef>, Json(body): Json<Value>) -> ApiResult<Json<Value>> {
    let patch = body
        .as_object()
        .cloned()
        .ok_or_else(|| ApiError::bad("请求体必须是对象"))?;

    let snapshot = {
        let mut w = state
            .shared_config
            .write()
            .map_err(|_| ApiError::internal("共享配置写锁中毒"))?;
        if !w.is_object() {
            *w = Value::Object(Map::new());
        }
        if let Some(map) = w.as_object_mut() {
            for (k, val) in patch {
                // 前端不应该改动内部版本字段, 忽略以免被降级
                if k == SCHEMA_KEY {
                    continue;
                }
                if val.is_null() {
                    map.remove(&k);
                } else {
                    map.insert(k, val);
                }
            }
            // 保证落盘的文件始终带版本标记
            map.insert(SCHEMA_KEY.to_string(), json!(SCHEMA_VERSION));
        }
        w.clone()
    };
    persist(&snapshot);
    Ok(Json(json!({ "ok": true })))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 迁移必须幂等: 重复执行结果一致
    #[test]
    fn migrate_is_idempotent() {
        let mut a = json!({ "v3.theme": "dark" });
        migrate(&mut a, 0);
        let once = a.clone();
        migrate(&mut a, SCHEMA_VERSION);
        assert_eq!(once, a);
    }

    /// 存量老用户 (无版本字段) 的登录态与业务值都不能丢
    #[test]
    fn migrate_keeps_login_and_user_values() {
        let mut cfg = json!({
            "v3.bili.cookie": "SESSDATA=abc",
            "v3.wy.cookie": "MUSIC_U=xyz",
            "v3.theme": "dark",
        });
        migrate(&mut cfg, 0);
        assert_eq!(cfg["v3.bili.cookie"], "SESSDATA=abc");
        assert_eq!(cfg["v3.wy.cookie"], "MUSIC_U=xyz");
        assert_eq!(cfg["v3.theme"], "dark");
    }

    /// 非 object 的损坏配置要被修正成空 object, 而不是让后续逻辑全部失效
    #[test]
    fn migrate_repairs_non_object() {
        let mut cfg = json!("corrupted");
        assert!(migrate(&mut cfg, 0));
        assert!(cfg.is_object());
    }

    #[test]
    fn preserved_keys_cover_all_login_state() {
        for k in [
            "v3.wy.cookie",
            "v3.qq.cookie",
            "v3.bili.cookie",
            "v3.bili.user",
            "v3.wy.loginAt",
            "v3.qq.loginAt",
        ] {
            assert!(is_preserved(k), "{k} 应属于登录态禁区");
        }
        assert!(!is_preserved("v3.theme"));
    }
}
