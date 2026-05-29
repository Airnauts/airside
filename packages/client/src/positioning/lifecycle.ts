export type ObserveOptions = {
  targets: Element[]
  onReposition: () => void
  onRouteChange: () => void
}

/** Wire all reposition + route signals; returns a stop() that detaches everything. */
export function observeReposition(opts: ObserveOptions): () => void {
  let frame = 0
  let pending = false
  const schedule = () => {
    if (pending) return
    pending = true
    frame = requestAnimationFrame(() => {
      pending = false
      frame = 0
      opts.onReposition()
    })
  }

  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('resize', schedule, { passive: true })

  const ro = new ResizeObserver(schedule)
  for (const t of opts.targets) ro.observe(t)

  const mo = new MutationObserver(schedule)
  mo.observe(document.body, { childList: true, subtree: true, attributes: true })

  const route = () => opts.onRouteChange()
  window.addEventListener('popstate', route)
  const origPush = history.pushState.bind(history)
  const origReplace = history.replaceState.bind(history)
  history.pushState = (...a: Parameters<History['pushState']>) => {
    origPush(...a)
    route()
  }
  history.replaceState = (...a: Parameters<History['replaceState']>) => {
    origReplace(...a)
    route()
  }

  return () => {
    if (frame) cancelAnimationFrame(frame)
    window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', schedule)
    ro.disconnect()
    mo.disconnect()
    window.removeEventListener('popstate', route)
    history.pushState = origPush
    history.replaceState = origReplace
  }
}
