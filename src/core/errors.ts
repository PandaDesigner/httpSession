export type HttpErrorCode =
  | 'INVALID_REQUEST'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'HTTP_STATUS_ERROR'
  | 'DECODE_ERROR'
  | 'UNSUPPORTED_CAPABILITY'

/** Base class for all expected request failures. */
export class HttpError extends Error {
  readonly code: HttpErrorCode

  constructor(message: string, code: HttpErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
    this.code = code
  }
}

export class InvalidRequestError extends HttpError {
  constructor(message = 'Invalid request', options?: ErrorOptions) {
    super(message, 'INVALID_REQUEST', options)
  }
}

export class NetworkError extends HttpError {
  constructor(message = 'Network request failed', options?: ErrorOptions) {
    super(message, 'NETWORK_ERROR', options)
  }
}

export class TimeoutError extends HttpError {
  constructor(message = 'Request timed out', options?: ErrorOptions) {
    super(message, 'TIMEOUT', options)
  }
}

export class CancelledError extends HttpError {
  constructor(message = 'Request was cancelled', options?: ErrorOptions) {
    super(message, 'CANCELLED', options)
  }
}

export class HttpStatusError extends HttpError {
  readonly status: number
  readonly statusText: string
  readonly body: unknown

  constructor(status: number, statusText: string, body: unknown, options?: ErrorOptions) {
    super(
      `HTTP request failed with status ${status}${statusText ? ` ${statusText}` : ''}`,
      'HTTP_STATUS_ERROR',
      options,
    )
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

export class DecodeError extends HttpError {
  constructor(message = 'Response decoding failed', options?: ErrorOptions) {
    super(message, 'DECODE_ERROR', options)
  }
}

export class UnsupportedCapabilityError extends HttpError {
  readonly capability: string

  constructor(capability: string, options?: ErrorOptions) {
    super(`Unsupported capability: ${capability}`, 'UNSUPPORTED_CAPABILITY', options)
    this.capability = capability
  }
}
