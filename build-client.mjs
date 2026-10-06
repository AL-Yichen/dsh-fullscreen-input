/**
 * Rebuild lib/client.js from src/client.js.
 *
 * The browser artifact is the source wrapped in the shell's module-loader call.
 * Keeping the build here — rather than in a bundler — is deliberate: this half
 * imports nothing at build time (React arrives through the factory's `require`,
 * and the optional primitives lookup is guarded at runtime), so there is nothing
 * to resolve and nothing to tree-shake. The wrapper is the whole build.
 *
 *   node build-client.mjs
 *
 * The emitted shape is the one the shell's dynamic module table expects: the
 * factory body is source that assigns `module.exports`, and the wrapper returns
 * it. This is the same contract the shipped client bundles use.
 *
 *   window.__ModuleLoader__.load({ id: "<package name>", factory: (require) => {
 *   var module = { exports: {} }; var exports = module.exports;
 *   <src/client.js verbatim>
 *   return module.exports; } });
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const id = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name

const head = `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\n`
  + 'var module = { exports: {} }; var exports = module.exports;\n'
const tail = '\nreturn module.exports; } });\n'

const source = readFileSync(join(root, 'src', 'client.js'), 'utf8')
if (source.includes('return module.exports; } });')) {
  throw new Error('build-client: src/client.js already carries the loader tail; it is source, not a bundle')
}
// The CSS sheet must stay a single-quoted string array: a template literal would
// let one stray backtick end the string early, and the build would silently keep
// the previous artifact.
if (/const\s+CSS\s*=\s*`/.test(source)) {
  throw new Error('build-client: the CSS sheet became a template literal; keep it a single-quoted array')
}

mkdirSync(join(root, 'lib'), { recursive: true })
const bundle = head + source + tail
writeFileSync(join(root, 'lib', 'client.js'), bundle)
console.log(`build-client: lib/client.js written (${String(bundle.length)} chars from ${String(source.length)})`)
