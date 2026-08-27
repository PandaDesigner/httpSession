import { HttpError } from './base'

export class NetworkError extends HttpError {
  constructor(message = 'Network request failed', options?: ErrorOptions) {
    super(message, 'NETWORK_ERROR', options)
  }
}
