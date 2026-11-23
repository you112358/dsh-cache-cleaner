/**
 * Plugin uninstall leftovers.
 *
 * Uninstalling a plugin removes its package, not necessarily the data it wrote.
 * This module finds plugin-shaped directories that no longer belong to any
 * plugin installed in the active profile, from two sources:
 *
 *   1. a small ledger remembers the data roots of plugins while they are
 *      installed, so a later uninstall is reported even when the directory name
 *      does not match the package name;
 *   2. a conservative convention scan of the containers DSH plugins keep data
 *      in (DSH_HOME/storages, DSH_HOME/telemetry, DSH_HOME/dsh-*,
 *      %LOCALAPPDATA%/dsh-*) reports entries whose name cannot be matched to
 *      an installed plugin.
 *
 * Nothing outside DSH_HOME, %LOCALAPPDATA% and the user's home directory is
 * considered, symlinks and PROTECTED_ROOTS are refused, and every candidate is
 * surfaced as its own path so the operator can inspect it before deleting.
 */
import { lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DSH_HOME, HOME_DIR, LOCAL_APP_DATA, PROTECTED_ROOTS, PROFILE_DIR } from './paths.js'
import {
  dataRoots,
  expandHome,
  installedPlugins,
  readJson,
  shortName,
  within,
} from './plugin-caches.js'

const SELF_PACKAGE = 'dsh-cache-cleaner'
const DEFAULT_MIN_AGE_HOURS = 24
const MAX_WALK_ENTRIES = 5000
const MAX_WALK_DEPTH = 8
const MAX_UNITS = 40
const MAX_CHILDREN = 400
const LEDGER_VERSION = 2

/** DSH's own top-level directories, never reported as plugin leftovers. */
const CORE_DIRS = new Set([
  'agent-compare',
  'attachments',
  'cache',
  'data',
  'dsh-runtimes',
  'electron',
  'llm-deepseek',
  'profiles',
  'rewind-snapshots',
  'sessions',
  'skills',
  'storages',
  'telemetry',
  SELF_PACKAGE,
])

/** Entries inside DSH_HOME/storages that belong to DSH itself. */
const CORE_STORAGE = new Set(['session_projcache', 'workspace.json'])

function normalize(value) {
  return value.toLowerCase().replace(/[-_.]/g, '')
}

const STOP_TOKENS = new Set(['plugin', 'dsh', 'cache', 'client', 'desktop', 'server', 'tools'])

function nameTokens(value) {
  return value
    .toLowerCase()
    .split(/[-_.]+/)
    .filter((token) => token.length >= 5 && !STOP_TOKENS.has(token))
}

function ownershipOf(installed) {
  const aliases = new Set()
  const tokens = new Set()
  for (const name of installed) {
    const short = shortName(name)
    for (const candidate of [name, short, short.replace(/^dsh-/, ''), `dsh-${short}`]) {
      aliases.add(candidate.toLowerCase())
      aliases.add(normalize(candidate))
      for (const token of nameTokens(candidate)) tokens.add(token)
    }
  }
  return { aliases, tokens }
}

function ownedByInstalled(name, ownership) {
  if (ownership.aliases.has(name.toLowerCase()) || ownership.aliases.has(normalize(name))) return true
  return nameTokens(name).some((token) => ownership.tokens.has(token))
}

function protectedPath(candidate) {
  return PROTECTED_ROOTS.some((root) => within(candidate, path.resolve(root)))
}

async function isDirectory(candidate) {
  try {
    return (await lstat(candidate)).isDirectory()
  } catch {
    return false
  }
}

async function readLedger(file) {
  const data = await readJson(file)
  // Only the current shape is trusted. An older ledger may hold roots recorded
  // before plugin ownership was checked, so it is discarded and rebuilt.
  if (!data || data.version !== LEDGER_VERSION) return { version: LEDGER_VERSION, roots: {} }
  const roots =
    data && data.roots && typeof data.roots === 'object' && !Array.isArray(data.roots)
      ? data.roots
      : {}
  return { version: LEDGER_VERSION, roots: { ...roots } }
}

async function persistLedger(file, ledger) {
  try {
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8')
  } catch {
    // The ledger is an optimisation; discovery still works without it.
  }
}

/**
 * Newest modification time inside a candidate tree, bounded so a huge leftover
 * cannot stall a scan. A recently written directory is not a leftover: the
 * owning plugin may still be running from another source.
 */
async function newestMtime(root) {
  let newest = 0
  try {
    newest = (await lstat(root)).mtimeMs
  } catch {
    return newest
  }
  let visited = 0
  const stack = [{ dir: root, depth: 0 }]
  while (stack.length && visited < MAX_WALK_ENTRIES) {
    const { dir, depth } = stack.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited > MAX_WALK_ENTRIES) break
      const full = path.join(dir, entry.name)
      try {
        const info = await lstat(full)
        if (info.mtimeMs > newest) newest = info.mtimeMs
        if (entry.isDirectory() && !entry.isSymbolicLink() && depth < MAX_WALK_DEPTH) {
          stack.push({ dir: full, depth: depth + 1 })
        }
      } catch {
        // A single unreadable entry must not abort the scan.
      }
    }
  }
  return newest
}

async function childDirectories(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .slice(0, MAX_CHILDREN)
    .map((entry) => entry.name)
}

