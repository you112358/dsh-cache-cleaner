/*
 * End-to-end deletion test in an isolated fake environment.
 *
 * Runs the cleaner in a child process whose HOME / LOCALAPPDATA / APPDATA /
 * TEMP / DSH_HOME / DSH_PROFILE_DIR all point into a throw-away directory, so
 * it can prove real deletions work — including the updater cache whose unit
 * path is the allowed root itself (the "cannot clean the update download
 * cache" bug) and a discovered plugin cache — without touching the real user
 * data.
 *
 * Run: node tools/check-clean-real.js
 */
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const cleanerUrl = new URL('../lib/cleaner.js', import.meta.url).href
const base = await mkdtemp(path.join(os.tmpdir(), 'dcc-clean-real-'))

const child = String.raw`
import { readFile } from 'node:fs/promises'
import { createCleaner } from ${JSON.stringify(cleanerUrl)}
import { UPDATER_DATA } from ${JSON.stringify(new URL('../lib/paths.js', import.meta.url).href)}

const cleaner = createCleaner({})
const updater = await cleaner.clean({ ids: ['dsh-updater-cache'], olderThanHours: null })
const plugins = await cleaner.clean({ ids: ['plugin-caches'], olderThanHours: null })
console.log(
  JSON.stringify({
    updater,
    plugins,
    updaterDir: UPDATER_DATA,
  }),
)
`

const env = {
  ...process.env,
  HOME: path.join(base, 'home'),
  USERPROFILE: path.join(base, 'home'),
  LOCALAPPDATA: path.join(base, 'local'),
  APPDATA: path.join(base, 'roaming'),
  TEMP: path.join(base, 'temp'),
  TMP: path.join(base, 'temp'),
  DSH_HOME: path.join(base, 'dsh'),
  DSH_PROFILE_DIR: path.join(base, 'dsh', 'profiles', 'desktop'),
}

const failures = []

try {
  const updater = path.join(env.LOCALAPPDATA, '@deepseek-aidsh-desktop-updater')
  await mkdir(path.join(updater, 'pending'), { recursive: true })
  await writeFile(path.join(updater, 'installer.exe'), 'installer-bytes')
  await writeFile(path.join(updater, 'current.blockmap'), 'blockmap-bytes')
  await writeFile(path.join(updater, 'pending', 'next.exe'), 'pending-bytes')

  const pkgDir = path.join(env.DSH_PROFILE_DIR, 'node_modules', 'demo-plugin')
  const declaredCache = path.join(env.HOME, '.demo-plugin', 'blob-store')
  await mkdir(declaredCache, { recursive: true })
  await mkdir(pkgDir, { recursive: true })
  await writeFile(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'demo-plugin', dsh: { cache: ['~/.demo-plugin/blob-store'] } }),
  )
  await writeFile(path.join(declaredCache, 'entry.bin'), 'cache-bytes')
  await mkdir(path.join(env.DSH_PROFILE_DIR), { recursive: true })
  await writeFile(
    path.join(env.DSH_PROFILE_DIR, 'package.json'),
    JSON.stringify({ dependencies: { 'demo-plugin': '1.0.0' } }),
  )
  const pluginLogs = path.join(env.HOME, '.demo-plugin', 'logs')
  await mkdir(pluginLogs, { recursive: true })
  await writeFile(path.join(pluginLogs, 'run.log'), 'log-bytes')

  const result = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
    env,
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    failures.push('child process failed: ' + (result.stderr || result.stdout))
  } else {
    const parsed = JSON.parse(result.stdout.trim().split('\n').pop())
    const updaterRow = parsed.updater.targets.find((row) => row.id === 'dsh-updater-cache')
    const pluginRow = parsed.plugins.targets.find((row) => row.id === 'plugin-caches')
    if (!updaterRow || updaterRow.freedBytes <= 0 || updaterRow.errors.length) {
      failures.push('updater cache was not emptied: ' + JSON.stringify(updaterRow))
    }
    if (!pluginRow || pluginRow.freedBytes <= 0 || pluginRow.errors.length) {
      failures.push('discovered plugin cache was not emptied: ' + JSON.stringify(pluginRow))
    }
    for (const leftover of [
      path.join(updater, 'installer.exe'),
      path.join(updater, 'pending'),
      path.join(declaredCache, 'entry.bin'),
      path.join(pluginLogs, 'run.log'),
    ]) {
      try {
        await stat(leftover)
        failures.push('still present after cleaning: ' + leftover)
      } catch {
        // gone, as expected
      }
    }
  }
} finally {
  await rm(base, { recursive: true, force: true })
}

if (failures.length) {
  console.error('FAIL real cleanup')
  for (const failure of failures) console.error(' - ' + failure)
  process.exitCode = 1
} else {
  console.log('OK real cleanup: updater cache emptied, discovered plugin cache emptied, no leftovers')
}
