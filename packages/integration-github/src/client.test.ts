import { IntegrationError } from '@airnauts/airside-server'
import { describe, expect, it, vi } from 'vitest'
import { createGitHubClient } from './client'

const cfg = {
  token: 'ghp_supersecrettoken',
  owner: 'acme',
  repo: 'web',
}

describe('createGitHubClient', () => {
  it('POSTs to /repos/{owner}/{repo}/issues with Bearer auth and returns id+key+url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 10042,
        number: 42,
        html_url: 'https://github.com/acme/web/issues/42',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createGitHubClient(cfg)
    const out = await client.createIssue({ title: 'T', body: 'B', labels: ['x'] })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/acme/web/issues')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer ghp_supersecrettoken')
    expect(init.headers.accept).toBe('application/vnd.github+json')
    expect(init.headers['x-github-api-version']).toBe('2022-11-28')
    expect(JSON.parse(init.body)).toMatchObject({ title: 'T', body: 'B', labels: ['x'] })
    expect(out).toEqual({
      externalId: '10042',
      key: '#42',
      url: 'https://github.com/acme/web/issues/42',
    })
  })

  it('maps a 401 to an IntegrationError without leaking the token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad creds' }),
    )
    const err = await createGitHubClient(cfg)
      .createIssue({ title: 'T', body: 'B' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(IntegrationError)
    expect(err.message).not.toContain(cfg.token)
  })

  it('maps a network throw to an IntegrationError without leaking the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnrefused')))
    const err = await createGitHubClient(cfg)
      .createIssue({ title: 'T', body: 'B' })
      .catch((e) => e)
    expect(err).toBeInstanceOf(IntegrationError)
    expect(err.message).not.toContain(cfg.token)
  })
})
