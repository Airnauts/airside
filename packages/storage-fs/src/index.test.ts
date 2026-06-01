import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storageContract } from '@airnauts/comments-test-support'
import { FileSystemStorage } from './index'

storageContract(
  'fs',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'comments-storage-fs-'))
    return new FileSystemStorage({ rootDir: dir })
  },
  async (url) => new Uint8Array(await readFile(fileURLToPath(url))),
)
