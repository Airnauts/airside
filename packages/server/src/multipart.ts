import { ValidationError } from './errors'

export type ParsedUpload = {
  data: Blob
  name: string
  contentType: string
}

export async function parseMultipart(req: Request): Promise<ParsedUpload> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ValidationError('invalid multipart body')
  }
  const keys = [...form.keys()]
  if (keys.length !== 1 || keys[0] !== 'file') {
    throw new ValidationError('upload must contain exactly one `file` field')
  }
  const entry = form.get('file')
  if (!(entry instanceof Blob)) {
    throw new ValidationError('`file` field must be a binary blob')
  }
  const name = entry instanceof File ? entry.name : 'upload'
  return {
    data: entry,
    name,
    contentType: entry.type || 'application/octet-stream',
  }
}
