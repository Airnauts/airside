# @airnauts/comments-storage-fs

Filesystem attachment-storage adapter for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-storage-fs
```

## Usage

```ts
import { fileSystemStorage } from '@airnauts/comments-storage-fs'

const storage = fileSystemStorage({ rootDir: './uploads' })
```

By default `put` returns `file://` URLs; set `baseUrl` (e.g. `'/uploads'`) to return
browser-served paths instead. The `FileSystemStorage` class is also exported if you
prefer `new FileSystemStorage(opts)`.

Pass `storage` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
