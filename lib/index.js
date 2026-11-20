/**
 * dsh-cache-cleaner — Host half.
 *
 * One implementation (createCleaner) with two callers:
 *   1. the agent tools `cache_scan` / `cache_clean`
 *   2. the settings page, through the fenced HTTP route below
 *
 * The route is a plain Web route on purpose: the browser half of a bundled
 * plugin cannot use the dynamic-package `host.call` channel, so it talks to the
 * Host over HTTP like other bundled plugins do, and every request passes
 * Connection's trust check first.
 */
import { createCleaner, humanBytes } from './cleaner.js'

export const inject = ['tools', 'webServer', 'connection']

export const name = 'dsh-cache-cleaner'

const ROUTE_PREFIX = '/dsh-cache-cleaner/api'
const MAX_BODY_BYTES = 64 * 1024

export function apply(ctx, config) {
  // Config keys understood by createCleaner:
  //   staleHours               age cutoff for targets declared `staleHours: 'config'`
  //   targets                  allowlist of target ids (default: every target)
  //   pluginCacheDiscovery     false disables conventional plugin-cache scanning
  //   pluginCacheExtraPaths    extra plugin cache directories to include
  const cleaner = createCleaner(config || {})

  ctx.effect(
    () => ctx.tools.register(createScanTool(cleaner)),
    'dsh-cache-cleaner: cache_scan tool',
  )
  ctx.effect(
    () => ctx.tools.register(createCleanTool(cleaner)),
    'dsh-cache-cleaner: cache_clean tool',
  )
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: createRouteHandler(ctx, cleaner),
      }),
    'dsh-cache-cleaner: settings route',
  )
}

// ---- agent tools ---------------------------------------------------------

const AGE_PARAMETER = {
  type: ['number', 'null'],
  description:
    'Age filter for what counts as a cache worth removing. 168 removes only entries untouched for a week (7×24h); null removes everything, including caches written seconds ago; omit to use the per-target default cutoff (temp targets keep entries newer than 6h).',
}

function ageArgs(args) {
  if (!args || args.olderThanHours === undefined) return {}
  return { olderThanHours: args.olderThanHours }
}

function describeAge(result) {
  const policy = result.agePolicy || { key: 'target', hours: result.staleHours }
  if (policy.key === 'all') return 'Age filter: none — every cache entry is eligible, including fresh ones'
  if (policy.key === 'target') return 'Age filter: per target (temp targets skip entries newer than 6h)'
  return `Age filter: only entries untouched for ${policy.hours}h`
}

function createScanTool(cleaner) {
  return {
    name: 'cache_scan',
    description:
      'Scan the rebuildable caches of this DeepSeek Harness installation: core caches, temp spill, desktop client caches and plugin caches. ' +
      'Plugin caches are discovered from the plugins installed in the active profile, so the same target id works on every machine. ' +
      'Read-only. Returns one row per target with its id, reclaimable size, file count and path; pass those ids to cache_clean to free space. ' +
      'Use olderThanHours to see what a week-old-only cleanup would reclaim (168) versus everything (null).',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional target ids to restrict the scan to. Omit to scan every target.',
        },
        olderThanHours: AGE_PARAMETER,
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderScan(value) }],
    },
    async execute(args) {
      return cleaner.scan({ ids: args && args.ids, ...ageArgs(args) })
    },
  }
}

function createCleanTool(cleaner) {
  return {
    name: 'cache_clean',
    description:
      'Delete the selected rebuildable caches returned by cache_scan. Only declared, non-protected cache locations are touched; symlinks are skipped, and files held open by a running process are reported instead of forced. ' +
      'The age filter defaults per target (temp targets keep entries newer than 6h); pass olderThanHours: 168 to remove only caches untouched for a week, or olderThanHours: null to clear everything regardless of age. ' +
      'Session logs, attachments, rewind snapshots and plugin installations are never touched. Use dryRun to preview without deleting.',
    parameters: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Target ids to clean, exactly as returned by cache_scan.',
        },
        dryRun: {
          type: 'boolean',
          description: 'Only report what would be freed; delete nothing.',
        },
        olderThanHours: AGE_PARAMETER,
      },
      required: ['ids'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: renderClean(value) }],
    },
    async execute(args) {
      return cleaner.clean({
        ids: args && args.ids,
        dryRun: Boolean(args && args.dryRun),
        ...ageArgs(args),
      })
    },
  }
}

