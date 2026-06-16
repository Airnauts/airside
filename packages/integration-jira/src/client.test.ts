import { IntegrationError } from '@airnauts/airside-server'
import { describe, expect, it, vi } from 'vitest'
import { createJiraClient } from './client'

const cfg = {
  siteUrl: 'https://co.atlassian.net',
  email: 'u@co',
  apiToken: 'tok',
  projectKey: 'WEB',
  issueType: 'Task',
}

describe('createJiraClient', () => {
  it('POSTs to /rest/api/3/issue with basic auth and returns key+id+url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: '10042', key: 'WEB-123' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createJiraClient(cfg)
    const out = await client.createIssue({
      summary: 'S',
      description: { type: 'doc', version: 1, content: [] },
      labels: ['x'],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://co.atlassian.net/rest/api/3/issue')
    expect(init.headers.authorization).toMatch(/^Basic /)
    expect(out).toEqual({
      id: '10042',
      key: 'WEB-123',
      url: 'https://co.atlassian.net/browse/WEB-123',
    })
  })

  it('maps a 401 to an IntegrationError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'no' }),
    )
    await expect(
      createJiraClient(cfg).createIssue({
        summary: 'S',
        description: { type: 'doc', version: 1, content: [] },
      }),
    ).rejects.toBeInstanceOf(IntegrationError)
  })

  it('maps a network throw to an IntegrationError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('econnrefused')))
    await expect(
      createJiraClient(cfg).createIssue({
        summary: 'S',
        description: { type: 'doc', version: 1, content: [] },
      }),
    ).rejects.toBeInstanceOf(IntegrationError)
  })
})
