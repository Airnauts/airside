import { createNextHandler } from '@airnauts/comments-server/next'
import { server } from '@/lib/comments-server'

export const { GET, POST, PATCH, OPTIONS } = createNextHandler(server)
