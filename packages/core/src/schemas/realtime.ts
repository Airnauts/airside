import { z } from 'zod'
import { ThreadId } from '../ids'
import { Comment } from './comment'
import { AnchorState, ThreadListItemView, ThreadStatus } from './thread'

/** The live-update events pushed over `GET /events` (architecture §2, ADR-0044). */
export const RealtimeEventType = z.enum(['thread.created', 'comment.added', 'thread.updated'])
export type RealtimeEventType = z.infer<typeof RealtimeEventType>

// Every event carries its thread's `pageKey` (nullable per ThreadBase.pageKey) so the
// dual-scope bus can fan it out to the matching page subscribers (pins) as well as the
// all-pages subscribers (panel). A null pageKey reaches the all-pages scope only.
const ThreadCreated = z.object({
  type: z.literal('thread.created'),
  pageKey: z.string().nullable(),
  // Full list-item view (anchor/signals + server-evaluated actions) so the pin layer can
  // re-match it and the panel can insert the row without a refetch.
  thread: ThreadListItemView,
})

const CommentAdded = z.object({
  type: z.literal('comment.added'),
  pageKey: z.string().nullable(),
  threadId: ThreadId,
  comment: Comment,
})

const ThreadUpdated = z.object({
  type: z.literal('thread.updated'),
  pageKey: z.string().nullable(),
  threadId: ThreadId,
  status: ThreadStatus,
  anchorState: AnchorState,
})

export const RealtimeEvent = z
  .discriminatedUnion('type', [ThreadCreated, CommentAdded, ThreadUpdated])
  .meta({ id: 'RealtimeEvent' })
export type RealtimeEvent = z.infer<typeof RealtimeEvent>
