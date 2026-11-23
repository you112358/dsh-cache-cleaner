/**
 * Plugin-cache discovery for the generic "Plugin caches" target.
 *
 * The target must work on any machine, where every user installs a different
 * set of plugins, so nothing here is hard-coded per plugin. A path is only
 * collected when BOTH are true:
 *
 *   1. it belongs to a plugin that is actually installed in the active
 *      profile (`<profile>/package.json` dependencies), and
 *   2. it is either declared by that plugin in its own `package.json`
 *      (`dsh.cache`, an open extension point for plugin authors) or it is a
 *      conventionally named cache directory next to the plugin's data:
 *        ~/.<plugin>/{cache,.cache,compile-cache,logs,tmp}
 *        %LOCALAPPDATA%/<plugin>/{cache,.cache,compile-cache,logs,tmp}
 *        %LOCALAPPDATA%/dsh-<plugin>/…
 *        <DSH_HOME>/<plugin>/…
 *
 * Declared paths are bounded on purpose: a manifest may only point inside
 * those per-plugin data roots (never inside the installed package itself, and
 * never elsewhere), so a hostile manifest cannot aim the cleaner at, say, the
 * Windows directory or at another plugin's installation.
 */
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { DSH_HOME, HOME_DIR, LOCAL_APP_DATA, PROFILE_DIR, PROTECTED_ROOTS } from './paths.js'

const SELF_PACKAGE = 'dsh-cache-cleaner'
const CACHE_NAMES = ['cache', '.cache', 'compile-cache', 'logs', 'tmp']
const MAX_UNITS = 60
const MAX_PLUGINS = 200

export function within(child, root) {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function strictlyWithin(child, root) {
  const rel = path.relative(root, child)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function isProtected(candidate) {
  return PROTECTED_ROOTS.some((root) => within(candidate, path.resolve(root)))
}

export async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

export function shortName(name) {
  const index = name.lastIndexOf('/')
  return index === -1 ? name : name.slice(index + 1)
}

export function expandHome(value, home) {
  if (value === '~') return home
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(home, value.slice(2))
  return value
}

/** The directories a plugin is allowed to keep its own data in. */
export function dataRoots(name, home, localAppData, dshHome) {
  const short = shortName(name)
  const roots = [
    path.join(home, `.${short}`),
    path.join(localAppData, short),
    path.join(dshHome, short),
  ]
  if (!short.startsWith('dsh-')) roots.push(path.join(localAppData, `dsh-${short}`))
  return roots
}

/** Normalize the `dsh.cache` manifest field into `{ path, mode }` records. */
function manifestEntries(pkg, pkgDir, home) {
  const field = pkg && pkg.dsh ? pkg.dsh.cache : undefined
  if (!field) return []
  const raw = []
  if (typeof field === 'string') {
    raw.push({ path: field })
  } else if (Array.isArray(field)) {
    for (const item of field) raw.push(typeof item === 'string' ? { path: item } : item)
  } else if (typeof field === 'object') {
    const listed = field.path
      ? [field.path]
      : Array.isArray(field.paths)
        ? field.paths
        : []
    for (const item of listed) raw.push(typeof item === 'string' ? { path: item, mode: field.mode } : item)
  }
  const out = []
  for (const item of raw) {
    if (!item || typeof item.path !== 'string' || !item.path.trim()) continue
    const expanded = expandHome(item.path.trim(), home)
    const resolved = path.isAbsolute(expanded) ? path.normalize(expanded) : path.resolve(pkgDir, expanded)
    out.push({
      path: resolved,
      mode: item.mode === 'entry' || item.mode === 'contents' ? item.mode : null,
    })
  }
  return out
}

/** Installed plugin package names of one profile. */
export async function installedPlugins(profileDir) {
  const manifest = await readJson(path.join(profileDir, 'package.json'))
  const dependencies =
    manifest && manifest.dependencies && typeof manifest.dependencies === 'object'
      ? Object.keys(manifest.dependencies)
      : []
  const names = dependencies.filter((name) => typeof name === 'string' && name !== SELF_PACKAGE)

  // Also honour packages still present in node_modules (a hand-managed or
  // partially uninstalled profile): their data must not be called a leftover.
  const root = path.join(profileDir, 'node_modules')
  const out = new Set(names)
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    entries = []
  }
  // Only packages that actually declare a DSH manifest are plugins: node_modules
  // also holds hoisted libraries, and their caches are not ours to judge.
  const candidates = []
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      let scoped = []
      try {
        scoped = await readdir(path.join(root, entry.name), { withFileTypes: true })
      } catch {
        scoped = []
      }
      for (const child of scoped) {
        if (child.isDirectory()) candidates.push(`${entry.name}/${child.name}`)
      }
      continue
    }
    candidates.push(entry.name)
  }
  for (const name of candidates) {
    const manifest = await readJson(path.join(root, name, 'package.json'))
    if (manifest && manifest.dsh && typeof manifest.dsh === 'object') out.add(name)
  }
  return [...out].filter((name) => name !== SELF_PACKAGE).slice(0, MAX_PLUGINS)
}

