import { describe, expect, it } from 'vitest'
import { readAllBytes, sanitizeName } from './util'

describe('sanitizeName', () => {
  it('keeps letters, digits, dots, underscores and dashes', () => {
    expect(sanitizeName('shot_2026-06.12.png')).toBe('shot_2026-06.12.png')
  })

  it('replaces every other character with an underscore', () => {
    expect(sanitizeName('weird name (1)/ü.png')).toBe('weird_name__1___.png')
  })

  it('caps the result at 200 characters', () => {
    expect(sanitizeName('a'.repeat(300))).toHaveLength(200)
  })

  it("falls back to 'file' when nothing survives", () => {
    expect(sanitizeName('')).toBe('file')
  })
})

describe('readAllBytes', () => {
  it('returns a Uint8Array unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    expect(await readAllBytes(bytes)).toBe(bytes)
  })

  it('drains a ReadableStream into one buffer', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]))
        controller.enqueue(new Uint8Array([3]))
        controller.close()
      },
    })
    expect(Array.from(await readAllBytes(stream))).toEqual([1, 2, 3])
  })

  it('releases the reader lock when a read rejects', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('boom')
      },
    })
    await expect(readAllBytes(stream)).rejects.toThrow('boom')
    // a released lock means the stream can be read (and immediately canceled) again
    expect(() => stream.getReader()).not.toThrow()
  })
})
