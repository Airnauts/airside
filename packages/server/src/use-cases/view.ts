import type { ExtensionRegistry } from '../extensions/registry'
import type { Scope } from '../repository/types'

/** Response mapping: a stored thread/list item plus server-evaluated, non-persisted actions. */
export function withThreadActions<T extends { externalLinks?: unknown[] }>(
  thread: T,
  registry: ExtensionRegistry,
  scope: Scope,
) {
  return { ...thread, actions: registry.evaluateDescriptors({ thread: thread as never, scope }) }
}
