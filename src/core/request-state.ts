import type { TransferProgress } from "../progress/transfer-progress";
import type { RequestCompletion } from "./request-completion";

/** The lifecycle phases of an HTTP request. */
export type RequestStateName = "idle" | "pending" | "success" | "failure" | "cancelled";

/**
 * An immutable observation of an HTTP request at a point in its lifecycle.
 * Progress is measurement data, not a lifecycle state.
 */
export interface RequestSnapshot<T> {
  readonly state: RequestStateName;
  readonly progress?: TransferProgress;
  readonly completion?: RequestCompletion<T>;
}

/** Internal lifecycle policy object. It owns state data, not execution strategy. */
export abstract class RequestState<T> {
  abstract readonly name: RequestStateName;
  abstract readonly completion?: RequestCompletion<T>;

  snapshot(progress?: TransferProgress): RequestSnapshot<T> {
    return Object.freeze({
      state: this.name,
      ...(progress === undefined ? {} : { progress: Object.freeze({ ...progress }) }),
      ...(this.completion === undefined ? {} : { completion: this.completion }),
    });
  }
}

export class IdleState<T> extends RequestState<T> {
  readonly name = "idle" as const;
  readonly completion = undefined;

  start(): PendingState<T> {
    return new PendingState<T>();
  }
}

export class PendingState<T> extends RequestState<T> {
  readonly name = "pending" as const;
  readonly completion = undefined;

  complete(completion: RequestCompletion<T>): SuccessState<T> | FailureState<T> {
    return completion.status === "success" ? new SuccessState(completion) : new FailureState(completion);
  }

  cancel(completion: Extract<RequestCompletion<T>, { status: "failure" }>): CancelledState<T> {
    return new CancelledState(completion);
  }
}

export class SuccessState<T> extends RequestState<T> {
  readonly name = "success" as const;

  constructor(readonly completion: Extract<RequestCompletion<T>, { status: "success" }>) {
    super();
  }
}

export class FailureState<T> extends RequestState<T> {
  readonly name = "failure" as const;

  constructor(readonly completion: Extract<RequestCompletion<T>, { status: "failure" }>) {
    super();
  }
}

export class CancelledState<T> extends RequestState<T> {
  readonly name = "cancelled" as const;

  constructor(readonly completion: Extract<RequestCompletion<T>, { status: "failure" }>) {
    super();
  }
}
