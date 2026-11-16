#!/usr/bin/env node
// Web build: node tools/build-web.mjs [--no-bundle]
//   dist/web/{index.html,app.js,style.css}  minified static build (esbuild via npx, fallback: unbundled copy of src/)
//   dist/catxzzon.html                      ONE self-contained file (JS+CSS inlined), playable from file://
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, statSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist'), web = join(dist, 'web');
const ESBUILD = process.env.ESBUILD_SPEC || 'esbuild@0.25';

function esbuild(args) {
  if (process.env.NO_ESBUILD) throw new Error('esbuild disabled by NO_ESBUILD');
  return execFileSync('npx', ['--yes', ESBUILD, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
}
const size = (f) => statSync(f).size;
const gz = (f) => gzipSync(readFileSync(f), { level: 9 }).length;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

/**
 * main.js loads its modules with import(variable), which a bundler cannot follow. Stage a copy of src/ where
 * tryImport() first consults a module map (every src module, bundled statically), then boot main.js from a tiny entry.
 * Falls back to the plain entry (with a warning) if main.js no longer has the expected `import(path)` shape.
 */
function stageEntry(log) {
  const tmp = join(dist, '.stage');
  rmSync(tmp, { recursive: true, force: true });
  cpSync(join(root, 'src'), join(tmp, 'src'), { recursive: true });
  const mainP = join(tmp, 'src/main.js');
  const main = readFileSync(mainP, 'utf8');
  const patched = main.replace(/return await import\(path\);/, 'return await (window.__mods && window.__mods[path] ? window.__mods[path] : import(path));');
  if (patched === main) { log('WARN main.js: tryImport import(path) not found; bundling main.js as-is (dynamic modules may be missing)'); return 'src/main.js'; }
  writeFileSync(mainP, patched);
  const mods = walk(join(tmp, 'src')).map((f) => relative(join(tmp, 'src'), f).split('\\').join('/')).filter((f) => f.endsWith('.js') && f !== 'main.js').sort();
  const lines = mods.map((f, i) => `import * as m${i} from './src/${f}';`);
  lines.push(`window.__mods = {${mods.map((f, i) => ` './${f}': m${i}`).join(',')} };`, "await import('./src/main.js');");
  writeFileSync(join(tmp, 'entry.js'), lines.join('\n') + '\n');
  return join(tmp, 'entry.js');
}

/** Build everything; returns { bundled, files:[{name,bytes,gzip}] }. */
export function buildWeb({ bundle = true, log = console.log } = {}) {
  rmSync(web, { recursive: true, force: true });
  mkdirSync(web, { recursive: true });
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  let bundled = false;
  if (bundle) {
    try {
      // ESM output: the game uses top-level await in places, and inline <script type=module> works from file://.
      const entry = stageEntry(log);
      esbuild([entry, '--bundle', '--minify', '--format=esm', '--target=es2022', '--legal-comments=none', `--outfile=${join(web, 'app.js')}`]);
      esbuild(['style.css', '--minify', `--outfile=${join(web, 'style.css')}`]);
      bundled = true;
    } catch (e) {
      log('WARN esbuild unavailable/failed -> unbundled copy of src/: ' + String(e.stderr || e.message).split('\n')[0]);
    }
  }
  if (!bundled) {
    rmSync(join(dist, 'catxzzon.html'), { force: true }); // no bundler -> no single-file build; never leave a stale one
    cpSync(join(root, 'src'), join(web, 'src'), { recursive: true });
    cpSync(join(root, 'style.css'), join(web, 'style.css'));
    writeFileSync(join(web, 'index.html'), html);
  } else {
    const out = html.replace(/<script type="module" src="src\/main\.js"><\/script>/, '<script type="module" src="app.js"></script>');
    if (out === html) throw new Error('index.html: expected <script type="module" src="src/main.js">');
    writeFileSync(join(web, 'index.html'), out);
    // single file
    const js = readFileSync(join(web, 'app.js'), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
    const css = readFileSync(join(web, 'style.css'), 'utf8').replace(/<\/style/gi, '<\\/style');
    const one = out
      .replace(/<link rel="stylesheet" href="style\.css">/, () => `<style>${css}</style>`)
      .replace(/<script type="module" src="app\.js"><\/script>/, () => `<script type="module">${js}</script>`);
    if (/href="style\.css"|src="app\.js"/.test(one)) throw new Error('single-file inlining failed');
    writeFileSync(join(dist, 'catxzzon.html'), one);
  }
  rmSync(join(dist, '.stage'), { recursive: true, force: true });
  const files = [];
  for (const f of ['web/index.html', 'web/app.js', 'web/style.css', 'catxzzon.html']) {
    const p = join(dist, f);
    if (existsSync(p)) files.push({ name: 'dist/' + f, bytes: size(p), gzip: gz(p) });
  }
  log(`web build (${bundled ? 'esbuild bundle' : 'UNBUNDLED fallback'}):`);
  for (const f of files) log(`  ${f.name.padEnd(24)} ${kb(f.bytes).padStart(10)}  gzip ${kb(f.gzip).padStart(9)}`);
  return { bundled, files };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildWeb({ bundle: !process.argv.includes('--no-bundle') });
}
