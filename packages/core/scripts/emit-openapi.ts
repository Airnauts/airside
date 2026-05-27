import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildOpenApiDocument } from '../src/index'

const here = dirname(fileURLToPath(import.meta.url))
const outFile = resolve(here, '../dist/openapi.json')

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
console.log(`wrote ${outFile}`)
