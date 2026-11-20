# Contributing to dsh-cache-cleaner

Thanks for taking the time to contribute! This plugin exists to reclaim disk
space **safely**, so the most valuable contributions are new cache targets that
come with proof they can be rebuilt, and reports where a safe cleanup went wrong.

## Ground rules

1. **Never add a target that holds user data.** Session logs, the attachment
   store, rewind snapshots, profiles, credentials, model settings and the
   client's Local Storage are off-limits. If you are unsure whether something is
   rebuildable, open a feature request first and explain how it is produced.
2. **Keep the Host half dependency-free.** `lib/` may only import Node built-ins
   (`node:fs`, `node:fs/promises`, `node:os`, `node:path`). Do not add
   `@deepseek-ai/*`, schemastery, or any runtime dependency.
3. **Every cleanup path goes through `lib/cleaner.js`.** The settings page,
   the agent tools and the HTTP route must call the same engine — no second
   implementation.
4. **Safety checks stay in `lib/cleaner.js`:** allowlisted roots, protected
   subtrees, no symlink traversal, staleness filtering, locked files reported
   instead of forced. A new target widens `TARGETS`, never the fences.
5. **Client code matches the host UI.** Use only `--dsw-alias-*` theme tokens,
   register resources inside `ctx.effect(...)`, and route visible strings through
   the inline `TEXT` dictionary (zh/en).

## Adding a cache target

Edit `lib/targets.js` and add one entry:

```js
{
  id: 'dsh-my-plugin-cache',
  group: 'plugins',
  title: { zh: '…', en: '…' },
  note: { zh: '…', en: '…' },       // where it comes from, when it is rebuilt
  defaultOn: true,
  restart: false,                    // true only when the running client holds files open
  staleHours: 'config',              // or a number, or null for no cutoff
  units() {
    return [{ path: path.join(DSH_HOME, 'dsh-ops', 'my-cache'), mode: 'contents' }]
  },
},
```

Then update both READMEs (target table) and run the checks below. A pull request
that adds a target should mention the path it touches and what recreates it.

Plugin caches are **not** added here: `lib/plugin-caches.js` discovers them from
the active profile by reading each installed plugin's `dsh.cache` manifest field
plus conventionally named cache directories next to that plugin's data roots. If
you maintain a plugin, declare its cache there instead of hardcoding an adapter
in this repository — one manifest field covers every user of that plugin.

## Development setup

```bash
git clone https://github.com/you112358/dsh-cache-cleaner.git
cd dsh-cache-cleaner
node --check client/client.js
node -e "import('./lib/index.js').then((m) => console.log(m.name, m.inject))"
node scripts/check-client.mjs
```

Install the working copy into a DSH session with:

```
plugin_manager action=install_bundle target=<absolute path to this checkout>
```

The bundle row is linked, so after editing do **not** call `install_bundle`
again (it answers `already-installed`). Toggle the row instead to reload the
Host module:

```
plugin_manager action=set_plugin target=include:dsh-cache-cleaner enabled=false
plugin_manager action=set_plugin target=include:dsh-cache-cleaner enabled=true
```

Client bundles need a page refresh (F5) unless the DSH web dev server is running.

## Checks before opening a pull request

| Check | Command |
| --- | --- |
| Client bundle syntax | `node --check client/client.js` |
| Host half loads | `node -e "import('./lib/index.js').then((m) => console.log(m.name))"` |
| Slot/registration structure | `node scripts/check-client.mjs` |

CI runs the same three commands on Node 22. Add a note in the pull request about
anything you could not verify (for example UI rendering without a browser).

## Reporting a bug

Open an issue with the bug template and include:

- DSH desktop version and OS;
- the affected target id (for example `dsh-prepared-shells`) and the JSON body
  you passed to `cache_scan` / `cache_clean`;
- the error code from the response (`UNKNOWN_TARGET`, `INVALID_AGE`, …) and a
  redacted excerpt of the report.

Never paste a full `~/.dsh` tree listing or anything from `credentials/`.

## Safety issue

If a cleanup deleted something it should not have, please **do not** open a
public issue with paths. Report it via a private advisory (Security → Advisories
→ Report a vulnerability) so it can be investigated before disclosure.

## License

By contributing you agree that your contribution is licensed under the MIT
License of this repository.
