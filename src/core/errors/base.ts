import type { HttpErrorCode } from './codes'

/** Base class for all expected request failures. */
export class HttpError extends Error {
  readonly code: HttpErrorCode

  constructor(message: string, code: HttpErrorCode, options?: ErrorOptions) {
    super(message, options)
    this.name = new.target.name
    this.code = code
  }
}
