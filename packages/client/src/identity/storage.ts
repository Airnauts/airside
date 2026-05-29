export type Identity = {
  email: string
  name?: string
}

const STORAGE_KEY = 'comments:identity'

export function loadIdentity(store: Storage = localStorage): Identity | null {
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof (parsed as { email?: unknown }).email === 'string'
    ) {
      const { email, name } = parsed as { email: string; name?: unknown }
      return { email, name: typeof name === 'string' ? name : undefined }
    }
    return null
  } catch {
    return null
  }
}

export function saveIdentity(identity: Identity, store: Storage = localStorage): void {
  store.setItem(STORAGE_KEY, JSON.stringify({ email: identity.email, name: identity.name }))
}
