import { HttpError } from './base'

export class InvalidRequestError extends HttpError {
  constructor(message = 'Invalid request', options?: ErrorOptions) {
    super(message, 'INVALID_REQUEST', options)
  }
}
