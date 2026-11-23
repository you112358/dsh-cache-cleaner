# dsh-cache-cleaner

> 清理 **DeepSeek Harness** 可重建的磁盘占用——本体缓存、临时落盘、桌面客户端缓存与插件缓存——绝不碰无法重建的数据。

[English](README.md) · **简体中文**

DSH 会留下大量派生数据：请求图片、会话语义投影缓存、预编译 shell、Chromium 缓存、下载的安装包、插件编译缓存。它们都不是用户数据，也都能按需重建，但分散在 DSH 主目录、系统临时目录、Electron userData 目录和各插件目录里——于是要么留下几个 GB，要么删错东西。

这个插件把边界写死：12 个可审查的清理目标，加上一圈保护栏，圈住绝不能删的数据。

## 特性

- **12 个精选目标**，分四组：DSH 本体、临时文件、桌面客户端、插件缓存与卸载残留。
- **一份实现、三个入口**——Agent 工具、设置页、HTTP 路由都调用同一个 Host 服务。
- **两种时间策略**——只清 7 天前的，或全部清理；另有逐目标默认值（临时目标保留最近 6 小时）。
- **默认即安全**——根目录白名单、保护区、不跟随符号链接、占用中的文件只报告不强删、删除前可 dry-run。
- **零依赖**——Host 半边是纯 ESM，只用 `node:fs` / `node:os` / `node:path`；Client 半边是注册进设置槽位的 React 组件。
- **面向 Agent 的输出**——工具返回紧凑的 Markdown 报告（大小、文件数、跳过项、重启提示）。

## 三个入口

| 入口 | 位置 | 调用 |
| --- | --- | --- |
| `cache_scan` / `cache_clean` | Agent 工具列表 | `createCleaner().scan()` / `.clean()` |
| 设置页 | 设置 → 缓存清理 / Cache Cleaner | `POST /dsh-cache-cleaner/api/{scan,clean}` |
| HTTP 路由 | `POST /dsh-cache-cleaner/api/scan`、`/clean` | 同一个 Host 服务，经 Connection 信任校验 |

## 安装

插件以 DSH bundle 形式安装。先克隆到本地（安装是软链接，之后改代码重载即生效）：

```bash
git clone https://github.com/you112358/dsh-cache-cleaner.git
```

然后在 DSH 会话里执行：

```
plugin_manager action=install_bundle target=<克隆目录的绝对路径>
```

`cordis.patch.yml` 只插入一行 `dsh-cache-cleaner`。开始扫描不需要重启；只有想释放被运行中客户端占用的缓存（行上标注"app restart recommended"的那些）时才需要重启应用。

卸载：`plugin_manager action=remove_bundle target=dsh-cache-cleaner`。

## 使用

### 设置页

设置 → **缓存清理**，然后：

1. 选择 **仅 7 天前的** 或 **全部缓存**，列表会按所选时间策略立刻重扫。
2. 检查各分组：行上显示大小、文件数、路径、备注和徽标（需重启、仅清理 7 天前的、跳过 N 个较新文件）。
3. 点击 **清理选中**：第一次点击进入待确认，6 秒内再点一次才真正删除；之后页面报告释放空间、删除的文件/目录数、跳过项与错误。

### Agent 工具

按默认策略扫描全部目标：

```json
{ "ids": null }
```

预览两个目标的"仅 7 天前"清理：

```json
{ "ids": ["dsh-prepared-shells", "dsh-updater-cache"], "dryRun": true, "olderThanHours": 168 }
```

把这三个临时目标连同刚写入的文件一起清掉：

```json
{ "ids": ["dsh-temp-subprocess", "dsh-temp-spill", "dsh-temp-misc"], "olderThanHours": null }
```

两个工具都返回 Markdown 报告；`clean` 另外返回结构化统计（`freedBytes`、`removedFiles`、`removedDirs`、`skipped`、`fresh`）。

### HTTP 路由

设置页通过下面两个接口与 Host 通信：

```
POST /dsh-cache-cleaner/api/scan   { "olderThanHours": 168 | null | 省略, "ids"?: string[] }
POST /dsh-cache-cleaner/api/clean  { "ids": string[], "dryRun"?: boolean, "olderThanHours"?: 168 | null }
```

请求必须通过 Connection 的 Host/Origin 与浏览器认证校验（否则 `401`），且只接受 `POST`。响应是 `{ "ok": true, "value": … }` 或 `{ "ok": false, "error": { "code", "message" } }`。

## 清理策略

| 选项 | 设置页 | `olderThanHours` | 清理范围 |
| --- | --- | --- | --- |
| 仅 7 天前的 | 仅 7 天前的 / 7+ days old | `168` | 只删最近 7 天没改动过的条目 |
| 全部缓存 | 全部缓存 / Everything | `null` | 不按时间过滤，刚写入的也删 |
| 逐目标默认 | （工具/路由省略时） | 省略 | 用目标自己的阈值：临时目标 6 小时，其余无限制 |

"全部"只放宽**时间**，不会放宽**目标清单**：仍然只考虑下面声明的根目录，保护区依旧受保护；被运行中进程占用的条目只报告为跳过，绝不强删。

