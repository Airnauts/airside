import { z } from 'zod'
import { AttachmentId, AuthorId, CommentId } from '../ids'
import { Email, IsoTimestamp } from './common'

export const Author = z
  .object({ id: AuthorId.optional(), email: Email, name: z.string().optional() })
  .meta({ id: 'Author' })
export type Author = z.infer<typeof Author>

export const Attachment = z
  .object({
    id: AttachmentId,
    url: z.url(),
    name: z.string(),
    contentType: z.string(),
    size: z.number().int().nonnegative(),
    w: z.number().int().positive().optional(),
    h: z.number().int().positive().optional(),
  })
  .meta({ id: 'Attachment' })
export type Attachment = z.infer<typeof Attachment>

export const Comment = z
  .object({
    id: CommentId,
    author: Author,
    text: z.string(),
    attachments: z.array(Attachment),
    createdAt: IsoTimestamp,
    editedAt: IsoTimestamp.optional(),
  })
  .meta({ id: 'Comment' })
export type Comment = z.infer<typeof Comment>
