# @airnauts/comments-storage-fs

Filesystem attachment-storage adapter for the
[Airnauts commenting tool](https://github.com/Airnauts/commenting-tool) server.

## Install

```bash
pnpm add @airnauts/comments-storage-fs
```

## Usage

```ts
import { FileSystemStorage } from '@airnauts/comments-storage-fs'

const storage = new FileSystemStorage({ rootDir: './uploads' })
```

Pass `storage` to `createCommentsServer` from `@airnauts/comments-server`.

## License

MIT © Airnauts
