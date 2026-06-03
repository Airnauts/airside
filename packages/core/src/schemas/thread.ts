import { z } from 'zod'
import { ThreadId } from '../ids'
import { Anchor } from './anchor'
import { CaptureContext, Provenance } from './capture'
import { Author, Comment } from './comment'
import { IsoTimestamp } from './common'

export const ThreadStatus = z.enum(['open', 'resolved'])
export type ThreadStatus = z.infer<typeof ThreadStatus>

export const AnchorState = z.enum(['anchored', 'orphaned'])
export type AnchorState = z.infer<typeof AnchorState>

const ThreadBase = z.object({
  id: ThreadId,
  scope: z.literal('page'),
  pageKey: z.string().nullable(),
  pageUrl: z.url(),
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
