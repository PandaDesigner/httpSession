import type { TransportStrategy } from './transport-strategy'
import type {
  TransportCapabilities,
  TransportContext,
  TransportRequest,
  TransportResponse,
} from './transport-types'

/**
 * Default strategy: delegates to the platform `fetch` API.
 *
 * `fetch` is injected through the constructor so tests can substitute a mock
 * and so cross-runtime capability detection (e.g. React Native polyfills) can
 * supply a different implementation when needed.
 */
export class FetchStrategy implements TransportStrategy {
  readonly name = 'fetch'
  readonly capabilities: TransportCapabilities = {
    // fetch has no portable upload-progress event in browsers, Node, Bun, or RN.
    uploadProgress: false,
    // fetch exposes the response body as a ReadableStream on every supported runtime.
    streaming: true,
  }

  constructor(
    private readonly fetchImpl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response> = (input, init) => globalThis.fetch(input, init),
  ) {}

  async execute(request: TransportRequest, context: TransportContext): Promise<TransportResponse> {
    const response = await this.fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.body === undefined ? {} : { body: request.body }),
      signal: context.signal,
    })

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      body: response.body ?? new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
    }
  }
}
