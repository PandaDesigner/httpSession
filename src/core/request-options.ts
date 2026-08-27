import type { z } from 'zod'
import type { StatusPolicy } from '../policies/status-policy'

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
}
