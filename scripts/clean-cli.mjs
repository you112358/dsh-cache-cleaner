#!/usr/bin/env node
// Reclaim caches from a terminal — the escape hatch for files the running
// desktop client keeps open (its network cache journal, for example), which a
// settings page hosted inside that same client can never delete.
//
//   node scripts/clean-cli.mjs                    # list every target
//   node scripts/clean-cli.mjs dsh-electron-http-cache --all
//   node scripts/clean-cli.mjs --ids a,b --week --dry-run
//
// Quit the desktop client first if you want to reclaim the client caches it
// holds open; everything else can be cleaned while it runs.

import { createCleaner, humanBytes } from '../lib/cleaner.js'

const USAGE = `Usage: node scripts/clean-cli.mjs [ids...] [options]

Options:
  --ids a,b           target ids (comma separated)
  --all               no age filter, clear everything
  --week              only entries untouched for 7 days
  --older-than <h>    only entries untouched for <h> hours
  --dry-run, -n       preview without deleting
  --help, -h          this text`

const args = process.argv.slice(2)
let dryRun = false
let hours
const ids = []

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--dry-run' || arg === '-n') dryRun = true
  else if (arg === '--all') hours = null
  else if (arg === '--week') hours = 168
  else if (arg === '--older-than') {
    hours = Number(args[i + 1])
    i += 1
    if (!Number.isFinite(hours) || hours < 0) {
      console.error('clean-cli: --older-than needs a non-negative number of hours')
      process.exit(2)
    }
  } else if (arg === '--ids') {
    const list = (args[i + 1] || '').split(',')
    i += 1
    for (const id of list) if (id.trim()) ids.push(id.trim())
  } else if (arg === '--help' || arg === '-h') {
    console.log(USAGE)
    process.exit(0)
  } else if (arg.startsWith('-')) {
    console.error(`clean-cli: unknown option ${arg}\n\n${USAGE}`)
    process.exit(2)
  } else {
    ids.push(arg)
  }
}

const cleaner = createCleaner({})

if (!ids.length) {
  const scan = await cleaner.scan(hours === undefined ? {} : { olderThanHours: hours })
  console.log(`Cache scan · ${humanBytes(scan.totals.bytes)} reclaimable · ${scan.totals.files} files`)
  for (const row of scan.targets) {
    console.log(`  ${row.id.padEnd(28)} ${humanBytes(row.bytes).padStart(9)}  ${String(row.files).padStart(6)} files`)
  }
  console.log('')
  console.log('Pass target ids (or --ids a,b) to clean; add --dry-run to preview.')
  process.exit(0)
}

const input = { ids, dryRun }
if (hours !== undefined) input.olderThanHours = hours
const result = await cleaner.clean(input)

console.log(
  result.dryRun
    ? `Cache clean preview · would free ${humanBytes(result.totals.freedBytes)}`
    : `Cache clean · freed ${humanBytes(result.totals.freedBytes)}`,
)
console.log(`${result.totals.removedFiles} files · ${result.totals.removedDirs} dirs · ${result.totals.skipped} skipped`)
for (const row of result.targets) {
  if (!row.units && !row.errors.length) continue
  console.log(`  ${row.id.padEnd(28)} ${humanBytes(row.freedBytes).padStart(9)}`)
  if (row.locked) console.log('    held open by a running process — quit the client and run again')
  for (const error of row.errors.slice(0, 3)) console.log(`    ${error.code}: ${error.message}`)
}
if (result.totals.skipped > 0) process.exitCode = 1
