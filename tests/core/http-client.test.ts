import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  BinaryBodyError,
  CancelledError,
  FetchStrategy,
  HttpStatusError,
  HttpTransport,
  NetworkError,
  TimeoutError,
  createHttpClient,
} from '../../src'

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('HttpClient.get', () => {
  it('resolves the URL against baseUrl, sends the request, and decodes through the schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1, name: 'Ada' }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client
      .get('/users/1', { schema: z.object({ id: z.number(), name: z.string() }) })
      .start()

    expect(completion.status).toBe('success')
    if (completion.status === 'success') {
      expect(completion.data).toEqual({ id: 1, name: 'Ada' })
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/users/1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('returns HttpStatusError when the response status is not accepted by the policy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client.get('/users/1', { schema: z.unknown() }).start()

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error).toBeInstanceOf(HttpStatusError)
      expect(completion.error.code).toBe('HTTP_STATUS_ERROR')
    }
  })

  it('honors a custom per-request status policy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 418 }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client
      .get('/teapot', {
        schema: z.unknown(),
        statusPolicy: { accepts: (status) => status === 418 },
      })
      .start()

    expect(completion.status).toBe('success')
  })

  it('returns DecodeError when the schema rejects the response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'not-a-number' }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client
      .get('/users/1', { schema: z.object({ id: z.number() }) })
      .start()

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error.code).toBe('DECODE_ERROR')
    }
  })

  it('returns BinaryBodyError when the response body starts with the zstd magic', async () => {
    // 0x28 0xb5 0x2f 0xfd is the zstd frame magic (RFC 8478).
    const zstdPayload = new Uint8Array([
      0x28, 0xb5, 0x2f, 0xfd, 0x04, 0x58, 0x4d, 0x4c, 0x20, 0xb1, 0x63, 0x00, 0x00, 0x00, 0x00,
      0x00,
    ])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(zstdPayload, {
        status: 200,
        statusText: 'OK',
        // No Content-Encoding — emulates a dev proxy that forgot to forward it.
        headers: { 'content-type': 'application/json' },
      }),
    )
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client.get('/users/1', { schema: z.unknown() }).start()

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error).toBeInstanceOf(BinaryBodyError)
      expect(completion.error.code).toBe('BINARY_BODY')
      expect(completion.error.message).toMatch(/Content-Encoding/)
    }
  })

  it('still surfaces a regular DecodeError when the body is text but not JSON', async () => {
    // HTML error page that JSON.parse rejects — but no binary indicators.
    // parseAsJson must fall through and let the schema decide.
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<!doctype html><html>oops</html>', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/html' },
      }),
    )
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client
      .get('/users/1', { schema: z.object({ id: z.number() }) })
      .start()

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error.code).toBe('DECODE_ERROR')
    }
  })

  it('returns NetworkError when fetch rejects with a non-abort error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('socket closed'))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const completion = await client.get('/users/1', { schema: z.unknown() }).start()

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error).toBeInstanceOf(NetworkError)
      expect(completion.error.code).toBe('NETWORK_ERROR')
      expect((completion.error.cause as TypeError).message).toBe('socket closed')
    }
  })

  it('maps explicit cancel() to a CancelledError completion', async () => {
    let resolveFetch: (response: Response) => void = () => {}
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    const request = client.get('/users/1', { schema: z.unknown() })
    const completionPromise = request.start()
    request.cancel()
    resolveFetch(jsonResponse({ id: 1 }))

    const completion = await completionPromise

    expect(completion.status).toBe('failure')
    if (completion.status === 'failure') {
      expect(completion.error).toBeInstanceOf(CancelledError)
      expect(completion.error.code).toBe('CANCELLED')
    }
  })

  it('returns TimeoutError when the deadline expires', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }),
      )
      const client = createHttpClient({
        baseUrl: 'https://example.test',
        timeoutMs: 10,
        transport: new HttpTransport([new FetchStrategy(fetchMock)]),
      })

      const completionPromise = client.get('/slow', { schema: z.unknown() }).start()
      await vi.advanceTimersByTimeAsync(20)
      const completion = await completionPromise

      expect(completion.status).toBe('failure')
      if (completion.status === 'failure') {
        expect(completion.error).toBeInstanceOf(TimeoutError)
        expect(completion.error.code).toBe('TIMEOUT')
      }
    } finally {
      vi.useRealTimers()
    }
  })

  it('merges default headers with per-request headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 1 }))
    const client = createHttpClient({
      baseUrl: 'https://example.test',
      defaultHeaders: { 'x-tenant': 'acme' },
      transport: new HttpTransport([new FetchStrategy(fetchMock)]),
    })

    await client
      .get('/users/1', {
        schema: z.object({ id: z.number() }),
        headers: { authorization: 'Bearer t' },
      })
      .start()

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('x-tenant')).toBe('acme')
    expect(headers.get('authorization')).toBe('Bearer t')
  })
})
