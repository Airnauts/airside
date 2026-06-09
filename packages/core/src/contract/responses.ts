import { z } from 'zod'
import { ThreadListItemView } from '../schemas/thread'

export const ThreadListResponse = z
  .object({
    threads: z.array(ThreadListItemView),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ThreadListResponse' })
export type ThreadListResponse = z.infer<typeof ThreadListResponse>
