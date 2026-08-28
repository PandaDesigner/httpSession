import { HttpError } from './base'

export class BinaryBodyError extends HttpError {
  constructor(message = 'Response body looks binary or compressed', options?: ErrorOptions) {
    super(message, 'BINARY_BODY', options)
  }
}
