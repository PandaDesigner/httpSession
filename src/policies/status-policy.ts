/**
 * A `StatusPolicy` decides whether a given HTTP status code is "successful"
 * for a request. The default `successfulStatusPolicy` accepts `200...299`.
 * Callers inject custom policies through `HttpClient` options.
 */
export interface StatusPolicy {
  accepts(status: number): boolean
}

/** Default semantic policy: 2xx responses are accepted. */
export const successfulStatusPolicy: StatusPolicy = {
  accepts: (status: number) => status >= 200 && status <= 299,
}
