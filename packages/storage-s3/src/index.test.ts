import type { StorageAdapter } from '@airnauts/airside-server'
import { storageContract } from '@airnauts/airside-test-support'
import type { PutObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { createR2Storage, createS3Storage, S3Storage } from './index'

/**
 * In-memory fake `S3Client` injected via the `client` seam. `send` handles the
 * `PutObjectCommand`s issued by `S3Storage.put`: it records each input (for
 * shape assertions) and stores the body keyed by `Key`. Tests read it back by
 * stripping `publicBaseUrl` off the returned URL to recover the key.
 */
class FakeS3Client {
  readonly store = new Map<string, Uint8Array>()
  readonly puts: PutObjectCommandInput[] = []

  send(command: PutObjectCommand): Promise<unknown> {
    const input = command.input
    this.puts.push(input)
    const body = input.Body
    if (!(body instanceof Uint8Array)) {
      return Promise.reject(
        new Error(`fake S3Client expected a Uint8Array Body, got ${typeof body}`),
      )
    }
    this.store.set(String(input.Key), body)
    return Promise.resolve({})
  }
}

const PUBLIC_BASE = 'https://cdn.example.com'

// --- Always-on hermetic contract: the shared suite against an injected fake. ---
// `readBack` is a fixed top-level arg while `makeStorage` runs per-test, so the
// fake (and its Map) must be module-scoped for both to close over the same store.
const contractFake = new FakeS3Client()

storageContract(
  's3',
  () =>
    Promise.resolve(
      createS3Storage({ bucket: 'test-bucket', publicBaseUrl: PUBLIC_BASE, client: contractFake }),
    ),
  (url) => {
    const prefix = `${PUBLIC_BASE}/`
    const key = url.slice(prefix.length)
    const bytes = contractFake.store.get(key)
    if (!bytes) throw new Error(`readBack: no object stored at "${key}"`)
    return Promise.resolve(bytes)
  },
)

// --- Env-gated real run, mirroring vercel-blob's BLOB_READ_WRITE_TOKEN skip. ---
const realBucket = process.env.S3_TEST_BUCKET
const realEndpoint = process.env.S3_TEST_ENDPOINT
const realBase = process.env.S3_TEST_PUBLIC_BASE_URL

if (realBucket && realEndpoint && realBase) {
  storageContract(
    's3 (real)',
    () =>
      Promise.resolve(
        createS3Storage({
          bucket: realBucket,
          publicBaseUrl: realBase,
          endpoint: realEndpoint,
          region: process.env.S3_TEST_REGION ?? 'us-east-1',
          forcePathStyle: process.env.S3_TEST_FORCE_PATH_STYLE === 'true',
          keyPrefix: `test-${Date.now()}/`,
          credentials:
            process.env.S3_TEST_ACCESS_KEY_ID && process.env.S3_TEST_SECRET_ACCESS_KEY
              ? {
                  accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID,
                  secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY,
                }
              : undefined,
        }),
      ),
    async (url) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`readBack failed: ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    },
  )
} else {
  describe('StorageAdapter contract — s3 (real)', () => {
    it.skip('skipped: S3_TEST_BUCKET / S3_TEST_ENDPOINT / S3_TEST_PUBLIC_BASE_URL not set', () => {})
  })
}

// --- Introspect the underlying S3 client's resolved config (R2 wiring). ---
type ResolvedClientConfig = {
  region: () => Promise<string>
  endpoint?: () => Promise<{ hostname: string }>
}

function clientConfig(adapter: StorageAdapter): ResolvedClientConfig {
  return (adapter as unknown as { client: { config: ResolvedClientConfig } }).client.config
}

const DUMMY_CREDS = { accessKeyId: 'test-key', secretAccessKey: 'test-secret' }

function put(storage: StorageAdapter, name: string, data = new Uint8Array([1, 2, 3])) {
  return storage.put({ data, contentType: 'image/png', name })
}

describe('createS3Storage', () => {
  it('returns a StorageAdapter', () => {
    const storage = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      credentials: DUMMY_CREDS,
    })
    expect(typeof storage.put).toBe('function')
    expect(storage).toBeInstanceOf(S3Storage)
  })

  it("defaults region to 'us-east-1' and passes a custom region through", async () => {
    const def = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      credentials: DUMMY_CREDS,
    })
    expect(await clientConfig(def).region()).toBe('us-east-1')

    const custom = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      region: 'eu-west-1',
      credentials: DUMMY_CREDS,
    })
    expect(await clientConfig(custom).region()).toBe('eu-west-1')
  })

  it('sends a PutObjectCommand with the expected input shape', async () => {
    const fake = new FakeS3Client()
    const storage = createS3Storage({
      bucket: 'my-bucket',
      publicBaseUrl: PUBLIC_BASE,
      keyPrefix: 'uploads',
      client: fake,
    })
    const data = new Uint8Array([1, 2, 3, 4, 5])
    const result = await storage.put({ data, contentType: 'image/png', name: 'pic name!.png' })

    expect(fake.puts).toHaveLength(1)
    const input = fake.puts[0]
    expect(input.Bucket).toBe('my-bucket')
    expect(input.Key).toBe(result.key)
    expect(input.Key).toMatch(/^uploads\//)
    expect(input.Key).toMatch(/pic_name_\.png$/) // sanitizeName: space and '!' -> '_'
    expect(input.Body).toBe(data)
    expect(input.ContentType).toBe('image/png')
    expect(input.ContentLength).toBe(5)
    expect(result.size).toBe(5)
  })

  it('joins publicBaseUrl and key with a single slash', async () => {
    const fake = new FakeS3Client()
    const storage = createS3Storage({ bucket: 'b', publicBaseUrl: PUBLIC_BASE, client: fake })
    const result = await put(storage, 'a.png')
    expect(result.url).toBe(`${PUBLIC_BASE}/${result.key}`)
  })

  it('normalizes a trailing slash on publicBaseUrl', async () => {
    const fake = new FakeS3Client()
    const storage = createS3Storage({
      bucket: 'b',
      publicBaseUrl: `${PUBLIC_BASE}/`,
      client: fake,
    })
    const result = await put(storage, 'a.png')
    expect(result.url).toBe(`${PUBLIC_BASE}/${result.key}`)
    expect(result.url).not.toContain('.com//') // no double slash at the join
  })

  it('normalizes keyPrefix and treats trailing-slash variants identically', async () => {
    const without = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      keyPrefix: 'staging',
      client: new FakeS3Client(),
    })
    const withSlash = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      keyPrefix: 'staging/',
      client: new FakeS3Client(),
    })
    for (const storage of [without, withSlash]) {
      const result = await put(storage, 'a.png')
      expect(result.key.startsWith('staging/')).toBe(true)
      expect(result.key.startsWith('staging//')).toBe(false)
    }
  })

  it('applies no prefix by default (no leading slash on the key)', async () => {
    const storage = createS3Storage({
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      client: new FakeS3Client(),
    })
    const result = await put(storage, 'a.png')
    expect(result.key.startsWith('/')).toBe(false)
  })
})

describe('createR2Storage', () => {
  it('returns a StorageAdapter', () => {
    const storage = createR2Storage({
      accountId: 'abc123',
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      credentials: DUMMY_CREDS,
    })
    expect(typeof storage.put).toBe('function')
  })

  it("sets region 'auto' and derives the R2 endpoint from accountId", async () => {
    const storage = createR2Storage({
      accountId: 'abc123',
      bucket: 'b',
      publicBaseUrl: PUBLIC_BASE,
      credentials: DUMMY_CREDS,
    })
    const config = clientConfig(storage)
    expect(await config.region()).toBe('auto')
    const endpoint = await config.endpoint?.()
    expect(endpoint?.hostname).toBe('abc123.r2.cloudflarestorage.com')
  })
})