设置页默认打开**全部缓存**模式，保证清单随时可见。切到「仅 7 天前的」时，较新的缓存不会被隐藏，而是标注「近期写入 …，保留」并显示体积，页面同时给出过滤原因说明。

## 清理目标

除卸载残留外的目标在设置页默认勾选（只有有数据的行才会被选上；卸载残留默认不选），列表提供**全选 / 全不选**按钮和「已选 n/m 项」计数，因此既能整组清理，也能只清明确选中的几项。

| id | 分组 | 范围 | 需重启 |
| --- | --- | --- | --- |
| `dsh-request-images` | DSH 本体 | `~/.dsh/cache/attachments/request-images` | 否 |
| `dsh-prepared-shells` | DSH 本体 | `~/.dsh/dsh-ops/shells/niubash-prepared`（预编译 shell 落盘） | 否 |
| `dsh-temp-subprocess` | 临时文件 | `%TEMP%/dsh-subprocess-*` | 否 |
| `dsh-temp-spill` | 临时文件 | `%TEMP%/dsh-spill-*` | 否 |
| `dsh-temp-misc` | 临时文件 | 其余 `%TEMP%/dsh-*` 残留 | 否 |
| `dsh-electron-http-cache` | 桌面客户端 | 客户端 HTTP 缓存 | 是 |
| `dsh-electron-code-cache` | 桌面客户端 | 客户端代码缓存 | 是 |
| `dsh-electron-gpu-cache` | 桌面客户端 | GPU / 着色器缓存（GrShaderCache、GPUCache、ShaderCache、Dawn*Cache） | 是 |
| `dsh-electron-logs` | 桌面客户端 | 客户端日志 | 否 |
| `dsh-updater-cache` | 桌面客户端 | 下载的安装包 / blockmap | 否 |
| `plugin-caches` | 插件缓存 | 从当前 profile 自动发现——见下 | 否 |
| `plugin-leftovers` | 插件缓存 | 已卸载插件留下的数据目录——见下（默认不勾选） | 否 |

桌面客户端与更新器两行指向标准 Electron userData / updater 位置；目录不存在的平台上这些行显示为空，而不是去猜路径。

桌面客户端运行期间，Chromium 会一直占用网络缓存的 journal 文件，因此这一行无法在客户端内部清掉：行内会明确显示`被客户端占用` 并保留文件，而不是假装清空。关闭客户端后用终端助手清理即可，缓存之后会按需重建。

```bash
node scripts/clean-cli.mjs dsh-electron-http-cache --all
```

### 插件缓存（自动发现）

每台机器安装的插件不同，所以这一行不是固定列表，而是在扫描时从当前 profile（`DSH_PROFILE_DIR`）现场发现：

1. **插件声明的缓存**——插件可在自己的 `package.json` 里写 `dsh.cache`，值为字符串、数组，或 `{ "path": …, "mode": "contents" | "entry" }`。路径可以是绝对路径、以 `~` 开头，或相对于该插件的数据目录。声明路径必须是该插件自身数据根目录的子目录（`~/.<name>`、`%LOCALAPPDATA%/<name>`、`%LOCALAPPDATA%/dsh-<name>`、`<DSH_HOME>/<name>`）；指向安装包内部或别处的声明一律拒绝。
2. **约定命名的缓存**——上述数据根目录下直接名为 `cache`、`.cache`、`compile-cache`、`logs`、`tmp` 的子目录。

```json
{
  "name": "my-plugin",
  "dsh": { "cache": ["~/.my-plugin/cache", { "path": "tmp/thumbs", "mode": "contents" }] }
}
```

发现是尽力而为的：数据放在非常规位置的插件不会被猜着清理，只会保持不可见。`pluginCacheDiscovery: false` 只保留声明路径，`pluginCacheExtraPaths` 可追加明确位置。

### 插件卸载残留

卸载插件会删掉它的安装包，但未必删掉它写下的数据。`plugin-leftovers` 行会报告：

1. **记录过的数据根**：插件处于安装状态时，清理器会把它占用的数据根记在 `<DSH_HOME>/storages/dsh-cache-cleaner/plugin-roots.json`，每次扫描该行都会刷新这份目录（只有声明了 DSH manifest 的包才算插件，因此被提升的依赖库不会认领全局目录）；插件消失后，这些目录即使名字已经对不上任何包，也会被报出来。
2. **约定扫描**：`<DSH_HOME>/storages/`、`<DSH_HOME>/telemetry/`、`<DSH_HOME>/dsh-*` 与 `%LOCALAPPDATA%/dsh-*` 下没有已安装插件认领的条目。

该行默认不勾选，每个候选都会单独列出路径，删除前可以先核对。`pluginLeftoverDiscovery: false` 只保留记录过的数据根；`pluginLeftoverExtraPaths` 可追加明确的额外目录。最近 `pluginLeftoverMinAgeHours` 小时（默认 24）内有写入的候选会被跳过，因此仍在运行的插件（例如从开发目录加载的插件）不会被当成卸载残留。

