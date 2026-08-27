import type { TransferProgress } from "../progress/transfer-progress";
import { CancelledError } from "./errors";
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
    subscriber(this.#snapshot());

    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#subscribers.delete(subscriber);
    };
  }

  start(): Promise<RequestCompletion<T>> {
    if (this.#state instanceof PendingState) return this.#inFlight!;
    if (!(this.#state instanceof IdleState)) return Promise.resolve(this.#state.completion!);

    let settle!: (completion: RequestCompletion<T>) => void;
    let reject!: (error: unknown) => void;
    const inFlight = new Promise<RequestCompletion<T>>((resolve, rejectPromise) => {
      settle = resolve;
      reject = rejectPromise;
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
            this.#transition(this.#state.complete(completion));
            this.#settle(completion);
          }
        },
        error => {
          if (this.#state instanceof PendingState) {
            this.#resolveInFlight = undefined;
            reject(error);
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
    this.#transition(this.#state.cancel(completion));
    this.#settle(completion);
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
    for (const subscriber of this.#subscribers) subscriber(snapshot);
  }

  #snapshot(): RequestSnapshot<T> {
    return this.#state.snapshot(this.#progress);
  }
}
