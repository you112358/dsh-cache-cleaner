/**
 * Target registry for the cache cleaner.
 *
 * Every cleanable location is declared here, in one place, with:
 *   - `id`          stable key shared by the UI, the agent tools and the HTTP route
 *   - `group`       presentation group (see GROUPS)
 *   - `title`/`note` bilingual display strings (the Host is the single source of
 *                   truth for target metadata, so the browser half stays dumb)
 *   - `defaultOn`   pre-selected in the settings page
 *   - `restart`     the app must be restarted before the space is fully reclaimed
 *   - `staleHours`  `'config'` = only entries older than `config.staleHours`;
 *                   `null` = no age filter
 *   - `units()`     async: the deletion units, each `{ path, mode }`
 *                   mode `contents` = delete everything INSIDE `path`, keep the directory
 *                   mode `entry`    = delete `path` itself (file or directory tree)
 *
 * Nothing outside ALLOWED_ROOTS is ever touched, and PROTECTED_ROOTS is refused
 * even when a future target would point there.
 */
import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
export const TEMP_DIR = process.env.TEMP || process.env.TMP || os.tmpdir()
export const DESKTOP_DATA = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  '@deepseek-ai',
  'dsh-desktop',
)
export const UPDATER_DATA = path.join(
  process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
  '@deepseek-aidsh-desktop-updater',
)
export const CC_SAFETY_NET = path.join(os.homedir(), '.cc-safety-net')

/** Roots a deletion unit may live under. Anything else is refused. */
export const ALLOWED_ROOTS = [DSH_HOME, TEMP_DIR, DESKTOP_DATA, UPDATER_DATA, CC_SAFETY_NET]

/** Never touched, even if a target points there. */
export const PROTECTED_ROOTS = [
  path.join(DSH_HOME, 'sessions'),
  path.join(DSH_HOME, 'attachments'),
  path.join(DSH_HOME, 'profiles'),
  path.join(DSH_HOME, 'rewind-snapshots'),
  path.join(DSH_HOME, 'llm-deepseek'),
  path.join(DSH_HOME, 'dsh-runtimes'),
  path.join(DSH_HOME, 'skills'),
  path.join(DSH_HOME, 'credentials'),
  path.join(DESKTOP_DATA, 'Local Storage'),
  path.join(DESKTOP_DATA, 'Session Storage'),
  path.join(DESKTOP_DATA, 'Network'),
  path.join(DESKTOP_DATA, 'IndexedDB'),
  path.join(DESKTOP_DATA, 'Local State'),
  path.join(DESKTOP_DATA, 'Cookies'),
]

const text = (zh, en) => ({ zh, en })

/** `contents` units for a fixed list of directories. */
const dirContents = (...dirs) => async () =>
  dirs.map((dir) => ({ path: dir, mode: 'contents' }))

