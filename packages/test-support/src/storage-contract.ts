import type { StorageAdapter } from '@airnauts/comments-server'
import { beforeEach, describe, expect, it } from 'vitest'

const PNG_PIXEL = new Uint8Array([
  // a 1x1 transparent PNG (minimal valid file)
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

export type ReadBackFn = (url: string) => Promise<Uint8Array>

export function storageContract(
  name: string,
  makeStorage: () => Promise<StorageAdapter>,
  readBack: ReadBackFn,
): void {
  describe(`StorageAdapter contract — ${name}`, () => {
    let storage: StorageAdapter

    beforeEach(async () => {
      storage = await makeStorage()
    })

    it('put() returns a URL whose contents round-trip the input bytes', async () => {
      const result = await storage.put({
        data: PNG_PIXEL,
        contentType: 'image/png',
        name: 'pixel.png',
      })
      expect(result.size).toBe(PNG_PIXEL.byteLength)
      expect(result.url.length).toBeGreaterThan(0)
      const bytes = await readBack(result.url)
      expect(bytes).toEqual(PNG_PIXEL)
    })

    it('put() accepts a ReadableStream<Uint8Array> input and round-trips the bytes', async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(PNG_PIXEL)
          controller.close()
        },
      })
      const result = await storage.put({
        data: stream,
        contentType: 'image/png',
        name: 'streamed.png',
      })
      expect(result.size).toBe(PNG_PIXEL.byteLength)
      const bytes = await readBack(result.url)
      expect(bytes).toEqual(PNG_PIXEL)
    })

    it('two puts of the same name yield distinct keys and both are readable', async () => {
      const a = await storage.put({ data: PNG_PIXEL, contentType: 'image/png', name: 'x.png' })
      const b = await storage.put({ data: PNG_PIXEL, contentType: 'image/png', name: 'x.png' })
      expect(a.key).not.toBe(b.key)
      expect(a.url).not.toBe(b.url)
      expect(await readBack(a.url)).toEqual(PNG_PIXEL)
      expect(await readBack(b.url)).toEqual(PNG_PIXEL)
    })
  })
}
