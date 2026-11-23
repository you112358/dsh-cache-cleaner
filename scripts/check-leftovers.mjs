import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { discoverPluginLeftovers } from '../lib/leftovers.js'

const root = await mkdtemp(path.join(tmpdir(), 'dcc-leftovers-'))
const home = path.join(root, 'home')
const localAppData = path.join(root, 'local')
const dshHome = path.join(root, 'dsh')
const profileDir = path.join(root, 'profile')
const ledgerFile = path.join(dshHome, 'storages', 'dsh-cache-cleaner', 'plugin-roots.json')

async function dir(...parts) {
  const target = path.join(...parts)
  await mkdir(target, { recursive: true })
  return target
}

try {
  await dir(profileDir, 'node_modules', 'demo-plugin')
  await writeFile(
    path.join(profileDir, 'package.json'),
    JSON.stringify({
      name: 'demo-profile',
      private: true,
      dependencies: { 'demo-plugin': '1.0.0', '@scope/other-plugin': '2.0.0' },
    }),
  )

  // Data of plugins that are still installed: must never be reported.
  await dir(home, '.demo-plugin', 'cache')
  await dir(localAppData, 'dsh-demo-plugin', 'logs')

  // A root recorded in the ledger for a plugin that is gone.
  await dir(home, '.ghost-plugin', 'compile-cache')
  await dir(dshHome, 'storages', 'dsh-cache-cleaner')
  await writeFile(
    ledgerFile,
    JSON.stringify({
      version: 2,
      roots: { [path.join(home, '.ghost-plugin')]: { plugin: 'ghost-plugin', seenAt: '2026-01-01T00:00:00.000Z' } },
    }),
  )

  // Shaped leftovers inside the containers.
  await dir(dshHome, 'storages', 'old-store')
  await dir(dshHome, 'telemetry', 'gone-plugin')
  await dir(dshHome, 'dsh-pet')
  await dir(localAppData, 'dsh-blender-rt', 'helper-1')

  // DSH's own directories must stay invisible.
  await dir(dshHome, 'storages', 'session_projcache')
  await dir(dshHome, 'dsh-runtimes', 'runtime')

  // Still being written to: the 24 h freshness guard must skip it.
  await dir(dshHome, 'dsh-fresh-plugin', 'logs')
  await writeFile(path.join(dshHome, 'dsh-fresh-plugin', 'logs', 'today.log'), 'active\n')

  // Extra paths: one bounded, one outside every allowed base.
  await dir(home, '.custom-extra')
  await dir(root, 'outside')

  const first = await discoverPluginLeftovers({
    profileDir,
    home,
    localAppData,
    dshHome,
    ledgerFile,
    pluginLeftoverMinAgeHours: 0,
    pluginLeftoverExtraPaths: [path.join(home, '.custom-extra'), path.join(root, 'outside')],
  })

  const found = new Set(first.units.map((unit) => unit.path))
  const expect = [
    path.join(home, '.ghost-plugin'),
    path.join(dshHome, 'storages', 'old-store'),
    path.join(dshHome, 'telemetry', 'gone-plugin'),
    path.join(dshHome, 'dsh-pet'),
    path.join(localAppData, 'dsh-blender-rt'),
    path.join(home, '.custom-extra'),
    path.join(dshHome, 'dsh-fresh-plugin'),
  ]
  for (const candidate of expect) assert.ok(found.has(candidate), `missing leftover ${candidate}`)
  assert.equal(found.size, expect.length, `unexpected leftovers: ${[...found].join(', ')}`)
  assert.ok(!found.has(path.join(root, 'outside')), 'extra path outside the allowed bases must be refused')
  for (const unit of first.units) {
    assert.equal(unit.mode, 'entry')
    assert.equal(unit.declared, true)
    assert.ok(unit.source.startsWith('leftover:'), unit.source)
  }

  const ledger = JSON.parse(await readFile(ledgerFile, 'utf8'))
  assert.ok(ledger.roots[path.join(home, '.demo-plugin')], 'installed data root must be recorded')
  assert.ok(ledger.roots[path.join(localAppData, 'dsh-demo-plugin')], 'installed data root must be recorded')
  assert.ok(ledger.roots[path.join(home, '.ghost-plugin')], 'recording must not drop old roots')
  assert.equal(ledger.roots[path.join(home, '.demo-plugin')].plugin, 'demo-plugin')

  // An older ledger (pre-dsh-manifest filter) must be ignored entirely.
  const legacyLedger = path.join(root, 'legacy-roots.json')
  await writeFile(
    legacyLedger,
    JSON.stringify({
      version: 1,
      roots: { [path.join(localAppData, 'python')]: { plugin: '@lezer/python', seenAt: '2026-01-01T00:00:00.000Z' } },
    }),
  )
  const legacy = await discoverPluginLeftovers({
    profileDir,
    home,
    localAppData,
    dshHome,
    ledgerFile: legacyLedger,
    pluginLeftoverDiscovery: false,
    pluginLeftoverMinAgeHours: 0,
  })
  assert.deepEqual(legacy.units, [], 'an old ledger must not be trusted')

  // Default guard: everything was just written, so nothing is a leftover yet.
  const guarded = await discoverPluginLeftovers({ profileDir, home, localAppData, dshHome, ledgerFile })
  assert.equal(
    guarded.units.length,
    0,
    `fresh candidates must be skipped: ${guarded.units.map((unit) => unit.path).join(', ')}`,
  )
  assert.ok(first.leftovers.some((item) => item.path === path.join(dshHome, 'dsh-fresh-plugin') && item.lastModified))

  const limited = await discoverPluginLeftovers({
    profileDir,
    home,
    localAppData,
    dshHome,
    ledgerFile,
    pluginLeftoverDiscovery: false,
    pluginLeftoverMinAgeHours: 0,
    pluginLeftoverExtraPaths: [path.join(home, '.custom-extra')],
  })
  const limitedPaths = limited.units.map((unit) => unit.path).sort()
  assert.deepEqual(limitedPaths, [path.join(home, '.custom-extra'), path.join(home, '.ghost-plugin')].sort())

  console.log('OK leftover discovery: recorded roots, convention scan, installed plugins kept, extras bounded')
} finally {
  await rm(root, { recursive: true, force: true })
}
