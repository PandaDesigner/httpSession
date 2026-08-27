import type { TransportCapabilities, TransportStrategy } from './transport-types'

export type {
  TransportCapabilities,
  TransportContext,
  TransportProgressEvent,
  TransportRequest,
  TransportResponse,
  TransportStrategy,
} from './transport-types'

export { emptyTransportResponse } from './transport-types'

/**
 * Strategy selection is capability-based: a strategy is eligible iff every
 * `true` flag in `requested` is also `true` in its `capabilities`. The first
 * eligible strategy in the constructor list wins.
 */
export function strategySupports(
  requested: TransportCapabilities,
  capabilities: TransportCapabilities,
): boolean {
  if (requested.uploadProgress && !capabilities.uploadProgress) return false
  if (requested.streaming && !capabilities.streaming) return false
  return true
}

/**
 * Picks the first strategy in `strategies` that supports `requested`.
 * Returns `undefined` when no strategy matches; the caller decides how to
 * surface the gap (HttpTransport throws UnsupportedCapabilityError).
 */
export function selectStrategy(
  strategies: readonly TransportStrategy[],
  requested: TransportCapabilities,
): TransportStrategy | undefined {
  return strategies.find((s) => strategySupports(requested, s.capabilities))
}
