// packages/client/src/identity/storage.ts

/** The logged-in reviewer's identity. The localStorage read/write for this lives in the
 *  shared settings store (`settings/store.ts`, key `airside:identity`); this module keeps
 *  only the shared type that the store and the UI both import. */
export type Identity = {
  email: string
  name?: string
}
