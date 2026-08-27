import { HttpError } from './base'

export class DecodeError extends HttpError {
  constructor(message = 'Response decoding failed', options?: ErrorOptions) {
    super(message, 'DECODE_ERROR', options)
  }
}
