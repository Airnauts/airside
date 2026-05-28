export type PutBlob = {
  data: Uint8Array | ReadableStream<Uint8Array>
  contentType: string
  name: string
}

export type PutResult = {
  url: string
  key: string
  size: number
}

export interface StorageAdapter {
  put(blob: PutBlob): Promise<PutResult>
}
