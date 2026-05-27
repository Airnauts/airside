import { z } from 'zod'

export const ThreadId = z.string().min(1).brand<'ThreadId'>()
export type ThreadId = z.infer<typeof ThreadId>

export const CommentId = z.string().min(1).brand<'CommentId'>()
export type CommentId = z.infer<typeof CommentId>

export const AuthorId = z.string().min(1).brand<'AuthorId'>()
export type AuthorId = z.infer<typeof AuthorId>

export const AttachmentId = z.string().min(1).brand<'AttachmentId'>()
export type AttachmentId = z.infer<typeof AttachmentId>
