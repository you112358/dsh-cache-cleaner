/**
 * The cache cleaner: one implementation used by BOTH callers (the agent tools
 * and the settings page through the HTTP route).
 *
 * Safety model
 *   - only declared targets are considered; nothing is discovered on the fly
 *     outside their own directories
 *   - a unit must resolve inside ALLOWED_ROOTS and outside PROTECTED_ROOTS
 *   - symlinks/junctions are never followed and never deleted
 *   - `staleHours` targets skip anything newer than the cutoff, so live
 *     subprocess/spill directories are left alone
 *   - files are unlinked, then the now-empty directory is removed; a directory
 *     that still has entries (locked files) is reported as skipped, not forced
 */
import { lstat, readdir, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import {
  ALLOWED_ROOTS,
  CLEANABLE_ROOTS,
  DSH_HOME,
  HOME_DIR,
  LOCAL_APP_DATA,
  PROTECTED_ROOTS,
} from './paths.js'
import { GROUPS, TARGETS, TARGET_IDS } from './targets.js'

const DEFAULT_STALE_HOURS = 6
const MAX_ERRORS = 40
const HOUR_MS = 60 * 60 * 1000

export function humanBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return `${value} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = value / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size >= 100 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`
}

function within(child, root) {
  const rel = path.relative(root, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Decide whether one unit may be deleted.
 *
 * `declared` units come from the plugin-cache discovery: caches of installed
 * plugins living next to the plugin's own data (for example
 * `~/.cc-safety-net/logs` or `%LOCALAPPDATA%/dsh-office/trajectory`), which are
 * deliberately outside the fixed ALLOWED_ROOTS. They stay fenced: never under
 * PROTECTED_ROOTS, and only inside the user's home, local app data or DSH home.
 *
 * Everything else must stay inside ALLOWED_ROOTS. An allowed root itself is
 * only emptied when it is listed in CLEANABLE_ROOTS and the unit mode is
 * `contents` — the updater cache is the one place where the root directory is
 * exactly what has to be emptied.
 */
function isSafe(unit) {
  const target = path.resolve(unit.path)
  for (const root of PROTECTED_ROOTS) {
    if (within(target, path.resolve(root))) return false
  }
  if (unit.declared === true) {
    return [HOME_DIR, LOCAL_APP_DATA, DSH_HOME].some((root) =>
      within(target, path.resolve(root)),
    )
  }
  const cleanableRoot = CLEANABLE_ROOTS.has(target)
  let inside = false
  for (const root of ALLOWED_ROOTS) {
    const resolved = path.resolve(root)
    if (resolved === target) {
      if (!cleanableRoot || unit.mode !== 'contents') return false
      inside = true
      continue
    }
    if (within(target, resolved)) inside = true
  }
  return inside
}

/** Same fence, exported for the safety regression test. */
export function isSafePath(rawPath, mode = 'entry', declared = false) {
  return isSafe({ path: rawPath, mode, declared })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function pushError(list, filePath, error) {
  if (list.length >= MAX_ERRORS) return
  list.push({
    path: String(filePath),
    code: (error && error.code) || 'ERROR',
    message: String((error && error.message) || error || 'unknown error'),
  })
}

function appendErrors(list, extra) {
  for (const error of extra) {
    if (list.length >= MAX_ERRORS) return
    list.push(error)
  }
}

function normalizeStaleHours(value) {
  const hours = Number(value)
  return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_STALE_HOURS
}

function resolveStaleHours(target, configStaleHours) {
  if (target.staleHours === 'config') return configStaleHours
  return target.staleHours == null ? null : Number(target.staleHours)
}

function cutoffFor(hours) {
  return hours == null ? null : Date.now() - hours * HOUR_MS
}

export const HOURS_PER_WEEK = 7 * 24

/**
 * Resolve the requested age filter.
 *
 *   olderThanHours omitted → per-target default (`staleHours: 'config'` targets
 *                            use the configured 6h cutoff, others have none)
 *   olderThanHours: null   → clean everything, including entries written seconds ago
 *   olderThanHours: N      → only entries untouched for N hours (168 = one week)
 */
function resolveAge(input = {}) {
  if (input.olderThanHours === undefined) return { key: 'target', hours: null }
  if (input.olderThanHours === null) return { key: 'all', hours: null }
  const hours = Number(input.olderThanHours)
  if (!Number.isFinite(hours) || hours < 0) {
    throw Object.assign(
      new Error('olderThanHours must be a non-negative number of hours, or null for no age filter'),
      { code: 'INVALID_AGE' },
    )
  }
  return { key: 'custom', hours }
}

function effectiveHours(target, age, configStaleHours) {
  if (age.key === 'all') return null
  if (age.key === 'target') return resolveStaleHours(target, configStaleHours)
  return age.hours
}

function policyHours(age, configStaleHours) {
  if (age.key === 'all') return null
  if (age.key === 'target') return configStaleHours
  return age.hours
}

function describePath(units) {
  if (!units.length) return ''
  const first = units[0].path
  if (units.length === 1) return first
  const parent = path.dirname(first)
  const allSameParent = units.every((unit) => path.dirname(unit.path) === parent)
  return allSameParent ? `${parent}${path.sep}*` : `${first} (+${units.length - 1})`
}

function validateIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw Object.assign(new Error('ids must list at least one cache target id'), {
      code: 'NO_TARGETS',
    })
  }
  const known = new Set(TARGET_IDS)
  const wanted = new Set()
  const unknown = []
  for (const id of ids) {
    if (typeof id !== 'string') continue
    if (known.has(id)) wanted.add(id)
    else unknown.push(id)
  }
  if (unknown.length) {
    throw Object.assign(new Error(`unknown cache target id(s): ${unknown.join(', ')}`), {
      code: 'UNKNOWN_TARGET',
    })
  }
  if (wanted.size === 0) {
    throw Object.assign(new Error('no known cache target id was selected'), { code: 'NO_TARGETS' })
  }
  return wanted
}

