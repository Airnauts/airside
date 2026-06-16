import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { InitOptions } from '../config'
import { WidgetApp } from './app'
import { widgetCss } from './widget-css.generated'

export type WidgetHandle = {
  destroy(): void
}

export function mount(options: InitOptions): WidgetHandle {
  const host = document.createElement('div')
  host.setAttribute('data-airside-root', '')
  // `all: revert` first neutralizes inherited host styles; the following longhands
  // re-establish only the few we need (longhands after a shorthand win in CSS).
  // font-family is set here so the whole widget inherits a sans-serif stack rather
  // than the host page's font (the UA default after `all: revert` is serif).
  // The root sits near the top of the 32-bit z-index range so the whole widget
  // floats above host page chrome. The two `--air-z-*` tokens stack our own
  // surfaces *within* that root (the root is a stacking context, so these only
  // order our elements relative to each other): the launcher rides above the
  // sidebar + thread popovers so its controls stay clickable. `all: revert` does
  // not reset custom properties, so defining them in the same declaration is safe.
  host.style.cssText =
    'all: revert; position: fixed; inset: 0; pointer-events: none; z-index: 2147483647; --air-z-surface: 2147400100; --air-z-launcher: 2147400200; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";'

  const style = document.createElement('style')
  style.setAttribute('data-airside-style', '')
  style.textContent = widgetCss
  host.appendChild(style)

  const mountNode = document.createElement('div')
  mountNode.style.cssText = 'position: absolute; inset: 0; pointer-events: none;'
  host.appendChild(mountNode)

  document.body.appendChild(host)

  const root: Root = createRoot(mountNode)
  flushSync(() => root.render(<WidgetApp options={options} />))

  // Invariant tripwire: the MutationObserver self-mutation filter (positioning/lifecycle.ts)
  // assumes ALL widget-rendered DOM — including portalled popovers and toasts — lives inside
  // [data-airside-root]. If a portal/toast container escapes the root, its own churn would be
  // misclassified as host-page changes and reintroduce the rematch → re-render loop. flushSync
  // above commits the first render synchronously, so the containers exist here. Warn loudly if
  // a future change moves one out of the root, so the regression isn't silent.
  for (const sel of ['[data-portal-container]', '[data-toasts-container]']) {
    if (!host.querySelector(sel)) {
      console.warn(
        `[comments] ${sel} is not inside [data-airside-root]; the MutationObserver self-mutation ` +
          'filter will misclassify its DOM as host changes and may reintroduce the re-render loop.',
      )
    }
  }

  return {
    destroy() {
      root.unmount()
      host.remove()
    },
  }
}
