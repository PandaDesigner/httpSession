import { HttpError } from './base'

export class CancelledError extends HttpError {
  constructor(message = 'Request was cancelled', options?: ErrorOptions) {
    super(message, 'CANCELLED', options)
  }
}
