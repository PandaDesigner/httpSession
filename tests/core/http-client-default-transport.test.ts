import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createHttpClient } from '../../src'

describe('createHttpClient default transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a FetchStrategy by default when no transport is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createHttpClient({
      baseUrl: 'https://example.test',
    })

    const completion = await client
      .get('/users/1', { schema: z.object({ id: z.number() }) })
      .start()

    expect(completion.status).toBe('success')
    if (completion.status === 'success') {
      expect(completion.data).toEqual({ id: 1 })
    }
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/users/1',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
