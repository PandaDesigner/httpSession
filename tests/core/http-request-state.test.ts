import { describe, expect, it, vi } from 'vitest'
import { HttpRequest, NetworkError } from '../../src'
import type { RequestCompletion } from '../../src/core/request-completion'

describe('HttpRequest lifecycle', () => {
  it('notifies idle, pending, and success snapshots', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'success',
      data: 7,
      response: { status: 200, statusText: 'OK', headers: new Headers() },
    })
    const request = new HttpRequest(execute)
    const states: string[] = []

    request.subscribe((snapshot) => states.push(snapshot.state))
    await request.start()

    expect(states).toEqual(['idle', 'pending', 'success'])
  })

  it('returns the same in-flight promise when started twice', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'failure',
      error: new NetworkError('failed'),
    })
    const request = new HttpRequest(execute)
    expect(request.start()).toBe(request.start())
  })

  it('settles cancellation as a cancelled failure snapshot', async () => {
    const request = new HttpRequest<number>(() => new Promise(() => {}))
    const snapshots: string[] = []
    request.subscribe((snapshot) => snapshots.push(snapshot.state))

    const completion = request.start()
    await Promise.resolve()
    request.cancel()

    await expect(completion).resolves.toMatchObject({
      status: 'failure',
      error: { code: 'CANCELLED' },
    })
    expect(snapshots).toEqual(['idle', 'pending', 'cancelled'])
  })

  it('settles when a pending notification cancels the request', async () => {
    const execute = vi.fn().mockResolvedValue({
      status: 'success' as const,
      data: 7,
      response: { status: 200, statusText: 'OK', headers: new Headers() },
    })
    const request = new HttpRequest(execute)
    request.subscribe((snapshot) => {
      if (snapshot.state === 'pending') request.cancel()
    })

    await expect(request.start()).resolves.toMatchObject({
      status: 'failure',
      error: { code: 'CANCELLED' },
    })
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps completion data immutable for every subscriber', async () => {
    const request = new HttpRequest(() =>
      Promise.resolve({
        status: 'success' as const,
        data: { user: { name: 'Ada' } },
        response: { status: 200, statusText: 'OK', headers: new Headers() },
      }),
    )
    let observedName: string | undefined
    let terminalSnapshot: object | undefined

    request.subscribe((snapshot) => {
      if (snapshot.state !== 'success') return
      const completion = snapshot.completion as Extract<
        RequestCompletion<{ user: { name: string } }>,
        { status: 'success' }
      >
      const data = completion.data
      data.user.name = 'Tampered'
    })
    request.subscribe((snapshot) => {
      if (snapshot.state !== 'success') return
      terminalSnapshot = snapshot
      const completion = snapshot.completion as Extract<
        RequestCompletion<{ user: { name: string } }>,
        { status: 'success' }
      >
      observedName = completion.data.user.name
    })

    await request.start()

    expect(observedName).toBe('Ada')
    expect(Object.isFrozen(terminalSnapshot)).toBe(true)
    expect(Object.isFrozen((terminalSnapshot as { completion: object }).completion)).toBe(true)
  })

  it('converts executor rejections into typed failure completions', async () => {
    const cause = new Error('socket closed')
    const request = new HttpRequest<number>(() => Promise.reject(cause))
    const states: string[] = []
    request.subscribe((snapshot) => states.push(snapshot.state))

    await expect(request.start()).resolves.toMatchObject({
      status: 'failure',
      error: { code: 'NETWORK_ERROR', cause },
    })
    expect(request.state).toBe('failure')
    expect(states).toEqual(['idle', 'pending', 'failure'])
  })

  it('isolates subscriber callback exceptions', async () => {
    const request = new HttpRequest(() =>
      Promise.resolve({
        status: 'success' as const,
        data: 7,
        response: { status: 200, statusText: 'OK', headers: new Headers() },
      }),
    )
    const states: string[] = []

    expect(() =>
      request.subscribe(() => {
        throw new Error('observer failed')
      }),
    ).not.toThrow()
    request.subscribe((snapshot) => states.push(snapshot.state))

    await expect(request.start()).resolves.toMatchObject({ status: 'success', data: 7 })
    expect(states).toEqual(['idle', 'pending', 'success'])
  })
})
