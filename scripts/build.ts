/**
 * Build driver.
 *
 * For now this just confirms the toolchain is wired and exits 0. A real
 * `bun build --target=bun --outdir=dist ./src/index.ts` invocation lands
 * in Task 6 once `HttpClient` exists and we have something worth bundling.
 */

const ok = (msg: string) => console.log(`\x1b[32m\u2713\x1b[0m ${msg}`)

const indexExists = await Bun.file('src/index.ts').exists()

ok('build: placeholder ok (real bundling lands in Task 6)')
ok(`src/index.ts: ${indexExists ? 'found' : 'MISSING'}`)
