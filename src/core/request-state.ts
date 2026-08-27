import type { TransferProgress } from '../progress/transfer-progress'
import type { RequestCompletion } from './request-completion'

/** The lifecycle phases of an HTTP request. */
export type RequestStateName = 'idle' | 'pending' | 'success' | 'failure' | 'cancelled'

/**
 * An immutable observation of an HTTP request at a point in its lifecycle.
 * Progress is measurement data, not a lifecycle state.
 */
export interface RequestSnapshot<T> {
  readonly state: RequestStateName
  readonly progress?: TransferProgress
  readonly completion?: RequestCompletion<T>
}

/** Internal lifecycle policy object. It owns state data, not execution strategy. */
export abstract class RequestState<T> {
  abstract readonly name: RequestStateName
  abstract readonly completion?: RequestCompletion<T>

  snapshot(progress?: TransferProgress): RequestSnapshot<T> {
    return Object.freeze({
      state: this.name,
      ...(progress === undefined ? {} : { progress: Object.freeze({ ...progress }) }),
      ...(this.completion === undefined ? {} : { completion: this.completion }),
    })
  }
}

export class IdleState<T> extends RequestState<T> {
  readonly name = 'idle' as const
  readonly completion = undefined

  start(): PendingState<T> {
    return new PendingState<T>()
  }
}

export class PendingState<T> extends RequestState<T> {
  readonly name = 'pending' as const
  readonly completion = undefined

  complete(completion: RequestCompletion<T>): SuccessState<T> | FailureState<T> {
    return completion.status === 'success'
      ? new SuccessState(completion)
      : new FailureState(completion)
  }

  cancel(completion: Extract<RequestCompletion<T>, { status: 'failure' }>): CancelledState<T> {
    return new CancelledState(completion)
  }
}

export class SuccessState<T> extends RequestState<T> {
  readonly name = 'success' as const
  readonly completion: Extract<RequestCompletion<T>, { status: 'success' }>

  constructor(completion: Extract<RequestCompletion<T>, { status: 'success' }>) {
    super()
    this.completion = immutableCompletion(completion)
  }
}

export class FailureState<T> extends RequestState<T> {
  readonly name = 'failure' as const
  readonly completion: Extract<RequestCompletion<T>, { status: 'failure' }>

  constructor(completion: Extract<RequestCompletion<T>, { status: 'failure' }>) {
    super()
    this.completion = immutableCompletion(completion)
  }
}

export class CancelledState<T> extends RequestState<T> {
  readonly name = 'cancelled' as const
  readonly completion: Extract<RequestCompletion<T>, { status: 'failure' }>

  constructor(completion: Extract<RequestCompletion<T>, { status: 'failure' }>) {
    super()
    this.completion = immutableCompletion(completion)
  }
}

function immutableCompletion<T>(
  completion: Extract<RequestCompletion<T>, { status: 'success' }>,
): Extract<RequestCompletion<T>, { status: 'success' }>
function immutableCompletion<T>(
  completion: Extract<RequestCompletion<T>, { status: 'failure' }>,
): Extract<RequestCompletion<T>, { status: 'failure' }>
function immutableCompletion<T>(completion: RequestCompletion<T>): RequestCompletion<T> {
  if (completion.status === 'failure') {
    // Preserve Error identity, stack, and cause; freezing Error instances can break consumers.
    return Object.freeze({ status: 'failure' as const, error: completion.error })
  }

  return Object.freeze({
    status: 'success' as const,
    data: cloneAndFreeze(completion.data),
    response: Object.freeze({
      status: completion.response.status,
      statusText: completion.response.statusText,
      headers: immutableHeaders(completion.response.headers),
    }),
  })
}

function cloneAndFreeze<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Error) return value
  if (value instanceof Headers) return immutableHeaders(value) as T

  const existing = seen.get(value)
  if (existing !== undefined) return existing as T

  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (const item of value) copy.push(cloneAndFreeze(item, seen))
    return Object.freeze(copy) as T
  }

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value

  const copy: Record<PropertyKey, unknown> = Object.create(prototype) as Record<
    PropertyKey,
    unknown
  >
  seen.set(value, copy)
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor?.enumerable) copy[key] = cloneAndFreeze(value[key as keyof T], seen)
  }
  return Object.freeze(copy) as T
}

function immutableHeaders(headers: Headers): Headers {
  const copy = new Headers(headers)
  const mutations = new Set(['append', 'delete', 'set'])

  return Object.freeze(
    new Proxy(copy, {
      get(target, property) {
        if (typeof property === 'string' && mutations.has(property)) {
          return () => {
            throw new TypeError('Request snapshot headers are immutable')
          }
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
      set() {
        throw new TypeError('Request snapshot headers are immutable')
      },
      defineProperty() {
        throw new TypeError('Request snapshot headers are immutable')
      },
      deleteProperty() {
        throw new TypeError('Request snapshot headers are immutable')
      },
    }),
  ) as Headers
}
