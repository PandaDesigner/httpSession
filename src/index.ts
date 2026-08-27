export const HTTP_SESSION_VERSION = '0.1.0' as const

export type { HttpResponseMetadata } from './core/http-response-metadata'
export type { RequestCompletion } from './core/request-completion'
export {
  CancelledError,
  DecodeError,
  HttpError,
  HttpStatusError,
  InvalidRequestError,
  NetworkError,
  TimeoutError,
  UnsupportedCapabilityError,
} from './core/errors'
export type { HttpErrorCode } from './core/errors'

export { createHttpClient } from './core/http-client'
export type { HttpClient, HttpClientConfig } from './core/http-client'
export { HttpRequest } from './core/http-request'
export type { RequestExecutor, RequestSubscriber } from './core/http-request'
export type { RequestOptions } from './core/request-options'
export type { RequestSnapshot, RequestStateName } from './core/request-state'
export type { TransferProgress } from './progress/transfer-progress'
export { readWithProgress } from './progress/read-with-progress'

export { FetchStrategy } from './transport/fetch-strategy'
export { HttpTransport } from './transport/http-transport'
export {
  emptyTransportResponse,
  selectStrategy,
  strategySupports,
} from './transport/transport-strategy'
export type {
  TransportCapabilities,
  TransportContext,
  TransportProgressEvent,
  TransportRequest,
  TransportResponse,
  TransportStrategy,
} from './transport/transport-types'

export { decodeWithSchema } from './validation/zod-decoder'
export type { DecodeIssue } from './validation/zod-decoder'
export { successfulStatusPolicy } from './policies/status-policy'
export type { StatusPolicy } from './policies/status-policy'
