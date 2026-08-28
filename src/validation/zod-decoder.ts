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

  const issues = flattenIssues(result.error.issues)

  const error = new DecodeError(`Response decoding failed: ${issues.length} issue(s)`, {
    cause: result.error,
  })
  ;(error as unknown as { issues: readonly DecodeIssue[] }).issues = issues

  return { status: 'failure', error }
}

function flattenIssues(rawIssues: readonly z.core.$ZodIssue[]): readonly DecodeIssue[] {
  const out: DecodeIssue[] = []
  for (const issue of rawIssues) {
    if (issue.code === 'invalid_union') {
      const branches = (issue as unknown as { errors?: readonly (readonly z.core.$ZodIssue[])[] })
        .errors
      if (Array.isArray(branches)) {
        for (const branch of branches) {
          if (Array.isArray(branch)) {
            for (const inner of flattenIssues(branch)) {
              out.push(inner)
            }
          }
        }
        continue
      }
    }
    out.push({
      path: issue.path as readonly PropertyKey[],
      code: issue.code,
      message: issue.message,
    })
  }
  return out
}

/**
 * Formats a `DecodeError` into a multi-line, log-friendly string. Each line
 * is shaped as `  - [<code>] <dot.path or '<root>'>: <message>`, mirroring
 * the normalized `issues` array that `decodeWithSchema` attaches to the
 * error. Returns `(no issues attached)` if the error carries no issues.
 *
 * Branch on `result.error.code === 'DECODE_ERROR'` first; this helper is
 * only useful when you have a `DecodeError` instance.
 *
 * @example
 * ```ts
 * if (result.error.code === 'DECODE_ERROR') {
 *   console.error('[api] schema rejected:\n' + formatDecodeError(result.error))
 * }
 * ```
 */
export function formatDecodeError(error: DecodeError): string {
  const issues = (error as unknown as { issues?: readonly DecodeIssue[] }).issues
  if (issues === undefined || issues.length === 0) {
    return '(no issues attached)'
  }
  return issues.map(formatIssue).join('\n')
}

function formatIssue(issue: DecodeIssue): string {
  const path = issue.path.length === 0 ? '<root>' : issue.path.map(String).join('.')
  return `  - [${issue.code}] ${path}: ${issue.message}`
}
