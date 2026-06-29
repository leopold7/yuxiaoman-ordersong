# HTTP API

应用内嵌 axum 服务监听 `http://127.0.0.1:17777`。除健康检查/指标走根路径外，业务接口都挂在 `BASE_PATH`（默认 `/order`）下。

所有业务错误以 `{ "code": <非0>, "message": <中文> }` 返回，HTTP 状态保持 200，调用方按 `code` 判断成败。

## 健康检查 / 指标（根路径）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/healthz` | 健康检查，返回 `{ "ok": true, "backend": "rust-axum" }` |
| GET | `/api/metrics` | 运行时指标快照（计数器 + 平均耗时） |

## B 站开放平台 `/order/bili-api`

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/gameStart` | 开始互动玩法场次（body 含 `code` 身份码、`app_id`） |
| POST | `/gameEnd` | 结束场次 |
| POST | `/gameHeartBeat` | 单场次心跳 |
| POST | `/gameBatchHeartBeat` | 批量心跳 |

## B 站扫码登录 `/order/bili-passport`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/qrcode` | 生成扫码登录二维码 |
| GET | `/poll?qrcode_key=` | 轮询登录状态，成功返回 cookie |
| POST | `/setCookie` | 写回 cookie 到后端内存（body: `{ cookie }`） |
| GET | `/whoami` | 用 cookie 查询登录用户信息 |
| POST | `/logout` | 清空已保存 cookie |

> 注：自动获取身份码接口已移除，身份码改为手动从开播设置页复制填写。

## B 站房间号网页协议 `/order/bili-room`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/init?room=` | 短号转真实房间号 + 主播 uid + 标题 |
| GET | `/danmuInfo?room=` | 取弹幕 WebSocket 服务器列表 + 鉴权 token |
| GET | `/myroom` | 用已登录 cookie 查主播自己的房间号 |

## 网易云音乐 `/order/netease_api`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/cloudsearch?keywords=` | 云搜索 |
| GET | `/song/url/v1?id=&level=` | 取流（含音质降级链） |
| GET | `/song/detail?ids=` | 歌曲详情（封面） |
| GET | `/playlist/track/all?id=` | 歌单全部歌曲 |
| GET | `/lyric?id=` | 歌词 |
| GET | `/user/account?cookie=` | 用户账号信息 |
| GET | `/user/playlist?uid=` | 用户歌单 |
| GET | `/login/qr/{key,create,check}` | 网页二维码登录 |

## QQ 音乐 `/order/qq-api`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/search?key=` | 搜索 |
| GET | `/song/url?id=&level=` | 取流 |
| GET | `/lyric?id=` | 歌词 |
| GET | `/toplist?topid=` | 排行榜（默认热歌榜 topid=4） |
| GET | `/user/favorite` | 「我喜欢」歌单（需登录 cookie） |
| POST | `/user/setCookie` | 写回 cookie（body: `{ data }`） |

## 共享配置 / 播放快照

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/order/app-config` | 拉取跨客户端共享配置 |
| POST | `/order/app-config` | 浅合并配置（value 为 null 表示删除该 key），非对象返回「请求体必须是对象」 |
| GET | `/order/live-state` | OBS 浏览器源拉取播放快照 |
| POST | `/order/live-state` | 主程序推送播放快照 |
