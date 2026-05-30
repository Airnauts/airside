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
  host.setAttribute('data-comments-root', '')
  // `all: revert` first neutralizes inherited host styles; the following longhands
  // re-establish only the few we need (longhands after a shorthand win in CSS).
  // font-family is set here so the whole widget inherits a sans-serif stack rather
  // than the host page's font (the UA default after `all: revert` is serif).
  host.style.cssText =
    'all: revert; position: fixed; inset: 0; pointer-events: none; z-index: 2147483600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";'

  const style = document.createElement('style')
  style.setAttribute('data-comments-style', '')
  style.textContent = widgetCss
  host.appendChild(style)

  const mountNode = document.createElement('div')
  mountNode.style.cssText = 'position: absolute; inset: 0; pointer-events: none;'
  host.appendChild(mountNode)

  document.body.appendChild(host)

  const root: Root = createRoot(mountNode)
  flushSync(() => root.render(<WidgetApp options={options} />))

  return {
    destroy() {
      root.unmount()
      host.remove()
    },
  }
}
