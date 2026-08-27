/** Metadata retained from an HTTP response without owning its body. */
export interface HttpResponseMetadata {
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
}
