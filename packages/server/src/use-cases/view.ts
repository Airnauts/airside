import type { Comment, Thread, ThreadListItem, ThreadListItemView } from '@airnauts/airside-core'
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

/**
 * Project a freshly-created full `Thread` to the `ThreadListItemView` shape the live
 * `thread.created` event carries — list fields only (the comments collapse to `rootComment`)
 * plus server-evaluated actions — so the pin layer can re-match it and the panel can insert
 * the row without a refetch.
 */
export function toListItemView(
  thread: Thread,
  rootComment: Pick<Comment, 'text' | 'createdAt'>,
  registry: ExtensionRegistry,
  scope: Scope,
): ThreadListItemView {
  const { comments: _comments, captureContext: _cc, provenance: _p, ...base } = thread
  const item: ThreadListItem = {
    ...base,
    rootComment: { text: rootComment.text, createdAt: rootComment.createdAt },
  }
  return withThreadActions(item, registry, scope)
}
