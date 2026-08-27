import { HttpError } from './base'

export class TimeoutError extends HttpError {
  constructor(message = 'Request timed out', options?: ErrorOptions) {
    super(message, 'TIMEOUT', options)
  }
}