## 安全模型

- **只触碰声明的根目录**：DSH 主目录、系统临时目录、桌面客户端 userData、更新器目录（仅其内容），以及用户主目录或 `%LOCALAPPDATA%` 下各插件的数据根目录。
- **永不触碰**：`sessions/`、`attachments/`、`profiles/`、`rewind-snapshots/`、`llm-deepseek/`、`dsh-runtimes/`、`skills/`、`credentials/`，以及客户端的 Local Storage / Session Storage / Network / IndexedDB / cookies。
- **不跟随符号链接**。
- **默认按时间保守清理**：逐目标策略下，比阈值（6 小时，可配置）更新的文件会被跳过；"7 天"把阈值放宽到 168 小时，"全部"则完全取消时间过滤。
- **占用中的文件只报告**：EBUSY/EPERM 等会重试几次（80 ms、200 ms），仍占用则记为 `skipped`，不强删。
- **已安装插件的 `node_modules` 不是缓存**，永不删除；被发现的插件缓存必须位于安装包之外。
- **卸载残留默认不勾选**：只在用户主目录、`%LOCALAPPDATA%`、DSH 主目录内识别，且只有明确勾选该项时才会删除。
- **先预览**：`cache_clean { dryRun: true }` 只统计不删除。

## 配置

`createCleaner(options)` 支持：

| 选项 | 默认 | 含义 |
| --- | --- | --- |
| `staleHours` | `6` | `staleHours: 'config'` 的目标（临时/落盘类）使用的阈值 |
| `targets` | 全部 | id 白名单，供嵌入和自定义场景使用 |
| `pluginCacheDiscovery` | `true` | 是否扫描各插件数据根下约定命名的缓存目录 |
| `pluginCacheExtraPaths` | `[]` | 追加到 `plugin-caches` 行的额外绝对路径或 `~` 路径 |
| `pluginLeftoverDiscovery` | `true` | 是否扫描插件卸载残留；`false` 时只报告记录过的数据根 |
| `pluginLeftoverExtraPaths` | `[]` | 追加视为卸载残留的额外绝对路径或 `~` 路径 |
| `pluginLeftoverMinAgeHours` | `24` | 跳过最近这么多小时内有写入的残留候选；`0` 关闭该保护 |

bundle 行的 `config` 会原样传入，例如：

```yaml
- insert:
    - id: dsh-cache-cleaner
      name: dsh-cache-cleaner
      config:
        staleHours: 24
```

## 实现结构

```
lib/targets.js   声明式目标清单（分组、双语标题、路径、模式、重启标记）
lib/paths.js     放置所有位置常量（允许根、保护根、可清理根）
lib/plugin-caches.js 从当前 profile 发现各插件缓存（声明的 dsh.cache + 约定目录）
lib/leftovers.js 识别已卸载插件留下的数据目录（记录 + 约定扫描）
lib/cleaner.js   扫描/清理引擎：根目录白名单 + 保护区、时间策略、遍历/统计/删除、报告
lib/index.js     Host 插件：无 Config 依赖的 ESM 入口、Agent 工具、经信任校验的 HTTP 路由
client/client.js 单个 client bundle：设置页 + 导航图标（React，无 JSX，只用主题 token）
locale/*.json    插件管理器展示用的标题/描述
```

引擎是纯 Node 实现（不依赖 Cordis / schemastery），便于单测与嵌入；插件半边只在 `ctx.effect(...)` 内注册资源，卸载时工具与路由会一并移除。

## 开发

```bash
node --check client/client.js                  # bundle 语法
node -e "import('./lib/index.js').then(m=>console.log(m.name, m.inject))"   # Host 半边可加载
node scripts/check-client.mjs                  # client bundle 结构自检（无需浏览器）
node scripts/clean-cli.mjs --dry-run           # 列出全部目标并预览
node scripts/clean-cli.mjs dsh-temp-spill --all # 清理指定目标
```

`scripts/check-client.mjs` 在 `vm` 沙箱里用假的 `window.__ModuleLoader__`、`document`、`require('react')` 求值 bundle，调用 factory，再以伪造的 client context 跑 `apply()`，断言槽位注册、section id/order、样式归属与中文渲染。CI 在 Node 22 上运行同样的检查。

## 兼容性

- 基于 DSH 的 bundle 与 client-module 契约编写（`dsh.bundle.patch`、`dsh.client`、`__ModuleLoader__`）。
- 桌面客户端目标按 Electron / Windows 目录布局断言；其他平台未验证——目录不存在时行留空，不去猜路径。
- 不联网、不起定时器、不做后台任务：只有被调用时才扫描。

## 相关链接

- [最新版本](https://github.com/you112358/dsh-cache-cleaner/releases/latest)——发布说明与安装命令
- [贡献指南](CONTRIBUTING.md)——新增清理目标、检查命令与 PR 规则
- [问题反馈](https://github.com/you112358/dsh-cache-cleaner/issues)——Bug 与清理目标建议
- [更新日志](https://github.com/you112358/dsh-cache-cleaner/releases)

## 许可

MIT © 2026 you112358
