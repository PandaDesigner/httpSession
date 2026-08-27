import { expect, test } from 'bun:test'
import { z } from 'zod'
import {
  FetchStrategy,
  HTTP_SESSION_VERSION,
  HttpRequest,
  HttpTransport,
  createHttpClient,
} from '../../src'

test('HttpSession version marker loads under Bun', () => {
  expect(HTTP_SESSION_VERSION).toBe('0.1.0')
})

test('HttpClient returns a typed RequestCompletion through Bun with an injected fetch', async () => {
  const fetchMock = (() =>
    Promise.resolve(
      new Response('{"id":1,"name":"Ada"}', {
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
      }),
    )) as typeof fetch

  const client = createHttpClient({
    baseUrl: 'https://example.test',
    transport: new HttpTransport([new FetchStrategy(fetchMock)]),
  })

  const request = client.get('/users/1', {
    schema: z.object({ id: z.number(), name: z.string() }),
  })

  // Lifecycle subscriptions are observable from the Bun runtime as well.
  const states: string[] = []
  request.subscribe((snapshot) => states.push(snapshot.state))

  const completion = await request.start()

  expect(states).toContain('pending')
  expect(completion.status).toBe('success')
  if (completion.status === 'success') {
    expect(completion.data).toEqual({ id: 1, name: 'Ada' })
    expect(completion.response.status).toBe(200)
  }
})

test('HttpClient maps a 5xx response to HttpStatusError under Bun', async () => {
  const fetchMock = (() => Promise.resolve(new Response('boom', { status: 500 }))) as typeof fetch
  const client = createHttpClient({
    baseUrl: 'https://example.test',
    transport: new HttpTransport([new FetchStrategy(fetchMock)]),
  })

  const completion: unknown = await client.get('/users/1', { schema: z.unknown() }).start()

  expect(completion).toMatchObject({ status: 'failure' })
})

test('HttpRequest exposes state name through Bun', () => {
  const request = new HttpRequest<number>(async () => ({
    status: 'success',
    data: 0,
    response: { status: 200, statusText: 'OK', headers: new Headers() },
  }))
  expect(request.state).toBe('idle')
})
