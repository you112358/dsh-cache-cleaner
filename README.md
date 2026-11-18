# dsh-cache-cleaner

> Reclaim the rebuildable disk space of **DeepSeek Harness** — core caches, temp spill, desktop client caches and plugin caches — without touching anything that cannot be rebuilt.

**English** · [简体中文](README.zh-CN.md)

DSH keeps a lot of derived data around: request images, session projection caches, prepared shells, Chromium caches, downloaded installers, plugin compile caches. None of it is user data, and all of it is rebuilt on demand — but it is scattered across the DSH home, the OS temp directory, the Electron userData directory and various plugin directories, which makes it easy to either leave gigabytes behind or delete the wrong thing.

This plugin draws that line explicitly: a fixed, reviewable list of 13 cache targets, with a safety fence around the data that must never be deleted.

## Features

- **13 curated targets** in four groups — DSH core, temp spill, desktop client, plugin caches.
- **One implementation, three entry points** — the agent tools, the settings page and an HTTP route all call the same Host service.
- **Two age policies** — only entries untouched for 7 days, or everything, plus a per-target default (temp targets keep the last 6 hours).
- **Safe by construction** — allowlisted roots, protected subtrees, symlinks never followed, locked files reported instead of forced, dry run before delete.
- **Zero dependencies** — the Host half is plain ESM over `node:fs` / `node:os` / `node:path`; the Client half is a React component registered into the settings slot.
- **Agent-first output** — tool calls return a compact Markdown report (size, file count, skipped entries, restart hints).

## Entry points

| Entry point | Where | Calls |
| --- | --- | --- |
| `cache_scan` / `cache_clean` | agent tool list | `createCleaner().scan()` / `.clean()` |
| Settings page | Settings → 缓存清理 / Cache Cleaner | `POST /dsh-cache-cleaner/api/{scan,clean}` |
| HTTP route | `POST /dsh-cache-cleaner/api/scan`, `/clean` | same Host service, fenced by Connection trust checks |

## Install

The plugin is a DSH bundle. Install it from a local checkout (a symlink, so later edits apply on reload):

```bash
git clone https://github.com/you112358/dsh-cache-cleaner.git
```

Then, in a DSH session:

```
plugin_manager action=install_bundle target=<absolute path to the cloned dsh-cache-cleaner directory>
```

The bundle patch (`cordis.patch.yml`) inserts a single row named `dsh-cache-cleaner`. No restart is needed to start scanning; restart the application only if you want to release caches that the running client keeps open ("app restart recommended" rows).

Uninstall with `plugin_manager action=remove_bundle target=dsh-cache-cleaner`.

## Usage

### Settings page

Settings → **Cache Cleaner** (缓存清理), then:

1. Pick **仅 7 天前的 / 7+ days old** or **全部缓存 / Everything**. The list rescans immediately with the chosen age policy.
2. Review the groups; rows show size, file count, decoded path, notes and badges (`app restart recommended`, `only 7+ days old`, `N newer skipped`).
3. Press **清理选中 / Clean selected**. The first click arms the button, the second click (within 6 seconds) actually deletes; the page then reports freed space, removed files/directories, skipped entries and errors.

### Agent tools

Scan everything with the default age policy:

```json
{ "ids": null }
```

Preview a week-old-only cleanup of two targets:

```json
{ "ids": ["dsh-prepared-shells", "dsh-updater-cache"], "dryRun": true, "olderThanHours": 168 }
```

Delete everything those targets hold, including fresh entries:

```json
{ "ids": ["dsh-temp-subprocess", "dsh-temp-spill", "dsh-temp-misc"], "olderThanHours": null }
```

Both tools return a Markdown report; `clean` also returns structured totals (`freedBytes`, `removedFiles`, `removedDirs`, `skipped`, `fresh`).

### HTTP route

The settings page talks to the Host through:

```
POST /dsh-cache-cleaner/api/scan   { "olderThanHours": 168 | null | omit, "ids"?: string[] }
POST /dsh-cache-cleaner/api/clean  { "ids": string[], "dryRun"?: boolean, "olderThanHours"?: 168 | null }
```

Requests must pass Connection's Host/Origin and browser-authentication checks (anything else gets `401`); only `POST` is accepted. Responses are `{ "ok": true, "value": … }` or `{ "ok": false, "error": { "code", "message" } }`.

## Cleaning options

| Option | Settings page | `olderThanHours` | Removes |
| --- | --- | --- | --- |
| Only a week old | 仅 7 天前的 / 7+ days old | `168` | only entries untouched for the last 7 days |
| Everything | 全部缓存 / Everything | `null` | every entry, including caches written seconds ago |
| Per-target default | (initial state) | omitted | the target's own cutoff — 6 h for temp targets, none elsewhere |

