/*
 * Structural check for the bundled client half, without a browser.
 *
 * Loads client/client.js in a vm context with the module-table contract
 * (window.__ModuleLoader__.load + require('react') + a <style> host), calls the
 * factory, then exercises `apply` against a fake client context and renders the
 * settings section once with stub React hooks.
 *
 * Run (from the package root): node scripts/check-client.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const bundlePath = path.join(here, '..', 'client', 'client.js')
const source = fs.readFileSync(bundlePath, 'utf8')

const errors = []
const regs = []
const slotCalls = []
let entry = null

const fakeReact = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c != null) }
  },
  useState(initial) {
    return [typeof initial === 'function' ? initial() : initial, () => {}]
  },
  useEffect() {},
  useCallback(fn) {
    return fn
  },
  useRef(value) {
    return { current: value }
  },
  useMemo(fn) {
    return fn()
  },
}

const fakeCtx = {
  locale: {
    getSnapshot: () => ({ active: 'zh', locales: [], revision: 1 }),
    subscribe: () => () => {},
  },
  slots: {
    inject(ownerKey, callback) {
      const disposer = callback()
      slotCalls.push({ ownerKey, result: typeof disposer })
      return typeof disposer === 'function' ? disposer : () => {}
    },
    register(options, component) {
      regs.push({ options, component })
      return () => {}
    },
  },
  effect(callback) {
    const disposer = callback()
    return typeof disposer === 'function' ? disposer : () => {}
  },
}

const styleTags = []

const sandbox = {
  console,
  URL,
  JSON,
  Promise,
  window: {
    __ModuleLoader__: {
      load(registered) {
        if (entry !== null) errors.push('factory registered twice')
        entry = registered
      },
    },
  },
  document: {
    baseURI: 'http://127.0.0.1:3734/settings',
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: {
      appendChild(node) {
        styleTags.push(node)
      },
    },
  },
}

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: bundlePath })

if (entry === null) {
  errors.push('__ModuleLoader__.load was never called')
} else {
  if (entry.id !== 'dsh-cache-cleaner') errors.push(`bundle id is ${JSON.stringify(entry.id)}`)
  const exports = entry.factory((spec) => {
    if (spec === 'react') return fakeReact
    throw new Error(`unexpected require(${JSON.stringify(spec)})`)
  })
  if (typeof exports.apply !== 'function') errors.push('exports.apply is not a function')
  if (!Array.isArray(exports.inject)) errors.push('exports.inject is not an array')
  if (exports.name !== 'dsh-cache-cleaner') errors.push(`exports.name is ${JSON.stringify(exports.name)}`)

  if (typeof exports.apply === 'function') {
    exports.apply(fakeCtx)
    const names = regs.map((reg) => reg.options.name)
    if (!names.includes('settings.section')) errors.push(`settings.section not registered (got ${names.join(', ')})`)
    if (!names.includes('settings.section.icon')) errors.push('settings.section.icon not registered')
    const section = regs.find((reg) => reg.options.name === 'settings.section')
    if (section) {
      if (section.options.id !== 'dsh-cache-cleaner') errors.push('section id mismatch')
      if (typeof section.options.order !== 'number') errors.push('section order missing')
      if (typeof section.options.label !== 'function') errors.push('section label is not a thunk')
      else if (typeof section.options.label() !== 'string') errors.push('section label thunk returns a non-string')
      // Render once in the loading state (no fetch is issued before a scan).
      let tree = null
      try {
        tree = section.component({})
      } catch (failure) {
        errors.push(`section render threw: ${failure && failure.message}`)
      }
      if (tree && tree.type !== 'div') errors.push('section render did not return a root element')
      const text = tree ? flattenText(tree) : ''
      if (!text.includes('缓存清理')) errors.push(`zh title missing from render: ${text.slice(0, 120)}`)
    }
  }

  if (styleTags.length !== 1) errors.push(`expected exactly 1 style tag, got ${styleTags.length}`)
  else {
    const tag = styleTags[0]
    if (tag.dataset.plugin !== 'dsh-cache-cleaner') errors.push('style data-plugin mismatch')
    if (tag.dataset.pluginCss !== 'dsh-cache-cleaner/page.css') errors.push('style data-plugin-css mismatch')
    if (!String(tag.textContent).includes('--dsw-alias-brand-primary')) errors.push('style content lacks theme tokens')
  }
}

function flattenText(node) {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join(' ')
  return flattenText(node.children)
}

if (errors.length) {
  console.error('FAIL')
  for (const message of errors) console.error(' - ' + message)
  process.exitCode = 1
} else {
  console.log(
    `OK client bundle: id=${entry.id}, exports=${entry && entry.factory ? 'factory ok' : '?'}, ` +
      `sections=${regs.map((reg) => reg.options.name).join('+')}, slotCalls=${slotCalls.length}, styles=${styleTags.length}`,
  )
}
