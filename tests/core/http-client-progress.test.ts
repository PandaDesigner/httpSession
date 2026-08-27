import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { FetchStrategy, HttpTransport, createHttpClient } from '../../src'
import type { TransferProgress } from '../../src'

function jsonResponse(
  body: unknown,
  init: { status?: number; contentLength?: number } = {},
): Response {
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.contentLength !== undefined) headers['content-length'] = String(init.contentLength)
  return new Response(payload, {
    status: init.status ?? 200,
    statusText: 'OK',
    headers,
  })
}

describe('HttpClient download progress', () => {
  it('forwards cumulative progress with total and percentage to the per-request callback', async () => {
    const payload = JSON.stringify({ id: 1, name: 'Ada' })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }, { contentLength: payload.length }))
    const onProgress = vi.fn()
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client
      .get('/users/1', {
        schema: z.object({ id: z.number(), name: z.string() }),
        onProgress,
      })
      .start()

    expect(completion.status).toBe('success')
    expect(onProgress).toHaveBeenCalled()
    const lastEvent = onProgress.mock.calls.at(-1)?.[0] as TransferProgress
    expect(lastEvent.direction).toBe('download')
    expect(lastEvent.loaded).toBe(payload.length)
    expect(lastEvent.total).toBe(payload.length)
    expect(lastEvent.percentage).toBe(100)
  })

  it('reports percentage as undefined when Content-Length is missing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }))
    const onProgress = vi.fn()
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    await client.get('/users/1', { schema: z.object({ id: z.number() }), onProgress }).start()

    const lastEvent = onProgress.mock.calls.at(-1)?.[0] as TransferProgress
    expect(lastEvent.total).toBeUndefined()
    expect(lastEvent.percentage).toBeUndefined()
  })

  it('also surfaces progress through HttpRequest subscribers', async () => {
    const payload = JSON.stringify({ id: 1 })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 1 }, { contentLength: payload.length }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const snapshots: number[] = []
    const request = client.get('/users/1', { schema: z.object({ id: z.number() }) })
    request.subscribe((snapshot) => {
      if (snapshot.progress?.loaded !== undefined) snapshots.push(snapshot.progress.loaded)
    })
    await request.start()

    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots.at(-1)).toBe(payload.length)
  })
})
