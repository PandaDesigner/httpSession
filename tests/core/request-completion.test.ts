import { describe, expect, it } from 'vitest'
import {
  CancelledError,
  DecodeError,
  HttpStatusError,
  InvalidRequestError,
  NetworkError,
  type RequestCompletion,
  TimeoutError,
  UnsupportedCapabilityError,
} from '../../src'

describe('RequestCompletion', () => {
  it('narrows successful data', () => {
    const completion: RequestCompletion<number> = {
      status: 'success',
      data: 42,
      response: { status: 200, statusText: 'OK', headers: new Headers() },
    }

    expect(completion.status === 'success' && completion.data).toBe(42)
  })

  it('preserves HTTP failure metadata', () => {
    const error = new HttpStatusError(404, 'Not Found', { message: 'missing' })
    expect(error.status).toBe(404)
    expect(error.body).toEqual({ message: 'missing' })
  })

  it('provides stable codes and preserves causes for every error', () => {
    const cause = new Error('root')
    const errors = [
      [new InvalidRequestError('bad', { cause }), 'INVALID_REQUEST'],
      [new NetworkError('offline', { cause }), 'NETWORK_ERROR'],
      [new TimeoutError('late', { cause }), 'TIMEOUT'],
      [new CancelledError('stopped', { cause }), 'CANCELLED'],
      [new HttpStatusError(500, 'Server Error', null, { cause }), 'HTTP_STATUS_ERROR'],
      [new DecodeError('invalid', { cause }), 'DECODE_ERROR'],
      [new UnsupportedCapabilityError('streaming', { cause }), 'UNSUPPORTED_CAPABILITY'],
    ] as const

    for (const [error, code] of errors) {
      expect(error).toBeInstanceOf(Error)
      expect(error.code).toBe(code)
      expect(error.cause).toBe(cause)
    }
  })
})
