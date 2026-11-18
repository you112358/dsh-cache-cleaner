/*
 * dsh-cache-cleaner — browser half (bundled client artifact).
 *
 * A classic script: the client module loader executes it and claims the
 * `<style>` element created below for this package id. The factory returns the
 * Cordis plugin (`inject` + `apply`); the settings section talks to the Host
 * half over its fenced HTTP route.
 */
window.__ModuleLoader__.load({
  id: 'dsh-cache-cleaner',
  factory: function (require) {
    'use strict'

    var module = { exports: {} }
    var React = require('react')
    var h = React.createElement

    var NS = 'dsh-cache-cleaner'
    var API_PREFIX = 'dsh-cache-cleaner/api/'
    var SECTION_ORDER = 64

    var CSS = [
      '.dcc{display:flex;flex-direction:column;gap:14px;padding:2px 0 24px;color:var(--dsw-alias-label-primary)}',
      '.dcc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}',
      '.dcc-title{margin:0;font-size:16px;font-weight:600;line-height:1.3}',
      '.dcc-sub{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary)}',
      '.dcc-actions{display:flex;gap:8px;align-items:center;flex:0 0 auto}',
      '.dcc-btn{appearance:none;-webkit-appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font:inherit;font-size:12px;line-height:1.4;cursor:pointer;white-space:nowrap;transition:background .12s ease,border-color .12s ease}',
      '.dcc-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}',
      '.dcc-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
      '.dcc-btn:disabled{opacity:.5;cursor:default}',
      '.dcc-btn--primary{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base)}',
      '.dcc-btn--primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);opacity:.9}',
      '.dcc-btn--danger{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.dcc-hint{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dcc-banner{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6}',
      '.dcc-banner[data-tone="error"]{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '.dcc-banner[data-tone="ok"]{border-color:var(--dsw-alias-state-success-primary)}',
      '.dcc-group{display:flex;flex-direction:column;gap:2px}',
      '.dcc-group-title{margin:8px 0 2px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--dsw-alias-label-secondary)}',
      '.dcc-row{display:flex;align-items:flex-start;gap:10px;padding:9px 10px;border:1px solid transparent;border-radius:10px;cursor:pointer}',
      '.dcc-row:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}',
      '.dcc-row[data-empty="true"]{cursor:default;opacity:.55}',
      '.dcc-row[data-empty="true"]:hover{background:transparent;border-color:transparent}',
      '.dcc-row input[type="checkbox"]{margin:2px 0 0;width:14px;height:14px;accent-color:var(--dsw-alias-brand-primary);flex:0 0 auto;cursor:inherit}',
      '.dcc-row-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}',
      '.dcc-row-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
      '.dcc-name{font-size:13px;line-height:1.45;min-width:0}',
      '.dcc-size{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.dcc-path{display:block;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}',
      '.dcc-note{font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}',
      '.dcc-badges{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
      '.dcc-badge{font-size:10px;line-height:1.5;padding:1px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
      '.dcc-foot{margin:0;font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dcc-empty{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
      '.dcc-modes{display:inline-flex;align-self:flex-start;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}',
      '.dcc-mode{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1.4;padding:6px 12px;cursor:pointer;white-space:nowrap;transition:background .12s ease,color .12s ease}',
      '.dcc-mode[data-active="true"]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}',
      '.dcc-mode:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}',
      '.dcc-mode:disabled{opacity:.5;cursor:default}',
    ].join('')

    ;(function ensureStyles() {
      if (typeof document === 'undefined') return
      var tagId = NS + '/page.css'
      var selector = 'style[data-plugin-css=' + JSON.stringify(tagId) + ']'
      if (document.querySelector(selector) !== null) return
      var tag = document.createElement('style')
      tag.dataset.plugin = NS
      tag.dataset.pluginCss = tagId
      tag.textContent = CSS
      document.head.appendChild(tag)
    })()

    var TEXT = {
      zh: {
        nav: '缓存清理',
        title: '缓存清理',
        total: '可清理 {size}，共 {n} 项',
        hint: '只清理可重建的缓存与临时文件：会话记录、附件、回滚快照与插件安装文件不会被改动。',
        rescan: '重新扫描',
        rescanning: '扫描中…',
        cleanSelected: '清理选中（{size}）',
        cleaning: '清理中…',
        confirm: '再点一次确认',
        empty: '无缓存',
        files: '{n} 个文件',
        needRestart: '需重启释放',
        staleOnly: '{h} 小时前的才清',
        skippedFresh: '跳过 {n} 项较新',
        errorsBadge: '{n} 个错误',
        reportOk: '已释放 {size}，删除 {n} 个文件',
        reportSkipped: '跳过 {n} 项（可能被占用）',
        reportErrors: '{n} 个错误',
        loading: '正在读取缓存清单…',
        none: '当前没有可清理的缓存。',
        restartHint: '桌面客户端缓存在运行中可能被占用拿不到的部分会列入跳过，重启应用后会彻底释放。',
        confirmHint: '清理后不可恢复，但缓存会自动重建。',
        modeWeek: '仅 7 天前的',
        modeAll: '全部缓存',
        staleWeek: '仅清理 7 天前的',
        modeHintWeek: '只删除最近 7 天没有改动过的缓存，活跃缓存会保留。',
        modeHintAll: '包括刚刚写入的缓存，删除后会在需要时自动重建。',
      },
      en: {
        nav: 'Cache cleaner',
        title: 'Cache cleaner',
        total: '{size} reclaimable across {n} targets',
        hint: 'Only rebuildable caches and temporary files are cleaned. Session logs, attachments, rewind snapshots and plugin installations are never touched.',
        rescan: 'Rescan',
        rescanning: 'Scanning…',
        cleanSelected: 'Clean selected ({size})',
        cleaning: 'Cleaning…',
        confirm: 'Click again to confirm',
        empty: 'No cache',
        files: '{n} files',
        needRestart: 'restart to reclaim',
        staleOnly: 'older than {h}h only',
        skippedFresh: '{n} newer skipped',
        errorsBadge: '{n} errors',
        reportOk: 'Freed {size}, removed {n} files',
        reportSkipped: '{n} entries skipped (likely in use)',
        reportErrors: '{n} errors',
        loading: 'Reading the cache inventory…',
        none: 'There is nothing to clean right now.',
        restartHint: 'Desktop client caches can be partly locked while the app runs; the skipped part is reclaimed after a restart.',
        confirmHint: 'Cleaning cannot be undone, but the caches rebuild themselves.',
        modeWeek: '7+ days old',
        modeAll: 'Everything',
        staleWeek: 'only 7+ days old',
        modeHintWeek: 'Only caches untouched for the last week are removed; live caches stay.',
        modeHintAll: 'Includes caches written seconds ago; they are rebuilt on demand.',
      },
    }

    var scanCache = null
    var WEEK_HOURS = 168

    function pickLang(ctx) {
      var snapshot = null
      try {
        snapshot = ctx.locale.getSnapshot()
      } catch (error) {
        snapshot = null
      }
      var active = snapshot && typeof snapshot.active === 'string' ? snapshot.active.toLowerCase() : 'en'
      return active.indexOf('zh') === 0 ? 'zh' : 'en'
    }

    function useLang(ctx) {
      var state = React.useState(function () {
        return pickLang(ctx)
      })
      var lang = state[0]
      var setLang = state[1]
      React.useEffect(function () {
        return ctx.locale.subscribe(function () {
          setLang(pickLang(ctx))
        })
      }, [ctx])
      return lang
    }

    function fmt(template, params) {
      return String(template).replace(/\{(\w+)\}/g, function (match, key) {
        var value = params ? params[key] : undefined
        return value == null ? match : String(value)
      })
    }

    function humanBytes(bytes) {
      var value = Number(bytes) || 0
      if (value < 1024) return value + ' B'
      var units = ['KB', 'MB', 'GB', 'TB']
      var size = value / 1024
      var index = 0
      while (size >= 1024 && index < units.length - 1) {
        size /= 1024
        index += 1
      }
      return (size >= 100 ? size.toFixed(0) : size.toFixed(1)) + ' ' + units[index]
    }

    function apiUrl(action) {
      var base = new URL(document.baseURI)
      base.search = ''
      base.hash = ''
      if (!base.pathname.endsWith('/')) {
        base.pathname = base.pathname.slice(0, base.pathname.lastIndexOf('/') + 1)
      }
      return new URL(API_PREFIX + action, base).toString()
    }

    async function post(action, payload) {
      var response = await fetch(apiUrl(action), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
        credentials: 'same-origin',
      })
      var data = null
      try {
        data = await response.json()
      } catch (error) {
        data = null
      }
      if (data === null) throw new Error('HTTP ' + response.status)
      if (data.ok !== true) {
        var message = data.error && data.error.message ? data.error.message : 'HTTP ' + response.status
        throw new Error(message)
      }
      return data.value
    }

    function defaultsOf(scan) {
      var out = []
      if (!scan || !scan.targets) return out
      scan.targets.forEach(function (row) {
        if (row.defaultOn && row.bytes > 0) out.push(row.id)
      })
      return out
    }

    function mergeSelection(previous, scan) {
      var prev = previous instanceof Set ? previous : new Set(previous || [])
      var next = new Set()
      scan.targets.forEach(function (row) {
        if (row.bytes === 0) return
        if (prev.size === 0) {
          if (row.defaultOn) next.add(row.id)
        } else if (prev.has(row.id)) {
          next.add(row.id)
        }
      })
      return next
    }

    function BroomIcon(props) {
      var size = (props && props.size) || 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        [
          h('path', { key: 'handle', d: 'M16.8 3.2 11.6 10.8' }),
          h('path', {
            key: 'brush',
            d: 'M12 9.4 5.6 14.3a2.2 2.2 0 0 0-.3 3.1l2.6 3.1a2.2 2.2 0 0 0 3.1.3l6.6-5.5z',
          }),
          h('path', { key: 'b1', d: 'M7.9 15.2 10.4 18.2' }),
          h('path', { key: 'b2', d: 'M9.7 13.8 12.2 16.8' }),
          h('path', { key: 'spark', d: 'M18.6 12.3l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z' }),
        ],
      )
    }

    function createPage(ctx) {
      return function CacheCleanerPage() {
        var lang = useLang(ctx)
        var dict = TEXT[lang]

        var scanState = React.useState(scanCache)
        var scan = scanState[0]
        var setScan = scanState[1]

        var loadingState = React.useState(scanCache === null)
        var loading = loadingState[0]
        var setLoading = loadingState[1]

        var busyState = React.useState(false)
        var busy = busyState[0]
        var setBusy = busyState[1]

        var errorState = React.useState(null)
        var error = errorState[0]
        var setError = errorState[1]

        var reportState = React.useState(null)
        var report = reportState[0]
        var setReport = reportState[1]

        var confirmState = React.useState(false)
        var confirm = confirmState[0]
        var setConfirm = confirmState[1]

        var selectedState = React.useState(function () {
          return new Set(defaultsOf(scanCache))
        })
        var selected = selectedState[0]
        var setSelected = selectedState[1]

        var modeState = React.useState(function () {
          var policy = scanCache && scanCache.agePolicy
          return policy && policy.key === 'all' ? 'all' : 'week'
        })
        var mode = modeState[0]
        var setMode = modeState[1]

        var runScan = React.useCallback(
          function (nextMode) {
            var active = nextMode || mode
            setLoading(true)
            setError(null)
            return post('scan', {
              olderThanHours: active === 'all' ? null : WEEK_HOURS,
            })
              .then(function (value) {
                scanCache = value
                setScan(value)
                setSelected(function (prev) {
                  return mergeSelection(prev, value)
                })
              })
              .catch(function (failure) {
                setError(String((failure && failure.message) || failure))
              })
              .then(function () {
                setLoading(false)
              })
          },
          [mode],
        )

        React.useEffect(
          function () {
            if (!scanCache) runScan()
          },
          [runScan],
        )

        React.useEffect(
          function () {
            if (!confirm) return undefined
            var timer = setTimeout(function () {
              setConfirm(false)
            }, 6000)
            return function () {
              clearTimeout(timer)
            }
          },
          [confirm],
        )

        var rows = scan && scan.targets ? scan.targets : []
        var groups = scan && scan.groups ? scan.groups : []
        var selectedRows = rows.filter(function (row) {
          return row.bytes > 0 && selected.has(row.id)
        })
        var selectedBytes = selectedRows.reduce(function (sum, row) {
          return sum + row.bytes
        }, 0)
        var anyRestart = rows.some(function (row) {
          return row.restart && row.bytes > 0
        })

        function toggle(id) {
          setSelected(function (prev) {
            var next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
          })
        }

        function handleClean() {
          if (busy || loading) return
          var ids = selectedRows.map(function (row) {
            return row.id
          })
          if (!ids.length) return
          if (!confirm) {
            setConfirm(true)
            return
          }
          setConfirm(false)
          setBusy(true)
          setError(null)
          setReport(null)
          post('clean', {
            ids: ids,
            olderThanHours: mode === 'all' ? null : WEEK_HOURS,
          })
            .then(function (value) {
              setReport(value)
              return runScan()
            })
            .catch(function (failure) {
              setError(String((failure && failure.message) || failure))
            })
            .then(function () {
              setBusy(false)
            })
        }

        function renderRow(row) {
          var empty = row.bytes === 0
          var badges = []
          if (row.restart) badges.push(dict.needRestart)
          if (row.staleHours === WEEK_HOURS) badges.push(dict.staleWeek)
          else if (row.staleHours != null) badges.push(fmt(dict.staleOnly, { h: row.staleHours }))
          if (row.fresh) badges.push(fmt(dict.skippedFresh, { n: row.fresh }))
          if (row.errors && row.errors.length) badges.push(fmt(dict.errorsBadge, { n: row.errors.length }))
          return h(
            'label',
            {
              key: row.id,
              className: 'dcc-row',
              'data-empty': empty ? 'true' : 'false',
            },
            [
              h('input', {
                key: 'check',
                type: 'checkbox',
                checked: !empty && selected.has(row.id),
                disabled: empty || busy,
                onChange: function () {
                  toggle(row.id)
                },
                'aria-label': row.title[lang],
              }),
              h('div', { key: 'main', className: 'dcc-row-main' }, [
                h('div', { key: 'top', className: 'dcc-row-top' }, [
                  h('span', { key: 'name', className: 'dcc-name' }, row.title[lang]),
                  h(
                    'span',
                    { key: 'size', className: 'dcc-size' },
                    empty
                      ? dict.empty
                      : humanBytes(row.bytes) + ' · ' + fmt(dict.files, { n: row.files }),
                  ),
                ]),
                row.pathLabel
                  ? h('code', { key: 'path', className: 'dcc-path', title: row.pathLabel }, row.pathLabel)
                  : null,
                h('span', { key: 'note', className: 'dcc-note' }, row.note[lang]),
                badges.length
                  ? h(
                      'div',
                      { key: 'badges', className: 'dcc-badges' },
                      badges.map(function (badge, index) {
                        return h('span', { key: 'b' + index, className: 'dcc-badge' }, badge)
                      }),
                    )
                  : null,
              ]),
            ],
          )
        }

        var children = []
        children.push(
          h('div', { key: 'head', className: 'dcc-head' }, [
            h('div', { key: 'meta' }, [
              h('h2', { key: 'title', className: 'dcc-title' }, dict.title),
              h(
                'p',
                { key: 'sub', className: 'dcc-sub' },
                scan
                  ? fmt(dict.total, { size: humanBytes(scan.totals.bytes), n: scan.totals.targets })
                  : dict.loading,
              ),
            ]),
            h('div', { key: 'actions', className: 'dcc-actions' }, [
              h(
                'button',
                {
                  key: 'rescan',
                  type: 'button',
                  className: 'dcc-btn',
                  onClick: runScan,
                  disabled: loading || busy,
                },
                loading ? dict.rescanning : dict.rescan,
              ),
              h(
                'button',
                {
                  key: 'clean',
                  type: 'button',
                  className:
                    'dcc-btn dcc-btn--primary' + (confirm ? ' dcc-btn--danger' : ''),
                  onClick: handleClean,
                  disabled: busy || loading || selectedRows.length === 0,
                },
                busy
                  ? dict.cleaning
                  : confirm
                    ? dict.confirm
                    : fmt(dict.cleanSelected, { size: humanBytes(selectedBytes) }),
              ),
            ]),
          ]),
        )
        function changeMode(nextMode) {
          if (nextMode === mode || busy || loading) return
          setMode(nextMode)
          setConfirm(false)
          setReport(null)
          runScan(nextMode)
        }

        children.push(
          h('div', { key: 'modes', className: 'dcc-modes' }, [
            h(
              'button',
              {
                key: 'week',
                type: 'button',
                className: 'dcc-mode',
                'data-active': mode === 'week' ? 'true' : 'false',
                onClick: function () {
                  changeMode('week')
                },
                disabled: loading || busy,
              },
              dict.modeWeek,
            ),
            h(
              'button',
              {
                key: 'all',
                type: 'button',
                className: 'dcc-mode',
                'data-active': mode === 'all' ? 'true' : 'false',
                onClick: function () {
                  changeMode('all')
                },
                disabled: loading || busy,
              },
              dict.modeAll,
            ),
          ]),
        )
        children.push(
          h(
            'p',
            { key: 'modehint', className: 'dcc-hint' },
            mode === 'all' ? dict.modeHintAll : dict.modeHintWeek,
          ),
        )
        children.push(h('p', { key: 'hint', className: 'dcc-hint' }, dict.hint))
        if (error) {
          children.push(
            h('div', { key: 'error', className: 'dcc-banner', 'data-tone': 'error' }, error),
          )
        }
        if (report) {
          var parts = [
            fmt(dict.reportOk, {
              size: humanBytes(report.totals.freedBytes),
              n: report.totals.removedFiles,
            }),
          ]
          if (report.totals.skipped) parts.push(fmt(dict.reportSkipped, { n: report.totals.skipped }))
          if (report.errors && report.errors.length) {
            parts.push(fmt(dict.reportErrors, { n: report.errors.length }))
          }
          children.push(
            h('div', { key: 'report', className: 'dcc-banner', 'data-tone': 'ok' }, parts.join(' · ')),
          )
        }
        if (confirm) {
          children.push(
            h('p', { key: 'confirm-hint', className: 'dcc-foot' }, dict.confirmHint),
          )
        }

        if (scan) {
          var rendered = 0
          groups.forEach(function (group) {
            var groupRows = rows.filter(function (row) {
              return row.group === group.id
            })
            if (!groupRows.length) return
            rendered += groupRows.length
            children.push(
              h('section', { key: 'group-' + group.id, className: 'dcc-group' }, [
                h('h3', { key: 'title', className: 'dcc-group-title' }, group.title[lang]),
              ].concat(groupRows.map(renderRow))),
            )
          })
          if (rendered === 0) {
            children.push(h('p', { key: 'none', className: 'dcc-empty' }, dict.none))
          }
        }
        if (anyRestart) {
          children.push(h('p', { key: 'restart', className: 'dcc-foot' }, dict.restartHint))
        }

        return h('div', { className: 'dcc' }, children)
      }
    }

    function apply(ctx) {
      ctx.effect(function () {
        return ctx.slots.inject('settings.section.icon', function () {
          return ctx.slots.register(
            { name: 'settings.section.icon', id: NS, order: SECTION_ORDER },
            function CacheCleanerIcon(props) {
              return h(BroomIcon, { size: props && props.size })
            },
          )
        })
      }, 'dsh-cache-cleaner: settings icon')

      ctx.effect(function () {
        return ctx.slots.inject('settings.section', function () {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: NS,
              order: SECTION_ORDER,
              label: function () {
                return TEXT[pickLang(ctx)].nav
              },
            },
            createPage(ctx),
          )
        })
      }, 'dsh-cache-cleaner: settings section')
    }

    module.exports = {
      name: NS,
      inject: ['slots', 'locale'],
      apply: apply,
    }
    return module.exports
  },
})