/**
 * Discover plugin uninstall leftovers.
 *
 * @param {object} [options]
 * @param {boolean} [options.pluginLeftoverDiscovery] false disables the
 *   convention scan; roots recorded in the ledger are still reported.
 * @param {string[]} [options.pluginLeftoverExtraPaths] extra directories to
 *   treat as leftovers.
 * @param {number} [options.pluginLeftoverMinAgeHours] ignore candidates whose
 *   newest file is younger than this many hours (default 24, 0 disables).
 * @param {string} [options.ledgerFile] override for tests.
 * @param {string} [options.profileDir] override for tests.
 * @param {string} [options.home] override for tests.
 * @param {string} [options.localAppData] override for tests.
 * @param {string} [options.dshHome] override for tests.
 * @returns {Promise<{units: Array<{path: string, mode: 'entry', declared: true, source: string}>, leftovers: Array<{path: string, owner: string, reason: string}>, installed: string[]}>}
 */
export async function discoverPluginLeftovers(options = {}) {
  const profileDir = options.profileDir || PROFILE_DIR
  const home = options.home || HOME_DIR
  const localAppData = options.localAppData || LOCAL_APP_DATA
  const dshHome = options.dshHome || DSH_HOME
  const ledgerFile =
    options.ledgerFile || path.join(dshHome, 'storages', SELF_PACKAGE, 'plugin-roots.json')
  const heuristics = options.pluginLeftoverDiscovery !== false
  const extraPaths = Array.isArray(options.pluginLeftoverExtraPaths)
    ? options.pluginLeftoverExtraPaths
    : []
  const minAgeHours =
    Number.isFinite(options.pluginLeftoverMinAgeHours) && options.pluginLeftoverMinAgeHours >= 0
      ? options.pluginLeftoverMinAgeHours
      : DEFAULT_MIN_AGE_HOURS
  const cutoff = minAgeHours > 0 ? Date.now() - minAgeHours * 60 * 60 * 1000 : 0

  const installed = await installedPlugins(profileDir)
  const installedSet = new Set(installed)
  const ownership = ownershipOf(installed)
  const ledger = await readLedger(ledgerFile)
  const snapshot = JSON.stringify(ledger.roots)

  // Remember the data roots of the plugins that are installed right now.
  for (const name of installed) {
    for (const root of dataRoots(name, home, localAppData, dshHome)) {
      if (!(await isDirectory(root))) continue
      ledger.roots[root] = { plugin: name, seenAt: new Date().toISOString() }
    }
  }
  if (JSON.stringify(ledger.roots) !== snapshot) await persistLedger(ledgerFile, ledger)

  const units = []
  const leftovers = []
  const seen = new Set()

  const add = async (candidate, owner, reason) => {
    if (units.length >= MAX_UNITS) return
    let resolved
    try {
      resolved = path.resolve(candidate)
    } catch {
      return
    }
    if (seen.has(resolved) || protectedPath(resolved)) return
    if ([dshHome, home, localAppData].some((root) => path.resolve(root) === resolved)) return
    if (!(await isDirectory(resolved))) return
    const newest = await newestMtime(resolved)
    if (cutoff && newest > cutoff) return
    seen.add(resolved)
    leftovers.push({ path: resolved, owner: owner || '', reason, lastModified: new Date(newest).toISOString() })
    units.push({
      path: resolved,
      mode: 'entry',
      declared: true,
      source: `leftover:${owner || 'unmatched'}`,
    })
  }

  // 1. Roots that were recorded while their plugin was still installed.
  for (const [root, record] of Object.entries(ledger.roots)) {
    const owner = record && typeof record.plugin === 'string' ? record.plugin : ''
    if (!owner || installedSet.has(owner)) continue
    await add(root, owner, 'recorded')
  }

  // 2. Convention scan of the containers DSH plugins keep data in.
  if (heuristics) {
    for (const name of await childDirectories(path.join(dshHome, 'storages'))) {
      if (CORE_STORAGE.has(name) || CORE_DIRS.has(name) || ownedByInstalled(name, ownership)) continue
      await add(path.join(dshHome, 'storages', name), '', 'storages')
    }
    for (const name of await childDirectories(path.join(dshHome, 'telemetry'))) {
      if (CORE_DIRS.has(name) || ownedByInstalled(name, ownership)) continue
      await add(path.join(dshHome, 'telemetry', name), '', 'telemetry')
    }
    for (const name of await childDirectories(dshHome)) {
      if (!name.startsWith('dsh-') || CORE_DIRS.has(name) || ownedByInstalled(name, ownership)) continue
      await add(path.join(dshHome, name), '', 'dsh-home')
    }
    for (const name of await childDirectories(localAppData)) {
      if (!name.startsWith('dsh-') || ownedByInstalled(name, ownership)) continue
      await add(path.join(localAppData, name), '', 'local-app-data')
    }
  }

  // 3. Explicit extra paths from the plugin config (same boundaries).
  for (const raw of extraPaths) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const resolved = path.resolve(expandHome(raw.trim(), home))
    const bounded = [home, localAppData, dshHome].some((base) =>
      within(resolved, path.resolve(base)),
    )
    if (!bounded) continue
    await add(resolved, '', 'config:extra')
  }

  // Drop candidates nested inside an already selected one.
  const ordered = units.slice().sort((a, b) => a.path.length - b.path.length)
  const prunedUnits = []
  const prunedLeftovers = []
  for (const unit of ordered) {
    if (prunedUnits.some((parent) => within(unit.path, parent.path))) continue
    prunedUnits.push(unit)
    const match = leftovers.find((item) => item.path === unit.path)
    if (match) prunedLeftovers.push(match)
  }

  return { units: prunedUnits, leftovers: prunedLeftovers, installed }
}