"Everything" never widens the *target list*: only the declared roots below are considered, and protected subtrees stay protected. Entries that are still open in a running process are reported as skipped, never forced.

## What it cleans

All 13 targets are pre-selected in the settings page; the whole set can be cleaned at once.

| id | Group | Scope | Restart |
| --- | --- | --- | --- |
| `dsh-request-images` | DSH core | `~/.dsh/cache/attachments/request-images` | no |
| `dsh-session-projections` | DSH core | `~/.dsh/storages/session_projcache` (rebuildable projections) | no |
| `dsh-prepared-shells` | DSH core | `~/.dsh/dsh-ops/shells/niubash-prepared` (prepared-shell spill) | no |
| `dsh-temp-subprocess` | Temp | `%TEMP%/dsh-subprocess-*` | no |
| `dsh-temp-spill` | Temp | `%TEMP%/dsh-spill-*` | no |
| `dsh-temp-misc` | Temp | other `%TEMP%/dsh-*` leftovers | no |
| `dsh-electron-http-cache` | Desktop | desktop client HTTP cache | yes |
| `dsh-electron-code-cache` | Desktop | desktop client code cache | yes |
| `dsh-electron-gpu-cache` | Desktop | GPU / shader caches (GrShaderCache, GPUCache, ShaderCache, Dawn*Cache) | yes |
| `dsh-electron-logs` | Desktop | desktop client logs | no |
| `dsh-updater-cache` | Desktop | downloaded installers / blockmaps | no |
| `dsh-plugin-context-overview` | Plugins | billion-context overview cache | no |
| `dsh-plugin-cc-safety-net` | Plugins | cc-safety-net compile cache + logs | no |

Desktop client and updater rows refer to the standard Electron userData and updater locations; on a platform where those directories do not exist the rows simply stay empty.

## Safety model

- **Only declared roots are touched:** the DSH home, the OS temp directory, the desktop client userData directory, the updater directory and `~/.cc-safety-net`.
- **Never touched:** `sessions/`, `attachments/`, `profiles/`, `rewind-snapshots/`, `llm-deepseek/`, `dsh-runtimes/`, `skills/`, `credentials/`, and the client's Local Storage / Session Storage / Network / IndexedDB / cookies.
- **Symlinks are never followed.**
- **Age-aware by default:** under the per-target policy, files newer than the stale cutoff (6 h, configurable) are skipped; "7 days" widens the cutoff to 168 h and "Everything" removes the age filter entirely.
- **Locked files are reported, not forced:** a busy file is retried once and then listed as `skipped`.
- **Installed plugins' `node_modules` are not caches** and are never deleted.
- **Dry run first:** `cache_clean { dryRun: true }` previews without deleting.

## Configuration

`createCleaner(options)` accepts:

| Option | Default | Meaning |
| --- | --- | --- |
| `staleHours` | `6` | cutoff used by targets whose `staleHours` is `'config'` (temp/spill targets) |
| `targets` | all | id allowlist, for embeddings and custom setups |

The bundle row created by the patch passes its `config` object straight through, e.g.:

```yaml
- insert:
    - id: dsh-cache-cleaner
      name: dsh-cache-cleaner
      config:
        staleHours: 24
```

## How it works

```
lib/targets.js   declarative target registry (groups, bilingual titles, paths, modes, restart flags)
lib/cleaner.js   scan/clean engine: allowlist + protected fences, age policy, walk/measure/delete, reporting
lib/index.js     Host plugin: Config-free ESM entry, agent tools, trust-fenced HTTP route
client/client.js single client bundle: settings page + nav icon (React, no JSX, theme tokens only)
locale/*.json    plugin display title/description served by the plugin manager
```

The engine is pure Node (no Cordis, no schemastery) so it can be unit-tested and embedded; the plugin half only wires registrations inside `ctx.effect(...)` so unloading removes tools and routes cleanly.

## Development

```bash
node --check client/client.js                 # bundle syntax
node -e "import('./lib/index.js').then(m=>console.log(m.name, m.inject))"   # Host half loads
node scripts/check-client.mjs                 # structural check of the client bundle (no browser)
```

`scripts/check-client.mjs` evaluates the bundle in a `vm` sandbox with stubbed `window.__ModuleLoader__`, `document` and `require('react')`, calls the factory, runs `apply()` against a fake client context and asserts the registered slots, section id/order, style claiming and a zh render. CI runs the same checks on Node 22.

## Compatibility

- Written against the DSH bundle + client-module contracts (`dsh.bundle.patch`, `dsh.client`, `__ModuleLoader__`).
- Desktop client targets assume the Electron/Windows layout; other platforms are untested — the rows stay empty rather than guessing paths.
- No network access, no timers, no background work: scans run only when called.

## License

MIT © 2026 you112358
