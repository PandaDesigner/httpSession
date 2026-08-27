import { describe, expect, it } from 'vitest'
import { type StatusPolicy, successfulStatusPolicy } from '../../src'

describe('successfulStatusPolicy', () => {
  it('accepts only 2xx by default', () => {
    expect(
      [100, 199, 200, 204, 299, 300, 400, 500].map((s) => successfulStatusPolicy.accepts(s)),
    ).toEqual([false, false, true, true, true, false, false, false])
  })
})

describe('StatusPolicy', () => {
  it('accepts a custom inclusive range', () => {
    const policy: StatusPolicy = { accepts: (s) => s >= 200 && s <= 204 }
    expect([199, 200, 204, 205].map((s) => policy.accepts(s))).toEqual([false, true, true, false])
  })

  it('accepts when given an exact status', () => {
    const policy: StatusPolicy = { accepts: (s) => s === 204 }
    expect([200, 204, 205].map((s) => policy.accepts(s))).toEqual([false, true, false])
  })

  it('rejects everything when configured to reject', () => {
    const policy: StatusPolicy = { accepts: () => false }
    expect([200, 204, 299, 404].map((s) => policy.accepts(s))).toEqual([false, false, false, false])
  })
})
