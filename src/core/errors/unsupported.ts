import { HttpError } from './base'

export class UnsupportedCapabilityError extends HttpError {
  readonly capability: string

  constructor(capability: string, options?: ErrorOptions) {
    super(`Unsupported capability: ${capability}`, 'UNSUPPORTED_CAPABILITY', options)
    this.capability = capability
  }
}
