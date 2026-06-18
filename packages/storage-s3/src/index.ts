import { randomBytes } from 'node:crypto'
import { posix } from 'node:path'
import {
  type PutBlob,
  type PutResult,
  readAllBytes,
  type StorageAdapter,
  sanitizeName,
} from '@airnauts/airside-server'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

/**
 * Narrow seam over the S3 client's `send`. The real `S3Client` satisfies it, and
 * tests inject an in-memory fake without matching the SDK's heavily-overloaded
 * `send` (same philosophy as the postgres adapter's narrow `SqlExecutor`).
 */
export type S3ClientLike = {
  send(command: unknown): Promise<unknown>
}

export type S3StorageOptions = {
  /** Target bucket name. */
  bucket: string
  /**
   * Stable, public base URL for the object URLs returned by `put` — a CDN/custom
   * domain, an R2 public-bucket URL, or the virtual-hosted S3 URL. Required and
   * explicit: the adapter never derives `https://<bucket>.s3.<region>.amazonaws.com`,
   * because a derived URL silently fails when the bucket is private or fronted by a
   * CDN. The object is uploaded **without an ACL**; serving the prefix publicly is
   * the host's bucket-policy / CDN responsibility. A trailing slash is trimmed.
   */
  publicBaseUrl: string
  /** AWS region. Defaults to `us-east-1`; R2 uses `auto`. */
  region?: string
  /** S3-compatible endpoint (Cloudflare R2, MinIO, …). */
  endpoint?: string
  /**
   * Explicit credentials. When omitted, the AWS SDK default provider chain resolves
   * them (IAM instance/task role on Lambda/ECS/EC2) — a deliberate divergence from
   * ADR-0028's "no ambient env read", since role-based credentials are the idiomatic
   * AWS deployment mode (see ADR-0045).
   */
  credentials?: { accessKeyId: string; secretAccessKey: string }
  /**
   * Optional prefix (e.g. `'staging/'`) applied to every key. A trailing `/` is
   * appended automatically if missing, so `'staging'` and `'staging/'` behave the
   * same way.
   */
  keyPrefix?: string
  /** Use path-style addressing (MinIO / some S3-compatible endpoints). */
  forcePathStyle?: boolean
  /** Inject a client (testing/advanced); overrides the build-from-config options. */
  client?: S3ClientLike
}

export type R2StorageOptions = Omit<S3StorageOptions, 'region' | 'endpoint'> & {
  /** Cloudflare account ID; the R2 S3-API endpoint is derived from it. */
  accountId: string
}

/**
 * S3 has no `addRandomSuffix`, so we mint a collision-resistant key locally
 * (timestamp + random bytes + sanitized name), mirroring `storage-fs`. Required by
 * the "two puts of the same name yield distinct keys" contract test.
 */
function uniqueKey(name: string): string {
  const ts = Date.now().toString(36)
  const rand = randomBytes(6).toString('hex')
  const safe = sanitizeName(name)
  return posix.join(ts, `${rand}-${safe}`)
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3ClientLike
  private readonly bucket: string
  private readonly publicBaseUrl: string
  private readonly keyPrefix: string

  constructor(opts: S3StorageOptions) {
    this.bucket = opts.bucket
    this.publicBaseUrl = opts.publicBaseUrl.replace(/\/$/, '')
    const raw = opts.keyPrefix ?? ''
    this.keyPrefix = raw === '' || raw.endsWith('/') ? raw : `${raw}/`
    this.client =
      opts.client ??
      new S3Client({
        region: opts.region ?? 'us-east-1',
        endpoint: opts.endpoint,
        credentials: opts.credentials,
        forcePathStyle: opts.forcePathStyle,
      })
  }

  async put(blob: PutBlob): Promise<PutResult> {
    const bytes = await readAllBytes(blob.data)
    const key = `${this.keyPrefix}${uniqueKey(blob.name)}`
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: blob.contentType,
        ContentLength: bytes.byteLength,
      }),
    )
    return {
      key,
      url: `${this.publicBaseUrl}/${key}`,
      size: bytes.byteLength,
    }
  }
}

/**
 * Construct an Amazon S3 (or any S3-compatible) `StorageAdapter`
 * (uniform `create<Provider>Storage(config)` shape).
 */
export function createS3Storage(opts: S3StorageOptions): StorageAdapter {
  return new S3Storage(opts)
}

/**
 * Construct a Cloudflare R2 `StorageAdapter`. Fills `region: 'auto'` and derives the
 * R2 S3-API endpoint from `accountId`; otherwise identical to {@link createS3Storage}.
 */
export function createR2Storage(opts: R2StorageOptions): StorageAdapter {
  const { accountId, ...rest } = opts
  return createS3Storage({
    ...rest,
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  })
}

export const packageName = '@airnauts/airside-storage-s3'