/** Top-level `%TEMP%` entries whose name matches `predicate`, as `entry` units. */
async function tempEntries(predicate) {
  let entries
  try {
    entries = await readdir(TEMP_DIR, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => predicate(entry.name))
    .map((entry) => ({ path: path.join(TEMP_DIR, entry.name), mode: 'entry' }))
}

export const GROUPS = [
  {
    id: 'dsh',
    order: 10,
    title: text('DSH 本体缓存', 'DSH core caches'),
  },
  {
    id: 'temp',
    order: 20,
    title: text('临时文件', 'Temporary files'),
  },
  {
    id: 'desktop',
    order: 30,
    title: text('桌面客户端缓存', 'Desktop client caches'),
  },
  {
    id: 'plugins',
    order: 40,
    title: text('插件缓存', 'Plugin caches'),
  },
]

export const TARGETS = [
  {
    id: 'dsh-request-images',
    group: 'dsh',
    title: text('会话请求图片缓存', 'Request image cache'),
    note: text(
      '聊天中发送过的图片在本地留一份缩略副本，需要时会重新生成。',
      'Local thumbnails of images sent in conversations; regenerated on demand.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(path.join(DSH_HOME, 'cache', 'attachments', 'request-images')),
  },
  {
    id: 'dsh-session-projections',
    group: 'dsh',
    title: text('会话投影缓存', 'Session projection cache'),
    note: text(
      '会话列表等界面的投影缓存，从会话日志重建；删除后首次打开会稍慢。',
      'UI projections rebuilt from the session log; the first open is slower afterwards.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(path.join(DSH_HOME, 'storages', 'session_projcache')),
  },
  {
    id: 'dsh-prepared-shells',
    group: 'dsh',
    title: text('预准备 shell 环境', 'Prepared shell environments'),
    note: text(
      '为命令执行预生成的 shell 目录，体积通常最大；下次执行命令时按需重建。',
      'Pre-generated shell directories used by command execution; rebuilt on demand. Usually the biggest item.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(path.join(DSH_HOME, 'dsh-ops', 'shells', 'niubash-prepared')),
  },
  {
    id: 'dsh-temp-subprocess',
    group: 'temp',
    title: text('后台子进程临时目录', 'Subprocess temp directories'),
    note: text(
      'dsh-subprocess-*：后台任务与工具进程的运行目录，只清理超过时限的。',
      'dsh-subprocess-*: working directories of background jobs; only ones past the age limit are cleaned.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: 'config',
    units: () => tempEntries((name) => name.startsWith('dsh-subprocess-')),
  },
  {
    id: 'dsh-temp-spill',
    group: 'temp',
    title: text('工具输出溢出文件', 'Spilled tool output'),
    note: text(
      'dsh-spill-*：过长的工具输出落盘后的副本，只清理超过时限的。',
      'dsh-spill-*: on-disk copies of oversized tool output; only ones past the age limit are cleaned.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: 'config',
    units: () => tempEntries((name) => name.startsWith('dsh-spill-')),
  },
  {
    id: 'dsh-temp-misc',
    group: 'temp',
    title: text('其它 DSH 临时目录', 'Other DSH temp directories'),
    note: text(
      'dsh-*：ACL 辅助目录、工作区变更快照等临时物，只清理超过时限的。',
      'dsh-*: ACL helpers, workspace-change snapshots and similar temp artefacts; only ones past the age limit are cleaned.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: 'config',
    units: () =>
      tempEntries(
        (name) =>
          name.startsWith('dsh-') &&
          !name.startsWith('dsh-subprocess-') &&
          !name.startsWith('dsh-spill-'),
      ),
  },
  {
    id: 'dsh-electron-http-cache',
    group: 'desktop',
    title: text('客户端网络缓存', 'Electron network cache'),
    note: text(
      '客户端页面的 HTTP 缓存，删除后页面会重新下载资源。',
      'HTTP cache of the client page; assets are fetched again afterwards.',
    ),
    defaultOn: true,
    restart: true,
    staleHours: null,
    units: dirContents(path.join(DESKTOP_DATA, 'Cache')),
  },
  {
    id: 'dsh-electron-code-cache',
    group: 'desktop',
    title: text('V8 代码缓存', 'V8 code cache'),
    note: text(
      '已编译脚本的磁盘缓存，删除后首次启动稍慢。',
      'Compiled-script disk cache; the first start is slower afterwards.',
    ),
    defaultOn: true,
    restart: true,
    staleHours: null,
    units: dirContents(path.join(DESKTOP_DATA, 'Code Cache')),
  },
  {
    id: 'dsh-electron-gpu-cache',
    group: 'desktop',
    title: text('GPU 着色器缓存', 'GPU shader caches'),
    note: text(
      'GrShaderCache / GPUCache / ShaderCache / Dawn*：可重建的 GPU 缓存。',
      'GrShaderCache / GPUCache / ShaderCache / Dawn*: rebuildable GPU caches.',
    ),
    defaultOn: true,
    restart: true,
    staleHours: null,
    units: dirContents(
      path.join(DESKTOP_DATA, 'GrShaderCache'),
      path.join(DESKTOP_DATA, 'GPUCache'),
      path.join(DESKTOP_DATA, 'GPUPersistentCache'),
      path.join(DESKTOP_DATA, 'ShaderCache'),
      path.join(DESKTOP_DATA, 'DawnGraphiteCache'),
      path.join(DESKTOP_DATA, 'DawnWebGPUCache'),
    ),
  },
  {
    id: 'dsh-electron-logs',
    group: 'desktop',
    title: text('客户端日志', 'Electron logs'),
    note: text('客户端运行日志，只保留当前进程正在写的文件。', 'Client runtime logs.'),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(path.join(DESKTOP_DATA, 'logs')),
  },
  {
    id: 'dsh-updater-cache',
    group: 'desktop',
    title: text('更新下载缓存', 'Updater download cache'),
    note: text(
      '安装包与差分包缓存，通常是最大的一项；若正等待安装更新，删除后需重新下载。',
      'Installer and block-map downloads — often the biggest item. A pending update must be downloaded again.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(UPDATER_DATA),
  },
  {
    id: 'dsh-plugin-context-overview',
    group: 'plugins',
    title: text('上下文概览缓存（billion-context）', 'Context overview cache (billion-context)'),
    note: text(
      '上下文管理插件生成的概览快照，会按需重建。',
      'Overview snapshot produced by the context-management plugin; rebuilt on demand.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: async () => [
      { path: path.join(DSH_HOME, 'storages', 'dsh-context', 'overview-cache.v1.json'), mode: 'entry' },
    ],
  },
  {
    id: 'dsh-plugin-cc-safety-net',
    group: 'plugins',
    title: text('cc-safety-net 编译缓存与日志', 'cc-safety-net compile cache and logs'),
    note: text(
      '该插件的编译缓存与日志目录；规则目录 rules/ 不会被改动。',
      'Compile cache and logs of that plugin. The rules/ directory is left alone.',
    ),
    defaultOn: true,
    restart: false,
    staleHours: null,
    units: dirContents(
      path.join(CC_SAFETY_NET, 'compile-cache'),
      path.join(CC_SAFETY_NET, 'logs'),
    ),
  },
]

/** Target lookup used by both callers. */
export const TARGET_IDS = TARGETS.map((target) => target.id)

export function findTarget(id) {
  return TARGETS.find((target) => target.id === id)
}
