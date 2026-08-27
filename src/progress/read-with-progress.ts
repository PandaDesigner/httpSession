import type { TransferProgress } from './transfer-progress'

/**
 * Reads a `ReadableStream<Uint8Array>` end-to-end, emitting a
 * {@link TransferProgress} after every chunk.
 *
 * `expectedTotal` is the byte count advertised by the upstream
 * `Content-Length` header (or any other deterministic source). When known,
 * each progress event includes `percentage = round(loaded / total * 100)`.
 * When unknown, `percentage` is `undefined`; the final event still fires so
 * observers can transition to a complete state.
 *
 * The reader lock is released in `finally`, even if `onProgress` throws, so
 * the underlying transport stream is never leaked.
 */
export async function readWithProgress(
  stream: ReadableStream<Uint8Array>,
  expectedTotal: number | undefined,
  onProgress: (progress: TransferProgress) => void,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.byteLength
      onProgress(buildProgress(loaded, expectedTotal))
    }
  } finally {
    reader.releaseLock()
  }

  return concat(chunks)
}

function buildProgress(loaded: number, total: number | undefined): TransferProgress {
  const percentage =
    total !== undefined && total > 0 ? Math.round((loaded / total) * 100) : undefined
  const base = {
    direction: 'download' as const,
    loaded,
  }
  return Object.freeze(
    total === undefined
      ? { ...base, total: undefined, percentage }
      : { ...base, total, percentage },
  )
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0
  for (const chunk of chunks) total += chunk.byteLength
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}
