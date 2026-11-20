/*
 * Plugin-cache discovery test (no real user data involved).
 *
 * Builds a throw-away profile in the temp directory and checks that discovery
 * collects only the plugin's declared `dsh.cache` paths and conventional
 * cache directories, that it never escapes the plugin's own data roots, and
 * that `pluginCacheDiscovery: false` keeps declared paths only.
 *
 * Run: node tools/check-plugin-caches.js
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { discoverPluginCaches } from '../lib/plugin-caches.js'

const failures = []
const base = await mkdtemp(path.join(os.tmpdir(), 'dcc-discovery-'))

try {
  const profile = path.join(base, 'profile')
  const home = path.join(base, 'home')
  const localAppData = path.join(base, 'local')
  const dshHome = path.join(base, 'dsh')
  const pkgDir = path.join(profile, 'node_modules', 'demo-plugin')
  const declaredCache = path.join(home, '.demo-plugin', 'blob-store')
  const packageCache = path.join(pkgDir, 'cache')
  const homeLogs = path.join(home, '.demo-plugin', 'logs')
  const homeData = path.join(home, '.demo-plugin', 'data-not-cache')
  const localCache = path.join(localAppData, 'dsh-demo-plugin', 'cache')
  const dshTmp = path.join(dshHome, 'demo-plugin', 'tmp')
  const escape = path.join(home, 'escape')
  const outside = path.join(base, 'elsewhere')

  for (const dir of [declaredCache, packageCache, homeLogs, homeData, localCache, dshTmp, escape, outside]) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(path.join(pkgDir, 'index.js'), '// fixture\n')
  await writeFile(
    path.join(profile, 'package.json'),
    JSON.stringify({ dependencies: { 'demo-plugin': '1.0.0' } }),
  )
  await writeFile(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: 'demo-plugin',
      dsh: { cache: ['~/.demo-plugin/blob-store', '../outside', '~/escape'] },
    }),
  )

  const discovered = await discoverPluginCaches({ profileDir: profile, home, localAppData, dshHome })
  const found = discovered.units.map((unit) => unit.path).sort()
  const expected = [declaredCache, homeLogs, localCache, dshTmp].sort()

  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    failures.push('unexpected units:\n  found:    ' + found.join('\n           ') + '\n  expected: ' + expected.join('\n            '))
  }
  if (!discovered.plugins.includes('demo-plugin')) failures.push('installed plugin was not listed')
  if (found.includes(homeData)) failures.push('a non-cache directory was included')
  if (found.includes(packageCache)) failures.push('a directory inside the installed package was included')
  if (found.includes(escape)) failures.push('a declared path escaped the plugin data roots')
  if (found.includes(outside)) failures.push('a declared path outside the profile was included')

  const declaredOnly = await discoverPluginCaches({
    profileDir: profile,
    home,
    localAppData,
    dshHome,
    pluginCacheDiscovery: false,
  })
  const declaredPaths = declaredOnly.units.map((unit) => unit.path)
  if (declaredPaths.length !== 1 || declaredPaths[0] !== declaredCache) {
    failures.push('pluginCacheDiscovery: false should keep the declared path only, got ' + JSON.stringify(declaredPaths))
  }

  const withExtra = await discoverPluginCaches({
    profileDir: profile,
    home,
    localAppData,
    dshHome,
    pluginCacheExtraPaths: [homeLogs, outside],
  })
  if (withExtra.units.filter((unit) => unit.path === homeLogs).length !== 1) {
    failures.push('a duplicate extra path produced a duplicate unit')
  }
  if (withExtra.units.some((unit) => unit.path === outside)) {
    failures.push('an extra path outside the user data directories was accepted')
  }
} finally {
  await rm(base, { recursive: true, force: true })
}

if (failures.length) {
  console.error('FAIL plugin-cache discovery')
  for (const failure of failures) console.error(' - ' + failure)
  process.exitCode = 1
} else {
  console.log('OK plugin-cache discovery: declared + conventional units, escapes and non-cache dirs refused')
}