/** Cache-named children that already exist directly under one data root. */
async function conventionalEntries(root) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => CACHE_NAMES.includes(entry.name.toLowerCase()))
    .map((entry) => path.join(root, entry.name))
}

/**
 * Discover cleanable plugin caches.
 *
 * @param {object} [options]
 * @param {boolean} [options.pluginCacheDiscovery] false disables convention
 *   scanning (declared `dsh.cache` paths are still honoured).
 * @param {string[]} [options.pluginCacheExtraPaths] extra cache directories the
 *   operator wants included regardless of conventions.
 * @param {string} [options.profileDir] override for tests.
 * @param {string} [options.home] override for tests.
 * @param {string} [options.localAppData] override for tests.
 * @param {string} [options.dshHome] override for tests.
 * @returns {Promise<{ units: Array<{path: string, mode: 'contents'|'entry', declared: true, source: string}>, plugins: string[] }>}
 */
export async function discoverPluginCaches(options = {}) {
  const profileDir = options.profileDir || PROFILE_DIR
  const home = options.home || HOME_DIR
  const localAppData = options.localAppData || LOCAL_APP_DATA
  const dshHome = options.dshHome || DSH_HOME
  const conventions = options.pluginCacheDiscovery !== false
  const extraPaths = Array.isArray(options.pluginCacheExtraPaths)
    ? options.pluginCacheExtraPaths
    : []

  const units = []
  const seen = new Set()

  const add = async (candidate, mode, source) => {
    if (units.length >= MAX_UNITS) return
    let resolved
    try {
      resolved = path.resolve(candidate)
    } catch {
      return
    }
    if (seen.has(resolved) || isProtected(resolved)) return
    let info
    try {
      info = await lstat(resolved)
    } catch {
      return
    }
    if (info.isSymbolicLink()) return
    seen.add(resolved)
    const chosen =
      mode === 'entry' || mode === 'contents' ? mode : info.isDirectory() ? 'contents' : 'entry'
    units.push({ path: resolved, mode: chosen, declared: true, source })
  }

  const plugins = await installedPlugins(profileDir)
  for (const name of plugins) {
    const pkgDir = path.join(profileDir, 'node_modules', ...name.split('/'))
    const pkg = await readJson(path.join(pkgDir, 'package.json'))
    const roots = dataRoots(name, home, localAppData, dshHome)

    // 1. What the plugin itself declared.
    //
    // Declared paths must live next to the plugin's own data, never inside the
    // installed package: the profile (which owns node_modules) is a protected
    // root, so a plugin cannot declare part of its own installation away.
    for (const entry of manifestEntries(pkg, pkgDir, home)) {
      if (within(entry.path, pkgDir)) continue
      const bounded = roots.some((base) => strictlyWithin(entry.path, path.resolve(base)))
      if (!bounded) continue
      await add(entry.path, entry.mode, `${name}:declared`)
    }

    // 2. Conventional per-plugin cache directories.
    if (conventions) {
      for (const root of roots) {
        for (const candidate of await conventionalEntries(root)) {
          await add(candidate, null, `${name}:convention`)
        }
      }
    }
  }

  // 3. Explicit extra paths from the plugin config (bounded like declared ones).
  for (const raw of extraPaths) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const expanded = expandHome(raw.trim(), home)
    const resolved = path.resolve(expanded)
    const bounded = [home, localAppData, dshHome].some((base) =>
      within(resolved, path.resolve(base)),
    )
    if (!bounded) continue
    await add(resolved, null, 'config:extra')
  }

  // Drop entries already covered by a discovered parent directory.
  const ordered = units.slice().sort((a, b) => a.path.length - b.path.length)
  const pruned = []
  for (const unit of ordered) {
    if (pruned.some((parent) => parent.mode === 'contents' && within(unit.path, parent.path))) continue
    pruned.push(unit)
  }

  return { units: pruned, plugins }
}
