import type { z } from 'zod'
import { DecodeError } from '../core/errors'
import type { HttpResponseMetadata } from '../core/http-response-metadata'
import type { RequestCompletion } from '../core/request-completion'

export interface DecodeIssue {
  readonly path: readonly PropertyKey[]
  readonly code: string
  readonly message: string
}

/**
 * Validates `input` against `schema` at the public boundary. External data
 * starts as `unknown` and becomes trusted `T` only after a successful parse.
 *
 * `response` is the originating HTTP response metadata; it ships verbatim on
 * the success completion so the caller can correlate the typed payload with
 * the network response (status, headers).
 *
 * On failure the function returns a typed `RequestCompletion<T>` failure with
 * a `DecodeError` whose `cause` is the underlying `ZodError` and whose
 * `issues` field holds normalized `{ path, code, message }` entries.
 * Raw Zod instances do not leak through the public API surface beyond the
 * `cause` link.
 */
export function decodeWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
  response: HttpResponseMetadata,
): RequestCompletion<T> {
  const result = schema.safeParse(input)
  if (result.success) {
    return { status: 'success', data: result.data, response }
  }

  const issues: readonly DecodeIssue[] = result.error.issues.map((issue) => ({
    path: issue.path as readonly PropertyKey[],
    code: issue.code,
    message: issue.message,
  }))

  const error = new DecodeError(
    `Response decoding failed: ${result.error.issues.length} issue(s)`,
    { cause: result.error },
  )
  ;(error as unknown as { issues: readonly DecodeIssue[] }).issues = issues

  return { status: 'failure', error }
}
