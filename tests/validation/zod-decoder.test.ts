import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type DecodeIssue, type HttpResponseMetadata, decodeWithSchema } from '../../src'

const okResponse: HttpResponseMetadata = {
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
}

describe('decodeWithSchema', () => {
  const schema = z.object({ id: z.number().int().positive(), name: z.string() })

  it('accepts valid unknown data and preserves the response metadata', () => {
    const result = decodeWithSchema(schema, { id: 1, name: 'Ada' }, okResponse)
    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.data).toEqual({ id: 1, name: 'Ada' })
      expect(result.response).toBe(okResponse)
    }
  })

  it('returns DecodeError with DECODE_ERROR code for invalid data', () => {
    const result = decodeWithSchema(schema, { id: 'not-a-number', name: 7 }, okResponse)
    expect(result.status).toBe('failure')
    if (result.status === 'failure') {
      expect(result.error.code).toBe('DECODE_ERROR')
      expect(result.error).toBeInstanceOf(Error)
    }
  })

  it('normalizes issues into a readonly path/code/message array', () => {
    const result = decodeWithSchema(schema, { id: 'nope', name: 7 }, okResponse)
    if (result.status !== 'failure') throw new Error('expected failure')
    const issues = (result.error as unknown as { issues: readonly DecodeIssue[] }).issues
    expect(issues.length).toBeGreaterThan(0)
    for (const issue of issues) {
      expect(issue).toHaveProperty('path')
      expect(issue).toHaveProperty('code')
      expect(issue).toHaveProperty('message')
      expect(Array.isArray(issue.path)).toBe(true)
    }
  })

  it('preserves the underlying Zod error as cause (not as public surface)', () => {
    const result = decodeWithSchema(schema, { id: -1 }, okResponse)
    if (result.status !== 'failure') throw new Error('expected failure')
    expect(result.error.cause).toBeInstanceOf(z.ZodError)
  })

  it('treats null and undefined as decode failures, not throws', () => {
    expect(decodeWithSchema(schema, null, okResponse).status).toBe('failure')
    expect(decodeWithSchema(schema, undefined, okResponse).status).toBe('failure')
  })

  it('flattens invalid_union issues so each branch failure is exposed publicly', () => {
    const unionSchema = z.union([z.object({ a: z.string() }), z.object({ b: z.number() })])
    const result = decodeWithSchema(unionSchema, { c: 99 }, okResponse)
    expect(result.status).toBe('failure')
    if (result.status !== 'failure') throw new Error('expected failure')

    const issues = (result.error as unknown as { issues: readonly DecodeIssue[] }).issues
    expect(issues.length).toBeGreaterThan(1)
    const paths = issues.map((issue) => issue.path)
    expect(paths).toContainEqual(['a'])
    expect(paths).toContainEqual(['b'])
    expect(result.error.cause).toBeInstanceOf(z.ZodError)
    expect(result.error.message).toBe(`Response decoding failed: ${issues.length} issue(s)`)
  })
})
