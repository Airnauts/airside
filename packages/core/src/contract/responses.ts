import { z } from 'zod'
import { ThreadId } from '../ids'
import { ThreadListItemView } from '../schemas/thread'

export const ThreadListResponse = z
  .object({
    threads: z.array(ThreadListItemView),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ThreadListResponse' })
export type ThreadListResponse = z.infer<typeof ThreadListResponse>

// Delete returns the id of the removed thread (200, not 204): the operation table
// requires a success schema and `dispatch` always json()s the result. The client
// ignores the body — the id is enough to confirm which thread was removed.
export const DeleteThreadResponse = z.object({ id: ThreadId }).meta({ id: 'DeleteThreadResponse' })
export type DeleteThreadResponse = z.infer<typeof DeleteThreadResponse>
