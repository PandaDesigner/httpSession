/**
 * Build driver — bundles `src/index.ts` into `dist/` for npm publish.
 *
 * Uses `bun build` with `target: 'bun'` because the package targets Bun as
 * the primary runtime. Consumers on Node >= 20 and modern browsers also
 * work because the emitted ESM uses standard `fetch`, `Headers`,
 * `ReadableStream`, and `AbortController` — all platform globals.
 *
 * The output structure:
 * - dist/index.js — bundled ESM
 * - dist/index.d.ts — type declarations (generated via `tsc --emitDeclarationOnly`)
 *
 * Run with: `bun run build`
 */

import { build } from 'bun'

const outdir = './dist'

const result = await build({
  entrypoints: ['./src/index.ts'],
  outdir,
  target: 'bun',
  format: 'esm',
  sourcemap: 'external',
  splitting: false,
  minify: false,
  naming: '[name].[ext]',
})

if (!result.success) {
  for (const message of result.logs) console.error(message)
  process.exit(1)
}

console.log('\x1b[32m✓\x1b[0m built dist/index.js')

// Emit type declarations via tsc so consumers get full types without a
// separate type-generation step in their build.
const tsc = Bun.spawn({
  cmd: [
    'bunx',
    'tsc',
    '--project',
    'tsconfig.build.json',
    '--emitDeclarationOnly',
    '--declaration',
    '--outDir',
    'dist',
  ],
  stdout: 'inherit',
  stderr: 'inherit',
})

const tscExit = await tsc.exited
if (tscExit !== 0) {
  console.error(`\x1b[31m✗\x1b[0m tsc declarations failed (exit ${tscExit})`)
  process.exit(tscExit)
}

console.log('\x1b[32m✓\x1b[0m emitted type declarations into dist/')
