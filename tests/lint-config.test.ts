import { describe, expect, it } from 'vitest'
import biomeConfig from '../biome.json'

describe('biome config', () => {
  it('disables barrelling lint in core (we re-export on purpose)', () => {
    expect(biomeConfig.linter.rules.performance.noBarrelFile).toBe('off')
  })

  it('uses single quotes for JS/TS', () => {
    expect(biomeConfig.javascript.formatter.quoteStyle).toBe('single')
  })

  it('formats JSON without trailing commas', () => {
    expect(biomeConfig.json.formatter.trailingCommas).toBe('none')
  })
})
