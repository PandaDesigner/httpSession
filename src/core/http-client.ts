import type { StatusPolicy } from '../policies/status-policy'
import { successfulStatusPolicy } from '../policies/status-policy'
import type { HttpTransport } from '../transport/http-transport'
import type {
  TransportCapabilities,
  TransportContext,
  TransportRequest,
  TransportResponse,
} from '../transport/transport-types'
import { decodeWithSchema } from '../validation/zod-decoder'
import { CancelledError, HttpStatusError, NetworkError, TimeoutError } from './errors'
import { HttpRequest } from './http-request'
import type { RequestCompletion } from './request-completion'
import type { RequestOptions } from './request-options'

/**
 * Construction-time configuration for an HttpClient. The transport is required;
 * everything else has a sensible default. Per-request overrides flow through
 * {@link RequestOptions} when calling `client.get(...)`.
 */
export interface HttpClientConfig {
  readonly baseUrl: string
  readonly transport: HttpTransport
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

      const executor = async (): Promise<RequestCompletion<T>> => {
        const timeoutHandle = scheduleTimeout(timeoutMs, controller, () => userCancelled)

        const context: TransportContext = {
          signal: controller.signal,
          onProgress: noop,
        }

        let response: TransportResponse
        try {
          response = await config.transport.execute(transportRequest, capabilities, context)
        } catch (error) {
          clearTimeoutHandle(timeoutHandle)
          return mapTransportError(error, controller.signal, userCancelled, timeoutMs !== undefined)
        }
        clearTimeoutHandle(timeoutHandle)

        if (!statusPolicy.accepts(response.status)) {
          const body = await safeReadBody(response.body)
          return {
            status: 'failure',
            error: new HttpStatusError(response.status, response.statusText, body),
          }
        }

        const raw = await safeReadBody(response.body)
        const parsed = parseAsJson(raw)
        return decodeWithSchema(options.schema, parsed, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        })
      }

      const request = new HttpRequest<T>(executor)
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

function noop(): void {
  /* progress callback default */
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

async function safeReadBody(stream: ReadableStream<Uint8Array>): Promise<string> {
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

function parseAsJson(raw: string): unknown {
  if (raw === '') return undefined
  try {
    return JSON.parse(raw)
  } catch {
    // Surface the raw text so the schema's own validator produces a typed
    // DecodeError rather than the client deciding the body was invalid JSON.
    return raw
  }
}
