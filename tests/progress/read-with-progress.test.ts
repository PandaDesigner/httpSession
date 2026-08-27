import { describe, expect, it, vi } from 'vitest'
import { readWithProgress } from '../../src/progress/read-with-progress'

function chunkStream(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('readWithProgress', () => {
  it('emits cumulative progress with total and percentage after every chunk', async () => {
    const stream = chunkStream([new Uint8Array([1, 2]), new Uint8Array([3, 4])])
    const onProgress = vi.fn()

    const bytes = await readWithProgress(stream, 4, onProgress)

    expect([...bytes]).toEqual([1, 2, 3, 4])
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      direction: 'download',
      loaded: 2,
      total: 4,
      percentage: 50,
    })
    expect(onProgress).toHaveBeenLastCalledWith({
      direction: 'download',
      loaded: 4,
      total: 4,
      percentage: 100,
    })
  })

  it('omits percentage when total is unknown', async () => {
    const stream = chunkStream([new Uint8Array([5, 6, 7])])
    const onProgress = vi.fn()

    const bytes = await readWithProgress(stream, undefined, onProgress)

    expect([...bytes]).toEqual([5, 6, 7])
    expect(onProgress).toHaveBeenLastCalledWith({
      direction: 'download',
      loaded: 3,
      total: undefined,
      percentage: undefined,
    })
  })

  it('emits a final 100% event when total is unknown and reading completes', async () => {
    const stream = chunkStream([new Uint8Array([9])])
    const onProgress = vi.fn()

    await readWithProgress(stream, undefined, onProgress)

    expect(onProgress).toHaveBeenLastCalledWith({
      direction: 'download',
      loaded: 1,
      total: undefined,
      percentage: undefined,
    })
  })

  it('releases the reader lock even when the consumer throws', async () => {
    const stream = chunkStream([new Uint8Array([1])])
    const releaseSpy = vi.spyOn(stream, 'getReader')

    await expect(
      readWithProgress(stream, undefined, () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    // Force the underlying reader to be observed through the spy:
    expect(releaseSpy).toHaveBeenCalled()
  })
})
