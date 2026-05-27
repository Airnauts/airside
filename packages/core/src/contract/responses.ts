import { z } from 'zod'
import { ThreadListItem } from '../schemas/thread'

export const ThreadListResponse = z
  .object({
    threads: z.array(ThreadListItem),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ThreadListResponse' })
export type ThreadListResponse = z.infer<typeof ThreadListResponse>
