import { UnsupportedCapabilityError } from '../core/errors'
import { type TransportStrategy, selectStrategy } from './transport-strategy'
import type {
  TransportCapabilities,
  TransportContext,
  TransportRequest,
  TransportResponse,
} from './transport-types'

/**
 * Single public infrastructure boundary. Picks the first strategy whose
 * capabilities cover the request and delegates `execute` to it. Strategies
 * are tried in constructor order.
 */
export class HttpTransport {
  readonly strategies: readonly TransportStrategy[]

  constructor(strategies: readonly TransportStrategy[]) {
    this.strategies = [...strategies]
  }

  selectStrategy(requested: TransportCapabilities): TransportStrategy {
    const strategy = selectStrategy(this.strategies, requested)
    if (strategy === undefined) {
      throw new UnsupportedCapabilityError(
        `No transport strategy supports uploadProgress=${requested.uploadProgress}, streaming=${requested.streaming}`,
      )
    }
    return strategy
  }

  async execute(
    request: TransportRequest,
    capabilities: TransportCapabilities,
    context: TransportContext,
  ): Promise<TransportResponse> {
    return this.selectStrategy(capabilities).execute(request, context)
  }
}
