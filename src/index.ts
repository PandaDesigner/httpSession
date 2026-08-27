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

export { HttpRequest } from './core/http-request'
export type { RequestExecutor, RequestSubscriber } from './core/http-request'
export type { RequestSnapshot, RequestStateName } from './core/request-state'
export type { TransferProgress } from './progress/transfer-progress'

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
