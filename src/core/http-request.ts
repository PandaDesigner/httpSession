import type { TransferProgress } from "../progress/transfer-progress";
import { CancelledError, NetworkError } from "./errors";
import type { RequestCompletion } from "./request-completion";
import {
  CancelledState,
  IdleState,
  PendingState,
  type RequestSnapshot,
  type RequestState,
  type RequestStateName,
} from "./request-state";

/** The execution boundary consumed by the lifecycle layer. */
export type RequestExecutor<T> = () => Promise<RequestCompletion<T>>;

export type RequestSubscriber<T> = (snapshot: RequestSnapshot<T>) => void;

/**
 * Framework-independent request lifecycle controller.
 *
 * This class governs transitions and notifications only. Transport selection and
 * cancellation mechanics remain outside the State layer.
 */
export class HttpRequest<T> {
  #state: RequestState<T> = new IdleState<T>();
  #progress: TransferProgress | undefined;
  #inFlight: Promise<RequestCompletion<T>> | undefined;
  #resolveInFlight: ((completion: RequestCompletion<T>) => void) | undefined;
  #subscribers = new Set<RequestSubscriber<T>>();

  constructor(private readonly execute: RequestExecutor<T>) {}

  get state(): RequestStateName {
    return this.#state.name;
  }

  subscribe(subscriber: RequestSubscriber<T>): () => void {
    this.#subscribers.add(subscriber);
    this.#emit(subscriber, this.#snapshot());

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#subscribers.delete(subscriber);
    };
  }

  start(): Promise<RequestCompletion<T>> {
    if (this.#state instanceof PendingState) {
      const inFlight = this.#inFlight as Promise<RequestCompletion<T>> | undefined;
      if (inFlight === undefined) throw new Error('in-flight promise missing for pending state');
      return inFlight;
    }
    if (!(this.#state instanceof IdleState)) {
      const completion = this.#state.completion as RequestCompletion<T> | undefined;
      if (completion === undefined) throw new Error('completion missing for terminal state');
      return Promise.resolve(completion);
    }

    let settle!: (completion: RequestCompletion<T>) => void;
    const inFlight = new Promise<RequestCompletion<T>>(resolve => {
      settle = resolve;
    });
    this.#inFlight = inFlight;
    this.#resolveInFlight = settle;
    this.#transition(this.#state.start());

    if (!(this.#state instanceof PendingState)) return inFlight;

    Promise.resolve()
      .then(this.execute)
      .then(
        completion => {
          if (this.#state instanceof PendingState) {
            const nextState = this.#state.complete(completion);
            this.#transition(nextState);
            this.#settle(nextState.completion);
          }
        },
        error => {
          if (this.#state instanceof PendingState) {
            const nextState = this.#state.complete({
              status: "failure",
              error: new NetworkError("Request execution failed", { cause: error }),
            });
            this.#transition(nextState);
            this.#settle(nextState.completion);
          }
        },
      );

    return inFlight;
  }

  cancel(): void {
    if (!(this.#state instanceof PendingState)) return;

    const completion: RequestCompletion<T> = {
      status: "failure",
      error: new CancelledError(),
    };
    const nextState = this.#state.cancel(completion);
    this.#transition(nextState);
    this.#settle(nextState.completion);
  }

  /** Receives measurement data from future transport orchestration. */
  reportProgress(progress: TransferProgress): void {
    if (!(this.#state instanceof PendingState)) return;
    this.#progress = Object.freeze({ ...progress });
    this.#notify();
  }

  #settle(completion: RequestCompletion<T>): void {
    this.#resolveInFlight?.(completion);
    this.#resolveInFlight = undefined;
  }

  #transition(state: RequestState<T>): void {
    this.#state = state;
    if (!(state instanceof PendingState)) this.#progress = undefined;
    this.#notify();
  }

  #notify(): void {
    const snapshot = this.#snapshot();
    for (const subscriber of this.#subscribers) this.#emit(subscriber, snapshot);
  }

  #emit(subscriber: RequestSubscriber<T>, snapshot: RequestSnapshot<T>): void {
    try {
      subscriber(snapshot);
    } catch {
      // Subscribers are observers; their failures cannot alter request lifecycle state.
    }
  }

  #snapshot(): RequestSnapshot<T> {
    return this.#state.snapshot(this.#progress);
  }
}
