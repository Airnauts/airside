import { DEFAULT_KEY_PARAM } from './config'

export type GateInput = {
  search: string
  key: string
  keyParam?: string
}

/** Activated iff the configured URL param is present AND equals the init key. */
export function isActivated({ search, key, keyParam = DEFAULT_KEY_PARAM }: GateInput): boolean {
  return new URLSearchParams(search).get(keyParam) === key
}
