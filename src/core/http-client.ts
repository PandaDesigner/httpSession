import type { StatusPolicy } from '../policies/status-policy'
import { successfulStatusPolicy } from '../policies/status-policy'
import { readWithProgress } from '../progress/read-with-progress'
import { FetchStrategy } from '../transport/fetch-strategy'
import { HttpTransport } from '../transport/http-transport'
import type {
  TransportCapabilities,
  TransportContext,
  TransportProgressEvent,
  TransportRequest,
  TransportResponse,
} from '../transport/transport-types'
import { decodeWithSchema } from '../validation/zod-decoder'
import {
  BinaryBodyError,
  CancelledError,
  HttpStatusError,
  NetworkError,
  TimeoutError,
} from './errors'
import { HttpRequest } from './http-request'
import type { RequestCompletion } from './request-completion'
import type { RequestOptions } from './request-options'

/**
 * Construction-time configuration for an HttpClient. The transport defaults to
 * a single FetchStrategy backed by `globalThis.fetch`; inject one explicitly
 * to swap in mocks, polyfills, or alternative strategies.
 */
export interface HttpClientConfig {
  readonly baseUrl: string
  readonly transport?: HttpTransport
  readonly defaultHeaders?: HeadersInit
  readonly defaultStatusPolicy?: StatusPolicy
  readonly timeoutMs?: number
}

/**
 * The user-facing API for issuing typed, validated HTTP requests.
 */
export interface HttpClient {
  get<T>(path: string, options: RequestOptions<T>): HttpRequest<T>
}

/**
 * Builds an {@link HttpClient} bound to a single base URL and transport.
 *
 * Each `get(...)` call returns a fresh {@link HttpRequest}; cancellation,
 * timeouts, and lifecycle subscriptions are isolated per request.
 */
export function createHttpClient(config: HttpClientConfig): HttpClient {
  const transport = config.transport ?? new HttpTransport([new FetchStrategy()])
  const defaultStatusPolicy: StatusPolicy = config.defaultStatusPolicy ?? successfulStatusPolicy
  const defaultTimeoutMs = config.timeoutMs
  const defaultHeaders = mergeHeaders(undefined, config.defaultHeaders)

  return {
    get<T>(path: string, options: RequestOptions<T>): HttpRequest<T> {
      const statusPolicy = options.statusPolicy ?? defaultStatusPolicy
      const timeoutMs = options.timeoutMs ?? defaultTimeoutMs
      const mergedHeaders = mergeHeaders(defaultHeaders, options.headers)
      const url = buildUrl(config.baseUrl, path)
      const transportRequest = buildTransportRequest(
        url,
        options.method ?? 'GET',
        mergedHeaders,
        options.body,
      )
      const capabilities: TransportCapabilities = {
        uploadProgress: false,
        streaming: false,
      }

      const controller = new AbortController()
      let userCancelled = false
      const requestRef: { current: HttpRequest<T> | undefined } = { current: undefined }

      const executor = async (): Promise<RequestCompletion<T>> => {
        const timeoutHandle = scheduleTimeout(timeoutMs, controller, () => userCancelled)

        const context: TransportContext = {
          signal: controller.signal,
          onProgress: noop,
        }

        let response: TransportResponse
        try {
          response = await transport.execute(transportRequest, capabilities, context)
        } catch (error) {
          clearTimeoutHandle(timeoutHandle)
          return mapTransportError(error, controller.signal, userCancelled, timeoutMs !== undefined)
        }
        clearTimeoutHandle(timeoutHandle)

        if (!statusPolicy.accepts(response.status)) {
          const body = await readBodyAsString(response.body)
          return {
            status: 'failure',
            error: new HttpStatusError(response.status, response.statusText, body),
          }
        }

        const expectedTotal = readContentLength(response.headers)
        const userProgress = options.onProgress
        const bytes = await readWithProgress(response.body, expectedTotal, (progress) => {
          if (userProgress !== undefined) userProgress(progress)
          // Forward to lifecycle subscribers; reportProgress is a no-op once
          // the request has reached a terminal state.
          requestRef.current?.reportProgress(progress)
        })
        const text = new TextDecoder().decode(bytes)
        const parsed = parseAsJson(text)
        if (parsed.kind === 'binary') {
          return parsed.completion
        }
        return decodeWithSchema(options.schema, parsed.value, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      const request = new HttpRequest<T>(executor)
      requestRef.current = request
      // Wire cancellation through the abort signal: the executor observes the
      // abort, but the user-facing completion is owned by HttpRequest.cancel().
      const originalCancel = request.cancel.bind(request)
      ;(request as { cancel(): void }).cancel = () => {
        userCancelled = true
        if (!controller.signal.aborted) controller.abort()
        originalCancel()
      }

      return request
    },
  }
}

function noop(_event: TransportProgressEvent): void {
  /* default progress callback */
}

function buildUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString()
}

function buildTransportRequest(
  url: string,
  method: string,
  headers: Headers,
  body: BodyInit | null | undefined,
): TransportRequest {
  return {
    url,
    method,
    headers,
    ...(body === undefined ? {} : { body }),
  }
}

function mergeHeaders(base: Headers | undefined, extra: HeadersInit | undefined): Headers {
  const merged = new Headers(base)
  if (extra === undefined) return merged
  const incoming = new Headers(extra)
  for (const [name, value] of incoming) merged.set(name, value)
  return merged
}

function scheduleTimeout(
  timeoutMs: number | undefined,
  controller: AbortController,
  isUserCancelled: () => boolean,
): ReturnType<typeof setTimeout> | undefined {
  if (timeoutMs === undefined) return undefined
  return setTimeout(() => {
    if (isUserCancelled()) return
    controller.abort()
  }, timeoutMs)
}

function clearTimeoutHandle(handle: ReturnType<typeof setTimeout> | undefined): void {
  if (handle !== undefined) clearTimeout(handle)
}

function mapTransportError(
  error: unknown,
  signal: AbortSignal,
  userCancelled: boolean,
  hasTimeout: boolean,
): RequestCompletion<never> {
  if (userCancelled) {
    return { status: 'failure', error: new CancelledError() }
  }
  if (signal.aborted && hasTimeout) {
    return {
      status: 'failure',
      error: new TimeoutError('Request timed out before completion'),
    }
  }
  return {
    status: 'failure',
    error: new NetworkError('Network request failed', { cause: error }),
  }
}

function readContentLength(headers: Headers): number | undefined {
  const raw = headers.get('content-length')
  if (raw === null) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (Number.isNaN(parsed) || parsed <= 0) return undefined
  return parsed
}

async function readBodyAsString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
    }
    buffer += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  return buffer
}

