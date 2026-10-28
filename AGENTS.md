# AGENTS.md

本文件是 AI 协作代理的行为规范，修改前必读；**与本文件冲突的自动操作一律禁止**。

## 项目概述

YouTube Desktop：Tauri v2 + React 19 + TypeScript + Zustand + Tailwind CSS v4 的 YouTube 桌面客户端（Windows，仅自用）。
数据层为 FreeTube 模式（参考 [FreeTube](https://github.com/FreeTubeApp/FreeTube) 实现）：InnerTube 接口 + 频道 RSS，无官方 API 配额/Key/登录依赖。全部用户数据（订阅、分组、收藏、设置）仅存本机。

## 版本号规范（x.y.z）

遵循语义化版本，参照 whf-stock-board 的 x.y.z 约定：

| 位 | 含义 | 何时递增 |
|---|---|---|
| **x** | 主版本 | 不兼容的结构性变更（数据模型迁移、下线既有功能等） |
| **y** | 次版本 | 向下兼容的新功能（新页面、新数据源、新交互） |
| **z** | 修订号 | 向下兼容的修复（bug fix、解析适配、文案、UI 微调） |

当前发布节奏：`0.1.x` 首版 → `0.2.x` FreeTube 模式 → 以此类推。预发布可用 `0.3.0-beta.1` 形式（tag 用 `v` 前缀，如 `v0.3.0`）。

版本号必须**三处同步**，任何一处 bump 都要同时改：

1. `package.json` → `"version"`
2. `src-tauri/tauri.conf.json` → `"version"`（应用显示的版本、更新检查的比对基准）
3. `src-tauri/Cargo.toml` → `version`

## 发版流程（x.y.z → vX.Y.Z release）

按顺序执行，每步确认后再进行下一步：

```bash
# 1. 同步 bump 三处版本号（示例：0.2.2 → 0.2.3）
#    手改 package.json / tauri.conf.json / Cargo.toml，然后：
pnpm build                       # 前端构建 + tsc 检查

# 2. 提交并推送
git add -A
git commit -m "release: vX.Y.Z <一句话变更摘要>"
git push origin main

# 3. 构建安装包（NSIS；bundle.targets 仅 ["nsis"]，不出 MSI）
pnpm tauri build

# 4. 打 tag 并发布 GitHub Release（上传安装包；APK 由 CI release.yml 自动构建上传）
git tag vX.Y.Z
git push origin vX.Y.Z
gh release create vX.Y.Z \
  "src-tauri/target/release/bundle/nsis/YouTube Desktop_X.Y.Z_x64-setup.exe" \
  --title "vX.Y.Z <标题>" --notes "<release notes：按「新增/修复/说明」分节>"
```

Release notes 要点：面向使用者的语言（不写内部实现细节）、分「新增/修复/说明」三节、涉及行为变化时写明迁移提示（如数据自愈、需重启等）。

## 发版成功后清理本地构建缓存（硬性，王总 2026-10-27 指定）

第 4 步确认成功（GitHub Release 创建完成、两个安装包上传成功）后，**必须**清理 `src-tauri/target/` 构建缓存：

```bash
cd src-tauri && cargo clean
# 或直接删除 target 下的构建产物目录（debug / release）
```

原因：`target/` 是 Cargo 构建产物缓存（debug 含完整符号 `.pdb` + 增量编译缓存 + 依赖升级残留），只增不减，两个 Tauri 项目曾累计积累近 50GB。删除仅导致下次 `tauri dev` / `tauri build` 全量重编译（首次约 5–15 分钟），不影响任何源码与用户数据。

## 红线（违反即事故）

1. **未经用户明确要求，禁止自动打 tag / 推送 tag / 创建 GitHub Release。** 提交代码、推送 main 分支是常规操作可以做，但 `git tag` 和 `gh release create` 必须等用户**明确说「发版 / 发布 vX.Y.Z / release」**——"更新一下""提交一下"都不算发版指令。存疑时先问，不要假设。
2. 禁止修改 `.gitignore` 中排除的 `.ai/`、`src-tauri/gen/` 目录内容入库；`.ai/` 是开发沉淀（方案/bug 记录），只在本机维护。
3. 禁止绕过 `pnpm build`（内含 `tsc --noEmit`）直接发版；TypeScript 报错必须修完再发。
4. 禁止把用户数据（localStorage 内容、代理地址等）写入代码、日志或提交信息。
5. 项目数据全部本地存储，禁止引入任何第三方统计/上报 SDK。

## 常用命令

```bash
pnpm tauri dev       # 桌面开发模式（vite + tauri，热更新）
pnpm tauri build     # 打包 Windows 安装包（仅 NSIS exe）
pnpm build           # 仅前端：tsc --noEmit + vite build
pnpm dev:mobile      # 移动端开发模式（vite --mode mobile；?mock=1 注入 dev-only 假数据供截图比对）
pnpm build:apk       # Android APK（自动先跑 scripts/patch-android.mjs 重放原生层补丁）
```

Android 原生层（manifest / MainActivity）改动不在 git 内（`src-tauri/gen` 被 ignore），
统一固化在 `scripts/patch-android.mjs` 幂等补丁中；重新 `tauri android init` 或换机后
先跑该脚本再构建。小米自由窗口适配细节见 `.ai/开发方案/2026-10-28-*` 与方案内说明。

## Tauri 命令清单（src-tauri/src/main.rs）

| 命令 | 用途 |
|---|---|
| `yt_fetch` | 通用 HTTP 代理通道（GET/POST + 自定义 headers），InnerTube/BotGuard/GitHub 全走它 |
| `yt_image` | 缩略图白名单代理（data URL + 内存缓存） |
| `save_webview_proxy` | proxy 落盘（WebView 启动时注入） |
| `yt_refresh_token` | OAuth 续期（历史遗留，官方 API 时代） |
| `download_update` / `finish_update` | 应用自更新（流式下载 + 静默安装） |
| `start_video_download` / `cancel_video_download` | 视频下载（单任务、进度事件 `video-download-progress`） |
| `read_download_manifest` / `list_download_dir` / `delete_offline_video` | 离线清单读取 / 目录扫描 / 删除（含缩略图与清单条目） |
| `read_text_file` / `write_text_file` | 文本文件读写（博主管理 JSON 导入/导出；路径经 dialog 选择器产生） |

## 关键架构约定（改代码前必读）

- **数据层唯一入口是 `src/lib/youtube.ts`**：store/页面只调 `ytApi.*`；新增数据源实现 `src/lib/innertube.ts` 的对应函数后在 `ytApi` 内分发，不要让 store 直接 import innertube。
- **网络请求统一走 Rust 代理**：前端不直接 fetch 外网（除 dev）。数据/图片/更新下载都经 `yt_fetch` / `yt_image` / `download_update`（reqwest + 设置页代理），改代理即时生效；视频 iframe 走 WebView 启动时注入的代理（`proxy_url` + 环境变量双保险），改代理需重启。
- **InnerTube 解析全部容错**：YouTube 响应结构随版本漂移，`lockupViewModel`/`videoRenderer` 双结构并存；解析失败要跳过该条目而不是让整页失败，关键字段缺失要有兜底文案。
- **删除类操作必须二次确认**（分组删除、收藏删除等），确认态 3 秒自动复位。
- **拖拽一律用 dnd-kit**（WebView2 下原生 HTML5 DnD 有兼容问题），不要用 draggable/dataTransfer。
- 频道/地区等枚举数据经搜索反查 + RSS 实测验证后才可写入代码（参考 `FT_REGION_GROUPS` 的注释规范）。
- **下载抽流层（`src/lib/extract.ts`）与数据层分离**：youtubei.js + ANDROID_VR client（2026-10-26 实测全分辨率经典流唯一可用 client，无需 PO Token；WEB client 的 adaptive 流已 SABR 化）。流地址不落盘、6h 过期，重试必须重新提取。任何环节失败直接报错展示（无降级方案），可经 `.ai/smoke-download.mjs` 复验。
- **观看记录存 SQLite**（tauri-plugin-sql，`sqlite:history.db`，迁移在 main.rs 注册）：仅保留 7 天，应用启动时清理；重看同一视频刷新时间（置顶）而非新增记录。
