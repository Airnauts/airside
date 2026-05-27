import {
  createDocument,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
  type ZodOpenApiResponsesObject,
} from 'zod-openapi'
import { ERROR_STATUS, ErrorResponse } from './errors'
import { operations } from './operations'
import { UploadForm } from './requests'
import { KEY_HEADER_NAME } from './wire'

function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

export function buildOpenApiDocument(): ReturnType<typeof createDocument> {
  const paths: ZodOpenApiPathsObject = {}

  for (const op of operations) {
    // ZodOpenApiResponsesObject only accepts keys matching `${1|2|3|4|5}${string}`,
    // so we cast via unknown to satisfy the template-literal index signature.
    const responses = {} as ZodOpenApiResponsesObject
    ;(responses as Record<string, unknown>)[String(op.success.status)] = {
      description: `${op.operationId} success`,
      content: { 'application/json': { schema: op.success.schema } },
    }
    for (const code of op.errors) {
      ;(responses as Record<string, unknown>)[String(ERROR_STATUS[code])] = {
        description: code,
        content: { 'application/json': { schema: ErrorResponse } },
      }
    }

    const operation: ZodOpenApiOperationObject = {
      operationId: op.operationId,
      summary: op.summary,
      responses,
    }
    if (op.params || op.query) {
      operation.requestParams = {}
      if (op.params) operation.requestParams.path = op.params
      if (op.query) operation.requestParams.query = op.query
    }
    if (op.body === 'multipart') {
      operation.requestBody = { content: { 'multipart/form-data': { schema: UploadForm } } }
    } else if (op.body) {
      operation.requestBody = { content: { 'application/json': { schema: op.body } } }
    }

    const openApiPath = toOpenApiPath(op.path)
    const method = op.method.toLowerCase() as 'get' | 'post' | 'patch'
    paths[openApiPath] = { ...(paths[openApiPath] ?? {}), [method]: operation }
  }

  return createDocument({
    openapi: '3.1.0',
    info: { title: 'Comments API', version: '1.0.0' },
    components: {
      securitySchemes: {
        commentsKey: { type: 'apiKey', in: 'header', name: KEY_HEADER_NAME },
      },
    },
    security: [{ commentsKey: [] }],
    paths,
  })
}
