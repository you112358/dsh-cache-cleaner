/*
 * Behavioural check for the settings page, without a browser.
 *
 * Loads client/client.js in a vm context, runs the section component against a
 * tiny React-hook renderer, and drives the real buttons: initial scan, mode
 * switch, Rescan, and Rescan again after switching back to "Everything".
 *
 * This is the regression test for the v0.1.1 fix: the Rescan button used to
 * hand its click event to runScan() as the mode argument, so a rescan always
 * fell back to the 7-day filter.
 *
 * Run: node tools/check-client-behavior.js
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '..', 'client', 'client.js')
const source = fs.readFileSync(bundlePath, 'utf8')

const errors = []
const requests = []

function scanPayload(olderThanHours) {
  const week = olderThanHours === 168
  const bytes = week ? 0 : 4096
  return {
    generatedAt: new Date().toISOString(),
    agePolicy: week ? { key: 'custom', hours: 168 } : { key: 'all', hours: null },
    staleHours: week ? 168 : null,
    groups: [{ id: 'dsh', title: { zh: '本体', en: 'Core' } }],
    targets: [
      {
        id: 'demo',
        group: 'dsh',
        title: { zh: '演示缓存', en: 'Demo cache' },
        note: { zh: '说明', en: 'note' },
        defaultOn: true,
        restart: false,
        staleHours: week ? 168 : null,
        bytes,
        files: week ? 0 : 2,
        units: week ? 0 : 2,
        fresh: week ? 2 : 0,
        freshBytes: week ? 1024 : 0,
        freshFiles: week ? 2 : 0,
        skipped: 0,
        pathLabel: 'C:/demo',
        pathCount: 1,
        errors: [],
      },
    ],
    totals: {
      bytes,
      files: week ? 0 : 2,
      freshBytes: week ? 1024 : 0,
      freshFiles: week ? 2 : 0,
      targets: week ? 0 : 1,
    },
  }
}

const fakeFetch = (url, options) => {
  const body = options && options.body ? JSON.parse(options.body) : {}
  if (process.env.DEBUG) console.error('fetch', JSON.stringify(body))
  requests.push({ url: String(url), body })
  const value = body.olderThanHours === undefined ? null : scanPayload(body.olderThanHours)
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, value }) })
}

// ---- minimal React --------------------------------------------------------

let current = null
const slots = []
const callbackSlots = []
const effectDeps = []
const effectCleanups = []
let dirty = false
let tree = null
let renderCount = 0

const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c != null) }
  },
  useState(initial) {
    return current.useState(initial)
  },
  useEffect(callback, deps) {
    return current.useEffect(callback, deps)
  },
  useCallback(fn, deps) {
    return current.useCallback(fn, deps)
  },
}

function sameDeps(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

function schedule() {
  if (dirty) return
  dirty = true
  queueMicrotask(() => {
    if (dirty) {
      dirty = false
      render()
    }
  })
}

function render() {
  if (++renderCount > 80) throw new Error('render loop did not settle')
  if (process.env.DEBUG) console.error('render', renderCount)
  let hookIndex = 0
  const effects = []
  current = {
    useState(initial) {
      const index = hookIndex++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      const set = (updater) => {
        const next = typeof updater === 'function' ? updater(slots[index]) : updater
        if (Object.is(next, slots[index])) return
        slots[index] = next
        schedule()
      }
      return [slots[index], set]
    },
    useEffect(callback, deps) {
      effects.push({ index: hookIndex++, callback, deps })
    },
    useCallback(fn, deps) {
      const index = hookIndex++
      const cached = callbackSlots[index]
      if (cached && sameDeps(cached.deps, deps)) return cached.fn
      callbackSlots[index] = { deps, fn }
      return fn
    },
  }
  tree = component({})
  for (const effect of effects) {
    const previous = effectDeps[effect.index]
    const changed = !previous || !sameDeps(previous, effect.deps)
    if (!changed) continue
    if (typeof effectCleanups[effect.index] === 'function') effectCleanups[effect.index]()
    effectDeps[effect.index] = effect.deps
    const cleanup = effect.callback()
    effectCleanups[effect.index] = typeof cleanup === 'function' ? cleanup : null
  }
}

let component = null

function flattenText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join(' ')
  return flattenText(node.children)
}

function collectButtons(node, found = []) {
  if (node == null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, found)
    return found
  }
  if (node.type === 'button') found.push(node)
  collectButtons(node.children, found)
  return found
}

function buttonByText(text) {
  const button = collectButtons(tree).find((node) => flattenText(node).includes(text))
  if (!button) throw new Error(`button not found: ${text}`)
  return button
}

async function settle() {
  for (let index = 0; index < 12; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
    if (!dirty && requests.length >= 0) {
      await new Promise((resolve) => setImmediate(resolve))
      if (!dirty) return
    }
  }
}

// ---- run the bundle -------------------------------------------------------

const registrations = []
let entry = null

const fakeCtx = {
  locale: {
    getSnapshot: () => ({ active: 'zh', locales: [], revision: 1 }),
    subscribe: () => () => {},
  },
  slots: {
    inject(ownerKey, callback) {
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register(options, value) {
      registrations.push({ options, component: value })
      return () => {}
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
}

const sandbox = {
  console,
  URL,
  JSON,
  Promise,
  setTimeout,
  clearTimeout,
  fetch: fakeFetch,
  window: {
    __ModuleLoader__: {
      load(registered) {
        entry = registered
      },
    },
  },
  document: {
    baseURI: 'http://127.0.0.1:3734/settings',
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild() {} },
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: bundlePath })

if (!entry) {
  errors.push('__ModuleLoader__.load was never called')
} else {
  const exports = entry.factory((spec) => {
    if (spec === 'react') return fakeReact
    throw new Error(`unexpected require(${JSON.stringify(spec)})`)
  })
  exports.apply(fakeCtx)
  const section = registrations.find((reg) => reg.options.name === 'settings.section')
  if (!section) {
    errors.push('settings.section was not registered')
  } else {
    component = section.component
    render()
    await settle()

    if (requests.length !== 1) errors.push(`expected 1 initial scan, got ${requests.length}`)
    else if (requests[0].body.olderThanHours !== null) {
      errors.push(`initial scan should use "Everything" (null), got ${JSON.stringify(requests[0].body)}`)
    }
    const allButton = buttonByText('全部缓存')
    if (allButton.props['data-active'] !== 'true') errors.push('"Everything" is not the initial mode')
    if (!flattenText(tree).includes('已选 1/1')) {
      errors.push('the initial selection count is wrong: ' + flattenText(tree).slice(0, 400))
    }

    // deselect all → nothing selected, the clean button is disabled
    buttonByText('全不选').props.onClick()
    await settle()
    if (!flattenText(tree).includes('已选 0/1')) errors.push('deselect-all did not clear the selection')
    const cleanButton = buttonByText('清理选中')
    if (!cleanButton.props.disabled) errors.push('the clean button should be disabled with an empty selection')

    // select all → everything selectable is selected again
    buttonByText('全选').props.onClick()
    await settle()
    if (!flattenText(tree).includes('已选 1/1')) errors.push('select-all did not select every row with data')

    // switch to the 7-day filter
    buttonByText('仅 7 天前的').props.onClick()
    await settle()
    if (requests.length !== 2) errors.push(`expected a scan after switching mode, got ${requests.length}`)
    else if (requests[1].body.olderThanHours !== 168) {
      errors.push(`week mode should send 168, got ${JSON.stringify(requests[1].body)}`)
    }
    const weekText = flattenText(tree)
    if (!weekText.includes('近期写入')) errors.push('week-mode rows do not show the recently-written label')
    if (weekText.includes('无缓存')) errors.push('week-mode rows still show the empty label')
    if (!weekText.includes('已选 0/0')) {
      errors.push('week mode should report 0 of 0 selectable rows: ' + weekText.slice(0, 400))
    }

    // rescan with a click event: the event must never become the mode
    buttonByText('重新扫描').props.onClick({ type: 'click' })
    await settle()
    if (requests.length !== 3) errors.push(`expected a rescan, got ${requests.length} requests`)
    else if (requests[2].body.olderThanHours !== 168) {
      errors.push(`rescan in week mode sent ${JSON.stringify(requests[2].body)}`)
    }

    // back to "Everything", then rescan again with a click event (the old bug)
    buttonByText('全部缓存').props.onClick()
    await settle()
    if (requests.length !== 4) errors.push(`expected a scan after switching to Everything, got ${requests.length}`)
    else if (requests[3].body.olderThanHours !== null) {
      errors.push(`"Everything" mode should send null, got ${JSON.stringify(requests[3].body)}`)
    }
    buttonByText('重新扫描').props.onClick({ type: 'click' })
    await settle()
    if (requests.length !== 5) errors.push(`expected a final rescan, got ${requests.length} requests`)
    else if (requests[4].body.olderThanHours !== null) {
      errors.push(
        `rescan in "Everything" mode sent ${JSON.stringify(requests[4].body)} — the click event leaked into the mode`,
      )
    }
  }
}

if (errors.length) {
  console.error('FAIL')
  for (const message of errors) console.error(' - ' + message)
  process.exitCode = 1
} else {
  console.log(
    `OK client behaviour: scans=${requests.length}, modes=${JSON.stringify(requests.map((r) => r.body.olderThanHours))}, ` +
      'rescan keeps its mode, recent caches labelled, bulk selection works',
  )
}