export function createCleaner(options = {}) {
  const staleHours = normalizeStaleHours(options.staleHours)
  // Handed to every target: only the plugin-cache target uses them, so one
  // discovery implementation serves both the scan and the clean path.
  const runtime = {
    pluginCacheDiscovery: options.pluginCacheDiscovery,
    pluginCacheExtraPaths: options.pluginCacheExtraPaths,
  }
  const targets = Array.isArray(options.targets) && options.targets.length
    ? TARGETS.filter((target) => options.targets.includes(target.id))
    : TARGETS

  // ---- measuring ---------------------------------------------------------

  async function measure(filePath, stats, acc) {
    if (stats.isSymbolicLink()) {
      acc.skipped += 1
      return
    }
    if (stats.isDirectory()) {
      let names
      try {
        names = await readdir(filePath)
      } catch (error) {
        if (error.code !== 'ENOENT') pushError(acc.errors, filePath, error)
        return
      }
      for (const name of names) {
        const child = path.join(filePath, name)
        let childStats
        try {
          childStats = await lstat(child)
        } catch (error) {
          if (error.code !== 'ENOENT') pushError(acc.errors, child, error)
          continue
        }
        await measure(child, childStats, acc)
      }
      return
    }
    acc.bytes += stats.size
    acc.files += 1
  }

  /** Walk one unit for scanning: counts units/bytes/files and honours the age cutoff. */
  async function walkUnit(unit, cutoff, acc) {
    let stats
    try {
      stats = await lstat(unit.path)
    } catch (error) {
      if (error.code !== 'ENOENT') pushError(acc.errors, unit.path, error)
      return
    }
    if (stats.isSymbolicLink()) {
      acc.skipped += 1
      return
    }
    if (unit.mode === 'contents') {
      if (!stats.isDirectory()) return
      let names
      try {
        names = await readdir(unit.path)
      } catch (error) {
        if (error.code !== 'ENOENT') pushError(acc.errors, unit.path, error)
        return
      }
      for (const name of names) {
        await walkUnit({ path: path.join(unit.path, name), mode: 'entry' }, cutoff, acc)
      }
      return
    }
    if (cutoff != null && stats.mtimeMs > cutoff) {
      acc.fresh += 1
      const recent = { bytes: 0, files: 0, skipped: 0, errors: [] }
      await measure(unit.path, stats, recent)
      acc.freshBytes += recent.bytes
      acc.freshFiles += recent.files
      return
    }
    acc.units += 1
    await measure(unit.path, stats, acc)
  }

  function mergeAcc(into, from) {
    into.bytes += from.bytes
    into.files += from.files
    into.units += from.units
    into.fresh += from.fresh
    into.freshBytes += from.freshBytes
    into.freshFiles += from.freshFiles
    into.skipped += from.skipped
    appendErrors(into.errors, from.errors)
  }

  async function scanTarget(target, age) {
    const row = {
      id: target.id,
      group: target.group,
      title: target.title,
      note: target.note,
      defaultOn: target.defaultOn !== false,
      restart: Boolean(target.restart),
      staleHours: effectiveHours(target, age, staleHours),
      bytes: 0,
      files: 0,
      units: 0,
      fresh: 0,
      freshBytes: 0,
      freshFiles: 0,
      skipped: 0,
      pathLabel: '',
      pathCount: 0,
      errors: [],
    }
    let units = []
    try {
      units = (await target.units(runtime)) || []
    } catch (error) {
      pushError(row.errors, target.id, error)
    }
    const cutoff = cutoffFor(row.staleHours)
    const acc = {
      bytes: 0,
      files: 0,
      units: 0,
      fresh: 0,
      freshBytes: 0,
      freshFiles: 0,
      skipped: 0,
      errors: [],
    }
    row.locations = []
    for (const unit of units) {
      if (!isSafe(unit)) {
        pushError(acc.errors, unit.path, {
          code: 'UNSAFE_PATH',
          message: 'refusing to touch a protected path',
        })
        continue
      }
      // Measure each unit on its own so the agent tools can show which
      // discovered plugin directory holds the bytes, then merge the counters.
      const unitAcc = {
        bytes: 0,
        files: 0,
        units: 0,
        fresh: 0,
        freshBytes: 0,
        freshFiles: 0,
        skipped: 0,
        errors: [],
      }
      await walkUnit(unit, cutoff, unitAcc)
      row.locations.push({
        path: unit.path,
        mode: unit.mode === 'entry' ? 'entry' : 'contents',
        bytes: unitAcc.bytes,
        files: unitAcc.files,
      })
      mergeAcc(acc, unitAcc)
    }
    row.bytes = acc.bytes
    row.files = acc.files
    row.units = acc.units
    row.fresh = acc.fresh
    row.freshBytes = acc.freshBytes
    row.freshFiles = acc.freshFiles
    row.skipped = acc.skipped
    row.pathLabel = describePath(units)
    row.pathCount = units.length
    row.errors = acc.errors
    return row
  }

  // ---- deleting ----------------------------------------------------------

  const LOCKED_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'])
  const RETRY_DELAYS = [80, 200]

  /**
   * Unlink one file, retrying briefly when Windows reports it as locked.
   *
   * The updater cache and the Electron caches commonly have a file being read
   * by the running process; a short retry clears transient sharing violations
   * without ever forcing the deletion.
   */
  async function unlinkFile(filePath, stats, row) {
    let lastError
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
      if (attempt > 0) await delay(RETRY_DELAYS[attempt - 1])
      try {
        await unlink(filePath)
        row.removedFiles += 1
        row.freedBytes += stats.size
        return
      } catch (error) {
        if (error.code === 'ENOENT') return
        lastError = error
        if (!LOCKED_CODES.has(error.code)) break
      }
    }
    pushError(row.errors, filePath, lastError)
    row.skipped += 1
  }

  async function removeTree(filePath, stats, row) {
    if (stats.isSymbolicLink()) {
      row.skipped += 1
      return
    }
    if (stats.isDirectory()) {
      let names
      try {
        names = await readdir(filePath)
      } catch (error) {
        if (error.code === 'ENOENT') return
        pushError(row.errors, filePath, error)
        row.skipped += 1
        return
      }
      for (const name of names) {
        const child = path.join(filePath, name)
        let childStats
        try {
          childStats = await lstat(child)
        } catch (error) {
          if (error.code !== 'ENOENT') pushError(row.errors, child, error)
          continue
        }
        await removeTree(child, childStats, row)
      }
      try {
        await rmdir(filePath)
        row.removedDirs += 1
      } catch (error) {
        if (error.code === 'ENOENT') return
        if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST' || error.code === 'EPERM') {
          row.skipped += 1
          return
        }
        pushError(row.errors, filePath, error)
        row.skipped += 1
      }
      return
    }
    await unlinkFile(filePath, stats, row)
  }

  async function deleteEntry(unit, cutoff, row) {
    let stats
    try {
      stats = await lstat(unit.path)
    } catch (error) {
      if (error.code !== 'ENOENT') pushError(row.errors, unit.path, error)
      return
    }
    if (stats.isSymbolicLink()) {
      row.skipped += 1
      return
    }
    if (cutoff != null && stats.mtimeMs > cutoff) {
      row.fresh += 1
      return
    }
    row.units += 1
    await removeTree(unit.path, stats, row)
  }

  async function deleteUnit(unit, cutoff, row) {
    if (!isSafe(unit)) {
      pushError(row.errors, unit.path, {
        code: 'UNSAFE_PATH',
        message: 'refusing to delete a protected path',
      })
      return
    }
    if (unit.mode !== 'contents') {
      await deleteEntry(unit, cutoff, row)
      return
    }
    let stats
    try {
      stats = await lstat(unit.path)
    } catch (error) {
      if (error.code !== 'ENOENT') pushError(row.errors, unit.path, error)
      return
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) return
    let names
    try {
      names = await readdir(unit.path)
    } catch (error) {
      if (error.code !== 'ENOENT') pushError(row.errors, unit.path, error)
      return
    }
    for (const name of names) {
      await deleteEntry({ path: path.join(unit.path, name), mode: 'entry' }, cutoff, row)
    }
  }

  // ---- public API --------------------------------------------------------

  async function scan(input = {}) {
    const age = resolveAge(input)
    const wanted =
      Array.isArray(input.ids) && input.ids.length ? new Set(input.ids.filter((id) => TARGET_IDS.includes(id))) : null
    const rows = []
    for (const target of targets) {
      if (wanted && !wanted.has(target.id)) continue
      rows.push(await scanTarget(target, age))
    }
    rows.sort((a, b) => b.bytes - a.bytes)
    const totals = rows.reduce(
      (acc, row) => {
        acc.bytes += row.bytes
        acc.files += row.files
        acc.freshBytes += row.freshBytes
        acc.freshFiles += row.freshFiles
        if (row.bytes > 0) acc.targets += 1
        return acc
      },
      { bytes: 0, files: 0, freshBytes: 0, freshFiles: 0, targets: 0 },
    )
    const hours = policyHours(age, staleHours)
    return {
      generatedAt: new Date().toISOString(),
      agePolicy: { key: age.key, hours },
      staleHours: hours,
      groups: GROUPS,
      targets: rows,
      totals,
    }
  }

  async function clean(input = {}) {
    const age = resolveAge(input)
    const wanted = validateIds(input.ids)
    const dryRun = input.dryRun === true
    const rows = []
    for (const target of targets) {
      if (!wanted.has(target.id)) continue
      const row = {
        id: target.id,
        title: target.title,
        freedBytes: 0,
        removedFiles: 0,
        removedDirs: 0,
        skipped: 0,
        units: 0,
        fresh: 0,
        errors: [],
      }
      let units = []
      try {
        units = (await target.units(runtime)) || []
      } catch (error) {
        pushError(row.errors, target.id, error)
      }
      const cutoff = cutoffFor(effectiveHours(target, age, staleHours))
      for (const unit of units) {
        if (dryRun) {
          if (!isSafe(unit)) {
            pushError(row.errors, unit.path, {
              code: 'UNSAFE_PATH',
              message: 'refusing to delete a protected path',
            })
            row.skipped += 1
            continue
          }
          const acc = { bytes: 0, files: 0, units: 0, fresh: 0, skipped: 0, errors: [] }
          await walkUnit(unit, cutoff, acc)
          row.freedBytes += acc.bytes
          row.removedFiles += acc.files
          row.units += acc.units
          row.fresh += acc.fresh
          row.skipped += acc.skipped
          appendErrors(row.errors, acc.errors)
        } else {
          await deleteUnit(unit, cutoff, row)
        }
      }
      rows.push(row)
    }
    rows.sort((a, b) => b.freedBytes - a.freedBytes)
    const totals = rows.reduce(
      (acc, row) => {
        acc.freedBytes += row.freedBytes
        acc.removedFiles += row.removedFiles
        acc.removedDirs += row.removedDirs
        acc.skipped += row.skipped
        acc.fresh += row.fresh
        return acc
      },
      { freedBytes: 0, removedFiles: 0, removedDirs: 0, skipped: 0, fresh: 0 },
    )
    const hours = policyHours(age, staleHours)
    return {
      generatedAt: new Date().toISOString(),
      dryRun,
      agePolicy: { key: age.key, hours },
      staleHours: hours,
      totals,
      targets: rows,
      errors: rows.flatMap((row) => row.errors).slice(0, MAX_ERRORS),
    }
  }

  return { scan, clean, targets, staleHours }
}
