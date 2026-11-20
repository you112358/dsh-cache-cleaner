/**
 * Shared location constants and safety fences.
 *
 * Kept in its own module so the target registry and the plugin-cache
 * discovery can both import them without a cycle.
 *
 * Safety model (enforced by lib/cleaner.js, not here):
 *   - a unit must resolve inside ALLOWED_ROOTS or be explicitly `declared`
 *     by the plugin-cache discovery (which only emits conventional cache
 *     directories of installed plugins)
 *   - nothing inside PROTECTED_ROOTS is ever removed
 *   - the root of an allowed root is only removable when listed in
 *     CLEANABLE_ROOTS, and even then only its *contents* (mode `contents`)
 *   - symlinks/junctions are never followed and never deleted
 */
import os from 'node:os'
import path from 'node:path'

export const HOME_DIR = os.homedir()
export const DSH_HOME = process.env.DSH_HOME || path.join(HOME_DIR, '.dsh')
export const TEMP_DIR = process.env.TEMP || process.env.TMP || os.tmpdir()
export const PROFILE_DIR =
  process.env.DSH_PROFILE_DIR || path.join(DSH_HOME, 'profiles', 'desktop')
export const LOCAL_APP_DATA =
  process.env.LOCALAPPDATA || path.join(HOME_DIR, 'AppData', 'Local')
export const DESKTOP_DATA = path.join(
  process.env.APPDATA || path.join(HOME_DIR, 'AppData', 'Roaming'),
  '@deepseek-ai',
  'dsh-desktop',
)
export const UPDATER_DATA = path.join(LOCAL_APP_DATA, '@deepseek-aidsh-desktop-updater')
export const CC_SAFETY_NET = path.join(HOME_DIR, '.cc-safety-net')

/** Roots a deletion unit may live under. Anything else is refused. */
export const ALLOWED_ROOTS = [DSH_HOME, TEMP_DIR, DESKTOP_DATA, UPDATER_DATA, CC_SAFETY_NET]

/**
 * Allowed roots whose *contents* may be deleted.
 *
 * `isSafe` normally refuses a unit that IS an allowed root (so a future bug
 * can never rm -rf the whole DSH home); the updater cache directory is the
 * one place where the root itself is exactly what has to be emptied.
 */
export const CLEANABLE_ROOTS = new Set([UPDATER_DATA])

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
