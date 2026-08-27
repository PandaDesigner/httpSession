import type { z } from 'zod'
import type { StatusPolicy } from '../policies/status-policy'
import type { TransferProgress } from '../progress/transfer-progress'

/**
 * Per-request overrides for `HttpClient` calls. The schema is the only
 * required field; everything else inherits from `HttpClientConfig`.
 */
export interface RequestOptions<T> {
  readonly schema: z.ZodType<T>
  readonly statusPolicy?: StatusPolicy
  readonly headers?: HeadersInit
  readonly timeoutMs?: number
  readonly method?: string
  readonly body?: BodyInit | null
  /**
   * Optional download-progress callback. Fired after every body chunk with
   * cumulative `loaded`, the optional `total` from `Content-Length`, and the
   * computed `percentage` when the total is known.
   */
  readonly onProgress?: (progress: TransferProgress) => void
}