type ParseAsJsonResult =
  | { readonly kind: 'parsed'; readonly value: unknown }
  | { readonly kind: 'binary'; readonly completion: RequestCompletion<never> }

function parseAsJson(raw: string): ParseAsJsonResult {
  if (raw === '') return { kind: 'parsed', value: undefined }
  try {
    return { kind: 'parsed', value: JSON.parse(raw) }
  } catch {
    if (looksBinary(raw)) {
      const bytes = new TextEncoder().encode(raw.slice(0, 32))
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
      return {
        kind: 'binary',
        completion: {
          status: 'failure',
          error: new BinaryBodyError(
            `Response body looks binary or compressed (${raw.length} bytes). Likely cause: a dev proxy stripped the Content-Encoding header. First bytes: ${hex}`,
          ),
        },
      }
    }
    // Surface the raw text so the schema's own validator produces a typed
    // DecodeError rather than the client deciding the body was invalid JSON.
    return { kind: 'parsed', value: raw }
  }
}

/**
 * Heuristic detector for compressed/binary response bodies. Operates on the
 * already-TextDecoder-decoded string: control characters are checked on
 * JavaScript char codes (UTF-16 code units), while compression magics are
 * checked against UTF-8 bytes (since the magic numbers are byte sequences
 * defined in their respective RFCs).
 */
function looksBinary(raw: string): boolean {
  const sample = raw.slice(0, 256)
  const bytes = new TextEncoder().encode(sample)

  // Known compression magics (UTF-8 bytes).
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) return true
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x28 &&
    bytes[1] === 0xb5 &&
    bytes[2] === 0x2f &&
    bytes[3] === 0xfd
  ) {
    return true
  }

  // Char-code scan for control bytes and the non-printable ratio. Counts the
  // ratio against `sample.length` (JS chars) so legitimate non-ASCII text
  // (e.g. accented Latin) doesn't trip the threshold just because of UTF-8
  // multi-byte expansion.
  let nonPrintable = 0
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i)
    if (code === 0x00) return true
    if (code === 0x7f) return true
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) return true
    if (code < 0x20 || code > 0x7e) nonPrintable++
  }
  if (sample.length > 0 && nonPrintable / sample.length > 0.3) return true

  return false
}
