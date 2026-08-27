import { describe, expect, it, vi } from 'vitest'
import {
  FetchStrategy,
  HttpTransport,
  type TransportCapabilities,
  type TransportContext,
  type TransportRequest,
  type TransportStrategy,
  UnsupportedCapabilityError,
} from '../../src'

function buildRequest(overrides: Partial<TransportRequest> = {}): TransportRequest {
  return {
    url: 'https://example.test/users/1',
    method: 'GET',
    headers: new Headers(),
    ...overrides,
  }
}

function buildContext(overrides: Partial<TransportContext> = {}): TransportContext {
  return {
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    ...overrides,
  }
}

describe('FetchStrategy', () => {
  it('maps a native Response into a transport response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"id":1}', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      }),
    )
    const strategy = new FetchStrategy(fetchMock)
    const response = await strategy.execute(buildRequest(), buildContext())

    expect(response.status).toBe(200)
    expect(response.statusText).toBe('OK')
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await new Response(response.body).text()).toBe('{"id":1}')
  })

  it('forwards method, headers, body, and signal to fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const strategy = new FetchStrategy(fetchMock)
    const headers = new Headers({ 'x-test': '1' })
    const controller = new AbortController()
    const body = JSON.stringify({ a: 1 })

    await strategy.execute(
      buildRequest({ method: 'POST', headers, body }),
      buildContext({ signal: controller.signal }),
    )

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/users/1',
      expect.objectContaining({
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      }),
    )
  })

  it('does not advertise upload progress (fetch cannot emit it portably)', () => {
    const strategy = new FetchStrategy(vi.fn())
    expect(strategy.capabilities.uploadProgress).toBe(false)
    expect(strategy.name).toBe('fetch')
  })

  it('wraps fetch rejections as rejected promise (transport layer does not translate errors)', async () => {
    const networkError = new TypeError('socket closed')
    const fetchMock = vi.fn().mockRejectedValue(networkError)
    const strategy = new FetchStrategy(fetchMock)

    await expect(strategy.execute(buildRequest(), buildContext())).rejects.toBe(networkError)
  })
})

describe('HttpTransport', () => {
  const fetchCapabilities: TransportCapabilities = { uploadProgress: false, streaming: true }
  const xhrCapabilities: TransportCapabilities = { uploadProgress: true, streaming: false }

  const defaultExecutor: TransportStrategy['execute'] = vi.fn().mockResolvedValue({
    status: 200,
    statusText: 'OK',
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.close()
      },
    }),
  })

  function buildStrategy(
    name: string,
    capabilities: TransportCapabilities,
    executor: TransportStrategy['execute'] = defaultExecutor,
  ): TransportStrategy {
    return { name, capabilities, execute: executor }
  }

  it('selects the first strategy whose capabilities satisfy the request', async () => {
    const fetchExec: TransportStrategy['execute'] = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: new ReadableStream({ start: (c) => c.close() }),
    })
    const fetchStrategy = buildStrategy('fetch', fetchCapabilities, fetchExec)
    const xhrStrategy = buildStrategy('xhr', xhrCapabilities)
    const transport = new HttpTransport([fetchStrategy, xhrStrategy])

    await transport.execute(
      buildRequest(),
      { uploadProgress: false, streaming: true },
      buildContext(),
    )
    expect(fetchExec).toHaveBeenCalledTimes(1)
  })

  it('picks a strategy that supports upload progress when requested', async () => {
    const fetchStrategy = buildStrategy('fetch', fetchCapabilities)
    const xhrExec: TransportStrategy['execute'] = vi.fn().mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      body: new ReadableStream({ start: (c) => c.close() }),
    })
    const xhrStrategy = buildStrategy('xhr', xhrCapabilities, xhrExec)
    const transport = new HttpTransport([fetchStrategy, xhrStrategy])

    await transport.execute(
      buildRequest(),
      { uploadProgress: true, streaming: false },
      buildContext(),
    )
    expect(xhrExec).toHaveBeenCalledTimes(1)
  })

  it('throws UnsupportedCapabilityError when no strategy supports the request', async () => {
    const fetchStrategy = buildStrategy('fetch', fetchCapabilities)
    const transport = new HttpTransport([fetchStrategy])

    await expect(
      transport.execute(buildRequest(), { uploadProgress: true, streaming: true }, buildContext()),
    ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
  })

  it('exposes the strategies it was constructed with', () => {
    const a = buildStrategy('a', fetchCapabilities)
    const b = buildStrategy('b', xhrCapabilities)
    const transport = new HttpTransport([a, b])
    expect(transport.strategies.map((s) => s.name)).toEqual(['a', 'b'])
  })
})
