import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors'
import { parseMultipart } from './multipart'

function makeReq(form: FormData): Request {
  return new Request('http://x/uploads', { method: 'POST', body: form })
}

describe('parseMultipart', () => {
  it('extracts the file blob with name and contentType', async () => {
    const form = new FormData()
    const file = new File([new Uint8Array([1, 2, 3])], 'pixel.png', { type: 'image/png' })
    form.append('file', file)
    const parsed = await parseMultipart(makeReq(form))
    expect(parsed.name).toBe('pixel.png')
    expect(parsed.contentType).toBe('image/png')
    const bytes = new Uint8Array(await parsed.data.arrayBuffer())
    expect(Array.from(bytes)).toEqual([1, 2, 3])
  })

  it('throws ValidationError when no `file` field is present', async () => {
    const form = new FormData()
    form.append('not-file', 'string')
    await expect(parseMultipart(makeReq(form))).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when the `file` field is not a file', async () => {
    const form = new FormData()
    form.append('file', 'string')
    await expect(parseMultipart(makeReq(form))).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when extra fields are present', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([0])], 'x.png', { type: 'image/png' }))
    form.append('extra', 'oops')
    await expect(parseMultipart(makeReq(form))).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when the form has no fields', async () => {
    const form = new FormData()
    await expect(parseMultipart(makeReq(form))).rejects.toBeInstanceOf(ValidationError)
  })

  it('throws ValidationError when `file` is repeated', async () => {
    const form = new FormData()
    form.append('file', new File([new Uint8Array([0])], 'a.png', { type: 'image/png' }))
    form.append('file', new File([new Uint8Array([1])], 'b.png', { type: 'image/png' }))
    await expect(parseMultipart(makeReq(form))).rejects.toBeInstanceOf(ValidationError)
  })
})
