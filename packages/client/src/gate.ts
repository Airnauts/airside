import { DEFAULT_KEY_PARAM } from './config'

export type GateInput = {
  search: string
  key: string
  keyParam?: string
  /** A previously persisted key (e.g. from localStorage), checked when the URL param is absent. */
  storedKey?: string | null
}

/** Activated iff the configured URL param OR a persisted key equals the init key. */
export function isActivated({
  search,
  key,
  keyParam = DEFAULT_KEY_PARAM,
  storedKey = null,
}: GateInput): boolean {
  return new URLSearchParams(search).get(keyParam) === key || storedKey === key
}

/**
 * True when the URL param itself carries the matching key — the one-time case
 * where `init` should persist the key and strip it from the address bar.
 */
export function isUrlActivation({
  search,
  key,
  keyParam = DEFAULT_KEY_PARAM,
}: Omit<GateInput, 'storedKey'>): boolean {
  return new URLSearchParams(search).get(keyParam) === key
}
