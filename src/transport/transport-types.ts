/**
 * Platform-neutral transport contracts. Runtime-specific globals (fetch, XHR,
 * etc.) stay inside adapters; the rest of the package operates on these types.
 */

export interface TransportRequest {
  readonly url: string
  readonly method: string
  readonly headers: Headers
  readonly body?: BodyInit | null
  readonly timeoutMs?: number
}

export interface TransportResponse {
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: ReadableStream<Uint8Array>
}

export interface TransportProgressEvent {
  readonly loaded: number
  readonly total?: number
}

export interface TransportContext {
  readonly signal: AbortSignal
  readonly onProgress: (event: TransportProgressEvent) => void
}

/**
 * What a strategy can deliver. The transport selects a strategy whose
 * capabilities are a superset of the request's needs; if no strategy matches,
 * the transport throws UnsupportedCapabilityError.
 */
export interface TransportCapabilities {
  /** Strategy emits upload-progress events through `context.onProgress`. */
  readonly uploadProgress: boolean
  /** Strategy exposes the response body as a ReadableStream. */
  readonly streaming: boolean
}

export interface TransportStrategy {
  readonly name: string
  readonly capabilities: TransportCapabilities
  execute(request: TransportRequest, context: TransportContext): Promise<TransportResponse>
}

const EMPTY_STREAM = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close()
    },
  })

export function emptyTransportResponse(
  status = 0,
  statusText = '',
  headers: Headers = new Headers(),
): TransportResponse {
  return { status, statusText, headers, body: EMPTY_STREAM() }
}
