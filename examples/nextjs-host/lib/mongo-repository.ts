import { createMongoRepository, ensureIndexes } from '@airnauts/comments-adapter-mongo'
import type { Repository } from '@airnauts/comments-server'
import { MongoClient } from 'mongodb'

// Memoize the connected repository across HMR reloads / warm serverless invocations.
const globalForMongo = globalThis as unknown as { __commentsRepo?: Promise<Repository> }

async function connect(uri: string): Promise<Repository> {
  const client = new MongoClient(uri)
  await client.connect()
  // MongoClient is intentionally left open for the lifetime of the process.
  const db = client.db() // database name comes from the connection string
  await ensureIndexes(db)
  return createMongoRepository({ db })
}

/**
 * Returns a `Repository` whose methods connect to MongoDB on the first call and
 * reuse one client thereafter — so `createCommentsServer` can build the server
 * synchronously at module load without awaiting the connection.
 */
export function mongoRepository(uri: string): Repository {
  const get = (): Promise<Repository> => {
    globalForMongo.__commentsRepo ??= connect(uri).catch((err) => {
      globalForMongo.__commentsRepo = undefined // allow a retry on the next call
      return Promise.reject(err)
    })
    return globalForMongo.__commentsRepo
  }
  return {
    createThread: (input) => get().then((r) => r.createThread(input)),
    getThread: (scope, id) => get().then((r) => r.getThread(scope, id)),
    listThreads: (query) => get().then((r) => r.listThreads(query)),
    addComment: (scope, threadId, comment) =>
      get().then((r) => r.addComment(scope, threadId, comment)),
    setStatus: (scope, threadId, status, now) =>
      get().then((r) => r.setStatus(scope, threadId, status, now)),
    updateAnchor: (scope, threadId, patch, now) =>
      get().then((r) => r.updateAnchor(scope, threadId, patch, now)),
  }
}
