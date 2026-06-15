import { z } from 'zod'
import { ThreadId } from '../ids'
import { Anchor } from './anchor'
import { CaptureContext, Provenance } from './capture'
import { Author, Comment } from './comment'
import { HttpUrl, IsoTimestamp } from './common'
import { ExternalLink } from './external-link'
import { ThreadActionDescriptor } from './thread-action'

export const ThreadStatus = z.enum(['open', 'resolved'])
export type ThreadStatus = z.infer<typeof ThreadStatus>

/** Domain policy: how a thread's status contributes to its `unresolvedCount`. */
export function unresolvedCountOf(status: ThreadStatus): number {
  return status === 'open' ? 1 : 0
}

export const AnchorState = z.enum(['anchored', 'orphaned'])
export type AnchorState = z.infer<typeof AnchorState>

const ThreadBase = z.object({
  id: ThreadId,
  scope: z.literal('page'),
  pageKey: z.string().nullable(),
  pageUrl: HttpUrl,
  pageTitle: z.string().optional(),
  anchor: Anchor,
  status: ThreadStatus,
  anchorState: AnchorState,
  selectionLost: z.boolean().optional(),
  commentCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  createdBy: Author,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  lastActivityAt: IsoTimestamp,
  schemaVersion: z.number().int().positive(),
  externalLinks: z.array(ExternalLink).optional(),
})

export const ThreadListItem = ThreadBase.extend({
  rootComment: z.object({ text: z.string(), createdAt: IsoTimestamp }).nullable(),
}).meta({ id: 'ThreadListItem' })
export type ThreadListItem = z.infer<typeof ThreadListItem>

export const Thread = ThreadBase.extend({
  comments: z.array(Comment),
  captureContext: CaptureContext,
  provenance: Provenance.optional(),
}).meta({ id: 'Thread' })
export type Thread = z.infer<typeof Thread>

/** Response-only: full thread plus server-evaluated, non-persisted actions. */
export const ThreadView = Thread.extend({
  actions: z.array(ThreadActionDescriptor),
}).meta({ id: 'ThreadView' })
export type ThreadView = z.infer<typeof ThreadView>

/** Response-only: list item plus server-evaluated actions. */
export const ThreadListItemView = ThreadListItem.extend({
  actions: z.array(ThreadActionDescriptor),
}).meta({ id: 'ThreadListItemView' })
export type ThreadListItemView = z.infer<typeof ThreadListItemView>
