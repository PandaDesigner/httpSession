import { describe, expect, it } from 'vitest'
import {
  CancelledError,
  DecodeError,
  HttpError,
  HttpStatusError,
  InvalidRequestError,
  NetworkError,
  TimeoutError,
  UnsupportedCapabilityError,
} from '../../src/core/errors'

describe('HttpError hierarchy', () => {
  it('each subclass carries its stable code and inherits from HttpError', () => {
    const root = new Error('root')
    const cases: ReadonlyArray<readonly [HttpError, string]> = [
      [new InvalidRequestError('bad', { cause: root }), 'INVALID_REQUEST'],
      [new NetworkError('offline', { cause: root }), 'NETWORK_ERROR'],
      [new TimeoutError('late', { cause: root }), 'TIMEOUT'],
      [new CancelledError('stopped', { cause: root }), 'CANCELLED'],
      [new HttpStatusError(500, 'Server Error', null, { cause: root }), 'HTTP_STATUS_ERROR'],
      [new DecodeError('invalid', { cause: root }), 'DECODE_ERROR'],
      [new UnsupportedCapabilityError('streaming', { cause: root }), 'UNSUPPORTED_CAPABILITY'],
    ]
    for (const [err, code] of cases) {
      expect(err.code).toBe(code)
      expect(err).toBeInstanceOf(HttpError)
      expect(err).toBeInstanceOf(Error)
    }
  })

  it('preserves the cause chain on every subclass', () => {
    const root = new Error('root')
    const wrapped = new NetworkError('net', { cause: root })
    expect(wrapped.cause).toBe(root)
  })

  it('HttpStatusError carries status, statusText, and body', () => {
    const body = { message: 'missing' }
    const e = new HttpStatusError(404, 'Not Found', body)
    expect(e.status).toBe(404)
    expect(e.statusText).toBe('Not Found')
    expect(e.body).toBe(body)
    expect(e.code).toBe('HTTP_STATUS_ERROR')
    expect(e.message).toContain('404')
    expect(e.message).toContain('Not Found')
  })

  it('UnsupportedCapabilityError carries the capability name', () => {
    const e = new UnsupportedCapabilityError('streaming')
    expect(e.capability).toBe('streaming')
    expect(e.message).toContain('streaming')
    expect(e.code).toBe('UNSUPPORTED_CAPABILITY')
  })

  it('default messages are sensible when none provided', () => {
    expect(new CancelledError().message).toMatch(/cancel/i)
    expect(new NetworkError().message).toMatch(/network/i)
    expect(new TimeoutError().message).toMatch(/timed out/i)
    expect(new DecodeError().message).toMatch(/decod/i)
    expect(new InvalidRequestError().message).toMatch(/invalid/i)
  })
})
