export function mockRect(el: Element, r: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}), ...r }) as DOMRect
}

type Spies = { fireResize: () => void; fireMutation: () => void; restore: () => void }

/** Replace global ResizeObserver/MutationObserver with versions whose callbacks the test can fire. */
export function installObserverSpies(): Spies {
  const resizeCbs: ResizeObserverCallback[] = []
  const mutationCbs: MutationCallback[] = []
  const g = globalThis as Record<string, unknown>
  const origRO = g.ResizeObserver
  const origMO = g.MutationObserver

  g.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) { resizeCbs.push(cb) }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  g.MutationObserver = class {
    constructor(cb: MutationCallback) { mutationCbs.push(cb) }
    observe() {}
    disconnect() {}
    takeRecords() { return [] }
  }
  return {
    fireResize: () => { for (const cb of resizeCbs) cb([], {} as ResizeObserver) },
    fireMutation: () => { for (const cb of mutationCbs) cb([], {} as MutationObserver) },
    restore: () => { g.ResizeObserver = origRO; g.MutationObserver = origMO },
  }
}
