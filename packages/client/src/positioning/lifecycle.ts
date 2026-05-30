export type ObserveOptions = {
  targets: Element[]
  onReposition: () => void
  onRouteChange: () => void
  onMutation?: () => void
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

  let mutFrame = 0
  let mutPending = false
  const scheduleMutation = () => {
    if (!opts.onMutation) return
    if (mutPending) return
    mutPending = true
    mutFrame = requestAnimationFrame(() => {
      mutPending = false
      mutFrame = 0
      opts.onMutation?.()
    })
  }

  // A mutation record is "ours" if its target lives inside the widget root. The widget renders
  // inside document.body, so its own DOM churn (Radix popover data-state/aria flips, the draft's
  // inline style updates, focus) would otherwise fire the observer → rematch → re-render →
  // more widget mutations → infinite loop. Only HOST-page mutations can actually move anchors.
  //
  // INVARIANT: this depends on every widget-rendered node — INCLUDING portalled popovers and
  // toasts — living under [data-comments-root]. mount() asserts this at startup (warns if a
  // portal/toast container escapes the root). Edge case: if a widget node is detached and then
  // mutated, `closest` returns null and the record is treated as host → at worst ONE spurious
  // rematch, which self-heals (its own re-render churn is filtered, so it can't loop).
  const isOwnMutation = (rec: MutationRecord): boolean => {
    const t = rec.target
    const el = t instanceof Element ? t : t.parentElement
    return !!el?.closest('[data-comments-root]')
  }
  const onMutations = (records: MutationRecord[]) => {
    // Skip only when every record is widget-internal. An empty batch (degenerate; a real
    // MutationObserver always delivers ≥1 record) is treated as a host signal, not skipped.
    if (records.length > 0 && records.every(isOwnMutation)) return
    scheduleMutation()
  }

  window.addEventListener('scroll', schedule, { passive: true, capture: true })
  window.addEventListener('resize', schedule, { passive: true })

  const ro = new ResizeObserver(schedule)
  for (const t of opts.targets) ro.observe(t)

  const mo = new MutationObserver(onMutations)
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
    if (mutFrame) cancelAnimationFrame(mutFrame)
    window.removeEventListener('scroll', schedule, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', schedule)
    ro.disconnect()
    mo.disconnect()
    window.removeEventListener('popstate', route)
    history.pushState = origPush
    history.replaceState = origReplace
  }
}
