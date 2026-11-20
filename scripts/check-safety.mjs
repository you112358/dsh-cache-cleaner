/*
 * Safety-fence regression test.
 *
 * The updater cache was reported as "unable to clean" because its unit path IS
 * the allowed root, and the fence refused to delete an allowed root at all.
 * This test pins the rule that replaced it: allowed roots stay unremovable,
 * except the explicitly cleanable updater cache whose *contents* may be
 * deleted; discovered plugin caches stay inside the user's data directories;
 * protected roots never pass.
 *
 * Run: node tools/check-safety.js
 */
import path from 'node:path'
import { isSafePath } from '../lib/cleaner.js'
import { DSH_HOME, HOME_DIR, LOCAL_APP_DATA, TEMP_DIR, UPDATER_DATA } from '../lib/paths.js'

const failures = []

function expect(label, actual, wanted) {
  if (actual !== wanted) failures.push(`${label}: expected ${wanted}, got ${actual}`)
}

const outsideOfHome = path.join(path.parse(HOME_DIR).root, 'Windows', 'System32')

// The reported bug: the updater cache directory must be emptyable.
expect('updater contents', isSafePath(UPDATER_DATA, 'contents'), true)
expect('updater as entry', isSafePath(UPDATER_DATA, 'entry'), false)
expect('updater child', isSafePath(path.join(UPDATER_DATA, 'pending'), 'entry'), true)
expect('updater child contents', isSafePath(path.join(UPDATER_DATA, 'pending'), 'contents'), true)

// Every other allowed root keeps the old behaviour.
expect('DSH home', isSafePath(DSH_HOME, 'contents'), false)
expect('DSH home as entry', isSafePath(DSH_HOME, 'entry'), false)
expect('DSH cache child', isSafePath(path.join(DSH_HOME, 'cache', 'x'), 'contents'), true)
expect('temp child', isSafePath(path.join(TEMP_DIR, 'dsh-demo'), 'entry'), true)

// Protected roots are refused in both directions, declared or not.
expect('sessions', isSafePath(path.join(DSH_HOME, 'sessions', 'x'), 'entry'), false)
expect('profiles declared', isSafePath(path.join(DSH_HOME, 'profiles', 'x'), 'contents', true), false)
expect('dsh-runtimes', isSafePath(path.join(DSH_HOME, 'dsh-runtimes', 'python'), 'contents'), false)

// A path outside every allowed root never passes, even when a plugin declared it.
expect('outside', isSafePath(path.join(HOME_DIR, '..', 'dcc-outside'), 'contents'), false)
expect('outside declared', isSafePath(outsideOfHome, 'contents', true), false)

// Discovered plugin caches live next to the plugin data, inside the user's dirs.
expect('declared home cache', isSafePath(path.join(HOME_DIR, '.demo-plugin', 'logs'), 'contents', true), true)
expect('declared local cache', isSafePath(path.join(LOCAL_APP_DATA, 'demo'), 'contents', true), true)

if (failures.length) {
  console.error('FAIL safety fence')
  for (const failure of failures) console.error(' - ' + failure)
  process.exitCode = 1
} else {
  console.log('OK safety fence: updater contents cleanable, roots/protected/outside refused')
}
