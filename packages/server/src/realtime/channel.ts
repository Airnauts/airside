import type { RealtimeEvent } from '@airnauts/airside-core'
import type { Scope } from '../repository/types'

/** A subscriber callback. Invoked synchronously by `publish`, once per matching event. */
export type RealtimeListener = (event: RealtimeEvent) => void

/**
 * Outbound port for pushing live updates to open widgets (ADR-0045). The server
 * publishes after every successful write; the `GET /events` use-case subscribes a
 * stream to it. Dual-scope: `pageKey` string subscribes to one page (pins),
 * `pageKey` null subscribes to every page in the project/env (the cross-page panel).
 *
 * The in-process concrete (`InProcessRealtimeChannel`) only fans out within a single
 * process, so it is best-effort on multi-instance/serverless hosts; an external
 * pub/sub backplane is the designed-but-deferred replacement (architecture §2).
 */
export interface RealtimeChannel {
  /** Fan an event out to the all-pages subscribers, plus the matching page subscribers when `event.pageKey` is non-null. */
  publish(scope: Scope, event: RealtimeEvent): void
  /**
   * Register a listener. `pageKey` string → only that page's events (pins);
   * `pageKey` null → every event in the scope (panel). Returns an unsubscribe fn.
   */
  subscribe(scope: Scope, pageKey: string | null, onEvent: RealtimeListener): () => void
}

function scopeKey(scope: Scope): string {
  return `${scope.projectId}:${scope.env ?? ''}`
}

type ScopeEntry = {
  /** Subscribers to every page in the scope (the panel). */
  allPages: Set<RealtimeListener>
  /** Per-page subscriber sets (the pins). */
  byPage: Map<string, Set<RealtimeListener>>
}

/**
 * In-process dual-scope event bus. One entry per `projectId:env`; each entry holds an
 * all-pages listener set plus a `Map<pageKey, Set<listener>>`. Listeners are notified
 * synchronously; a listener that throws is isolated (logged, swallowed) so it cannot
 * starve the rest or break the write that triggered the publish.
 */
export class InProcessRealtimeChannel implements RealtimeChannel {
  private readonly scopes = new Map<string, ScopeEntry>()

  constructor(private readonly log: (message: string) => void = (m) => console.error(m)) {}

  private entry(key: string): ScopeEntry {
    let e = this.scopes.get(key)
    if (!e) {
      e = { allPages: new Set(), byPage: new Map() }
      this.scopes.set(key, e)
    }
    return e
  }

  subscribe(scope: Scope, pageKey: string | null, onEvent: RealtimeListener): () => void {
    const key = scopeKey(scope)
    const entry = this.entry(key)
    const set = pageKey === null ? entry.allPages : this.pageSet(entry, pageKey)
    set.add(onEvent)
    return () => {
      set.delete(onEvent)
      this.prune(key)
    }
  }

  publish(scope: Scope, event: RealtimeEvent): void {
    const entry = this.scopes.get(scopeKey(scope))
    if (!entry) return
    // All-pages subscribers always see the event; the matching page bucket sees it only
    // when the event carries a (non-null) pageKey. A null pageKey has no page bucket.
    this.deliver(entry.allPages, event)
    if (event.pageKey !== null) {
      const page = entry.byPage.get(event.pageKey)
      if (page) this.deliver(page, event)
    }
  }

  /** Total live subscribers in a scope — used by tests and for pruning sanity. */
  subscriberCount(scope: Scope): number {
    const entry = this.scopes.get(scopeKey(scope))
    if (!entry) return 0
    let n = entry.allPages.size
    for (const set of entry.byPage.values()) n += set.size
    return n
  }

  private pageSet(entry: ScopeEntry, pageKey: string): Set<RealtimeListener> {
    let set = entry.byPage.get(pageKey)
    if (!set) {
      set = new Set()
      entry.byPage.set(pageKey, set)
    }
    return set
  }

  private deliver(set: Set<RealtimeListener>, event: RealtimeEvent): void {
    // Snapshot so a listener that (un)subscribes during dispatch can't mutate the set we iterate.
    for (const listener of [...set]) {
      try {
        listener(event)
      } catch (err) {
        this.log(`[airside] realtime listener failed: ${String(err)}`)
      }
    }
  }

  /** Drop empty page buckets and the whole scope entry once nothing is left, so the map doesn't leak. */
  private prune(key: string): void {
    const entry = this.scopes.get(key)
    if (!entry) return
    for (const [pageKey, set] of entry.byPage) {
      if (set.size === 0) entry.byPage.delete(pageKey)
    }
    if (entry.allPages.size === 0 && entry.byPage.size === 0) this.scopes.delete(key)
  }
}