function renderScan(result) {
  const lines = []
  lines.push(
    `Cache scan · ${humanBytes(result.totals.bytes)} reclaimable · ${result.totals.files} files · ` +
      `${result.totals.targets}/${result.targets.length} targets with data`,
  )
  lines.push(describeAge(result))
  if (result.totals.freshBytes > 0) {
    lines.push(
      `Recently written and kept by the age filter: ${humanBytes(result.totals.freshBytes)} · ` +
        `${result.totals.freshFiles} files`,
    )
  }
  lines.push('')
  for (const group of result.groups) {
    const rows = result.targets.filter((row) => row.group === group.id)
    if (!rows.length) continue
    lines.push(`## ${group.title.zh} / ${group.title.en}`)
    for (const row of rows) {
      const parts = [row.id, row.bytes > 0 ? humanBytes(row.bytes) : 'empty']
      if (row.files) parts.push(`${row.files} files`)
      if (row.fresh) parts.push(`${row.fresh} newer skipped`)
      if (row.freshBytes) parts.push(`${humanBytes(row.freshBytes)} kept`)
      if (row.restart) parts.push('app restart recommended')
      lines.push(`- ${parts.join(' · ')} — ${row.pathLabel || 'path missing'}`)
      const locations = (row.locations || []).filter((location) => location.bytes > 0)
      if (locations.length > 1 || (row.id === 'plugin-caches' && locations.length)) {
        for (const location of locations.slice(0, 8)) {
          lines.push(
            `    · ${humanBytes(location.bytes)} · ${location.files} files — ${location.path}`,
          )
        }
        if (locations.length > 8) lines.push(`    · …+${locations.length - 8} more`)
      }
    }
    lines.push('')
  }
  lines.push('Call cache_clean with the ids to remove (dryRun: true previews without deleting).')
  return lines.join('\n')
}

function renderClean(result) {
  const totals = result.totals
  const lines = []
  if (result.dryRun) {
    lines.push(`Cache clean preview (dry run) · would free ${humanBytes(totals.freedBytes)}`)
  } else {
    lines.push(`Cache clean · freed ${humanBytes(totals.freedBytes)}`)
  }
  lines.push(
    `${totals.removedFiles} files · ${totals.removedDirs} directories removed · ` +
      `${totals.skipped} entries skipped · ${totals.fresh} newer entries left alone`,
  )
  lines.push(describeAge(result))
  lines.push('')
  for (const row of result.targets) {
    if (!row.units && !row.errors.length) continue
    const parts = [row.id, humanBytes(row.freedBytes)]
    if (row.restart) parts.push('restart to reclaim locked files')
    lines.push(`- ${parts.join(' · ')}`)
  }
  if (result.errors.length) {
    lines.push('')
    lines.push('Errors:')
    for (const error of result.errors.slice(0, 10)) {
      lines.push(`- ${error.code}: ${error.message} (${error.path})`)
    }
  }
  return lines.join('\n')
}

// ---- HTTP route for the settings page ------------------------------------

function createRouteHandler(ctx, cleaner) {
  return async function handle(req, res) {
    let rejection
    try {
      rejection = ctx.connection.requestRejection(req)
    } catch {
      rejection = 403
    }
    if (rejection) {
      sendJson(res, rejection, {
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'request rejected by connection trust checks' },
      })
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('allow', 'POST')
      sendJson(res, 405, {
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' },
      })
      return
    }
    const url = new URL(req.url || '/', 'http://dsh.local')
    const action = url.pathname.slice(ROUTE_PREFIX.length).replace(/^\/+/, '')
    if (!action || action.includes('/')) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'unknown endpoint' } })
      return
    }
    let payload
    try {
      payload = await readJsonBody(req)
    } catch (error) {
      sendJson(res, error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, {
        ok: false,
        error: { code: error.code || 'BAD_REQUEST', message: String(error.message || error) },
      })
      return
    }
    try {
      let value
      if (action === 'scan') {
        value = await cleaner.scan({ ids: payload.ids, olderThanHours: payload.olderThanHours })
      } else if (action === 'clean') {
        value = await cleaner.clean({
          ids: payload.ids,
          dryRun: payload.dryRun === true,
          olderThanHours: payload.olderThanHours,
        })
      } else {
        sendJson(res, 404, {
          ok: false,
          error: { code: 'NOT_FOUND', message: `unknown endpoint: ${action}` },
        })
        return
      }
      sendJson(res, 200, { ok: true, value })
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: {
          code: error.code || 'CLEAN_FAILED',
          message: String((error && error.message) || error),
        },
      })
    }
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(body))
  res.end(body)
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        settled = true
        reject(Object.assign(new Error('request body too large'), { code: 'PAYLOAD_TOO_LARGE' }))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        reject(Object.assign(new Error('invalid JSON body'), { code: 'BAD_JSON' }))
      }
    })
    req.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}
