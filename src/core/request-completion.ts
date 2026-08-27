import type { HttpError } from "./errors";
import type { HttpResponseMetadata } from "./http-response-metadata";

/** The typed result of a request, making expected failures explicit. */
export type RequestCompletion<T> =
  | { readonly status: "success"; readonly data: T; readonly response: HttpResponseMetadata }
  | { readonly status: "failure"; readonly error: HttpError };
