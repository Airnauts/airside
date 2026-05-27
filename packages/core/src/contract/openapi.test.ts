import { validate } from '@scalar/openapi-parser'
import { describe, expect, it } from 'vitest'
import { buildOpenApiDocument } from './openapi'
import { KEY_HEADER_NAME } from './wire'

describe('buildOpenApiDocument', () => {
  it('produces an OpenAPI 3.1 document that validates', async () => {
    const doc = buildOpenApiDocument()
    expect(doc.openapi).toBe('3.1.0')
    const { valid, errors } = await validate(JSON.stringify(doc))
    expect(errors ?? []).toEqual([])
    expect(valid).toBe(true)
  })

  it('exposes every frozen path + method', () => {
    const doc = buildOpenApiDocument()
    const paths = doc.paths ?? {}
    expect(Object.keys(paths).sort()).toEqual(
      [
        '/threads',
        '/threads/{id}',
        '/threads/{id}/comments',
        '/threads/{id}/anchor',
        '/uploads',
      ].sort(),
    )
    expect(paths['/threads']?.post).toBeDefined()
    expect(paths['/threads']?.get).toBeDefined()
    expect(paths['/threads/{id}']?.patch).toBeDefined()
  })

  it('registers component schemas and the key-header security scheme', () => {
    const doc = buildOpenApiDocument()
    const schemas = doc.components?.schemas ?? {}
    expect(Object.keys(schemas)).toEqual(expect.arrayContaining(['Thread', 'Anchor', 'Signals']))
    const scheme = doc.components?.securitySchemes?.commentsKey
    expect(scheme).toMatchObject({ type: 'apiKey', in: 'header', name: KEY_HEADER_NAME })
  })
})
