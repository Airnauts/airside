import {
  type CommentsServer,
  createCommentsServer,
  InMemoryRepository,
  type Repository,
  type StorageAdapter,
} from '@comments/server'
import { VercelBlobStorage } from '@comments/storage-vercel-blob'
import { mongoRepository } from './mongo-repository'
import { publicUploadsStorage } from './public-uploads-storage'

// Env-switched persistence: Mongo when MONGODB_URI is set, else in-memory (ephemeral).
function repository(): Repository {
  const uri = process.env.MONGODB_URI
  return uri ? mongoRepository(uri) : new InMemoryRepository()
}

// Env-switched storage: Vercel Blob when its token is present, else local public/uploads.
function storage(): StorageAdapter {
  return process.env.BLOB_READ_WRITE_TOKEN ? new VercelBlobStorage() : publicUploadsStorage()
}

export const server: CommentsServer = createCommentsServer({
  secretKey: 'dev-key',
  projectId: 'nextjs-host',
  allowedOrigins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  repository: repository(),
  storage: storage(),
  rateLimit: false,
})
