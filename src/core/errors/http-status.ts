import { HttpError } from './base'

export class HttpStatusError extends HttpError {
  readonly status: number
  readonly statusText: string
  readonly body: unknown

  constructor(status: number, statusText: string, body: unknown, options?: ErrorOptions) {
    super(
      `HTTP request failed with status ${status}${statusText ? ` ${statusText}` : ''}`,
      'HTTP_STATUS_ERROR',
      options,
    )
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}
