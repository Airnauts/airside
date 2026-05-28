import type { Operation } from '@comments/core'
import type { Ctx } from './ctx'
import { ValidationError } from './errors'
import { parseMultipart } from './multipart'

export type UseCaseInput = {
  ctx: Ctx
  params: Record<string, string> | undefined
  query: unknown
  body: unknown
}

export type UseCase = (input: UseCaseInput) => Promise<unknown>
export type UseCaseMap = Record<string, UseCase>

export type CompiledRoute = {
  op: Operation
  regex: RegExp
  paramNames: string[]
}

export type MatchResult = { op: Operation; params: Record<string, string> }

const PARAM = /:([A-Za-z_][A-Za-z0-9_]*)/g

export function compileRoutes(operations: readonly Operation[]): CompiledRoute[] {
  return operations.map((op) => {
    const paramNames: string[] = []
    const pattern = op.path.replace(PARAM, (_match, name: string) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    return { op, regex: new RegExp(`^${pattern}$`), paramNames }
  })
}

export function match(req: Request, routes: readonly CompiledRoute[]): MatchResult | null {
  const url = new URL(req.url)
  for (const route of routes) {
    if (route.op.method !== req.method) continue
    const m = route.regex.exec(url.pathname)
    if (!m) continue
    const params: Record<string, string> = {}
    for (let i = 0; i < route.paramNames.length; i++) {
      const name = route.paramNames[i]
      const value = m[i + 1]
      if (name && value !== undefined) params[name] = value
    }
    return { op: route.op, params }
  }
  return null
}

function searchToObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of url.searchParams.entries()) {
    out[k] = v
  }
  return out
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function zodParse<T>(
  schema: { parse: (input: unknown) => T } | undefined,
  input: unknown,
  label: string,
): T | undefined {
  if (!schema) return undefined
  try {
    return schema.parse(input)
  } catch (err) {
    throw new ValidationError(`invalid ${label}`, err)
  }
}

export async function dispatch(
  routes: readonly CompiledRoute[],
  useCases: UseCaseMap,
  ctx: Ctx,
  req: Request,
): Promise<Response> {
  const found = match(req, routes)
  if (!found) return json(404, { error: { code: 'NOT_FOUND', message: 'no route' } })
  const { op, params } = found
  const handler = useCases[op.operationId]
  if (!handler) {
    throw new Error(`no use-case registered for operationId '${op.operationId}'`)
  }
  const url = new URL(req.url)
  const parsedParams = zodParse(op.params, params, 'path params')
  const parsedQuery = zodParse(op.query, searchToObject(url), 'query')
  let parsedBody: unknown
  if (op.body === 'multipart') {
    parsedBody = await parseMultipart(req)
  } else if (op.body) {
    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      throw new ValidationError('invalid JSON body')
    }
    parsedBody = zodParse(op.body, raw, 'body')
  }
  const out = await handler({
    ctx,
    params: parsedParams as Record<string, string> | undefined,
    query: parsedQuery,
    body: parsedBody,
  })
  return json(op.success.status, out)
}
