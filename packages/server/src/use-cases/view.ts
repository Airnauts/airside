import type { ExtensionRegistry } from '../extensions/registry'
import type { Scope } from '../repository/types'

export function toThreadView<T extends { externalLinks?: unknown[] }>(
  thread: T,
  registry: ExtensionRegistry,
  scope: Scope,
) {
  return { ...thread, actions: registry.evaluateDescriptors({ thread: thread as never, scope }) }
}

export function toThreadListItemView<T extends { externalLinks?: unknown[] }>(
  item: T,
  registry: ExtensionRegistry,
  scope: Scope,
) {
  return { ...item, actions: registry.evaluateDescriptors({ thread: item as never, scope }) }
}
