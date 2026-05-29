import { createCommentsServer, InMemoryRepository } from '@comments/server'
import { createDevServer } from '@comments/server/dev'

const storageStub = {
  async put(blob) {
    return { url: `mem://${blob.name}`, key: blob.name, size: 0 }
  },
}

const server = createCommentsServer({
  secretKey: 'dev-key',
  projectId: 'playground',
  allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  repository: new InMemoryRepository(),
  storage: storageStub,
  rateLimit: false,
})

const dev = createDevServer((req) => server.handle(req), { port: 4321 })
const { port } = await dev.listen()
console.log(`[playground] in-memory comments API on http://127.0.0.1:${port}`)
