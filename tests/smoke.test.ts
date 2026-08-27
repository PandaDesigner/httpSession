import { describe, expect, it } from 'vitest'
import { HTTP_SESSION_VERSION } from '../src/index'

describe('httpSession', () => {
  it('exposes its package version marker', () => {
    expect(HTTP_SESSION_VERSION).toBe('0.1.0')
  })
})
