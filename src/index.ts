export const HTTP_SESSION_VERSION = "0.1.0" as const;

export type { HttpResponseMetadata } from "./core/http-response-metadata";
export type { RequestCompletion } from "./core/request-completion";
export {
  CancelledError,
  DecodeError,
  HttpError,
  HttpStatusError,
  InvalidRequestError,
  NetworkError,
  TimeoutError,
  UnsupportedCapabilityError,
} from "./core/errors";
export type { HttpErrorCode } from "./core/errors";
