import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { makeAsar, makeIcon, TARGETS, NL_ZIP_SHA256, root } from '../tools/package-desktop.mjs';
import { buildWeb } from '../tools/build-web.mjs';

function readAsar(buf) {
  assert.equal(buf.readUInt32LE(0), 4);
  const hdrSize = buf.readUInt32LE(4);
  assert.equal(hdrSize % 4, 0, 'header pickle must be 4-byte aligned');
  const strLen = buf.readUInt32LE(12);
  const tree = JSON.parse(buf.subarray(16, 16 + strLen).toString());
  const base = 8 + hdrSize;
  const get = (p) => {
    const n = p.split('/').reduce((d, k) => d.files[k], tree);
    return buf.subarray(base + Number(n.offset), base + Number(n.offset) + n.size);
  };
  return { tree, get };
}

test('asar: round-trips nested files, offsets and 4-byte header padding', () => {
  for (const name of ['a', 'abcd', 'abcde']) { // header JSON lengths hit every padding residue over these
    const a = readAsar(makeAsar([{ path: `resources/${name}.txt`, data: Buffer.from('hello') }, { path: 'neutralino.config.json', data: Buffer.from('{"x":1}') }, { path: 'resources/js/z.js', data: Buffer.from('zzzz!') }]));
    assert.equal(a.get(`resources/${name}.txt`).toString(), 'hello');
    assert.equal(a.get('resources/js/z.js').toString(), 'zzzz!');
    assert.equal(a.get('neutralino.config.json').toString(), '{"x":1}');
  }
});

test('targets: linux/win/mac(x64+arm64) all present with the names the release workflow expects', () => {
  assert.deepEqual(Object.keys(TARGETS).sort(), ['linux-x64', 'mac-arm64', 'mac-x64', 'win-x64']);
  assert.match(NL_ZIP_SHA256, /^[0-9a-f]{64}$/);
});

test('icon: 256x256 PNG with some non-transparent pixels', async () => {
  const png = await makeIcon();
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 256); assert.equal(png.readUInt32BE(20), 256);
});

test('web build (unbundled fallback) copies src and keeps index.html loadable', () => {
  process.env.NO_ESBUILD = '1';
  const o = mkdtempSync(join(tmpdir(), 'webfb-'));
  try { const r = buildWeb({ log() {}, outDir: o }); assert.equal(r.bundled, false); } finally { delete process.env.NO_ESBUILD; }
  assert.ok(existsSync(join(o, 'web/src/main.js')));
  assert.ok(!existsSync(join(o, 'catxzzon.html')), 'no single-file build without a bundler');
  rmSync(o, { recursive: true, force: true });
});

test('web build (esbuild): single file is self-contained, web build has one JS + one CSS', (t) => {
  const o = mkdtempSync(join(tmpdir(), 'webbn-'));
  t.after(() => rmSync(o, { recursive: true, force: true }));
  const r = buildWeb({ log() {}, outDir: o });
  if (!r.bundled) return t.skip('esbuild unavailable (offline)');
  const one = readFileSync(join(o, 'catxzzon.html'), 'utf8');
  assert.ok(!/<link[^>]+stylesheet/.test(one), 'css must be inlined');
  assert.ok(!/<script[^>]+src=/.test(one), 'js must be inlined');
  assert.equal((one.match(/<script/g) || []).length, 1);
  const web = readFileSync(join(o, 'web/index.html'), 'utf8');
  assert.match(web, /src="app\.js"/); assert.match(web, /href="style\.css"/);
});

test('desktop packages: archives list, checksums match, binary is the pinned Neutralino', { timeout: 120000 }, async (t) => {
  if (!existsSync(join(root, 'assets-cache/neutralinojs-v6.10.0.zip'))) return t.skip('Neutralino zip not cached (offline)');
  const out = mkdtempSync(join(tmpdir(), 'pkgb-'));
  try {
    execFileSync('node', [join(root, 'tools/package-desktop.mjs'), '--platform', 'all', '--out', out, '--version', '9.9.9', '--skip-web'], { stdio: 'pipe' });
    const sums = readFileSync(join(out, 'SHA256SUMS'), 'utf8').trim().split('\n');
    assert.equal(sums.length, 4);
    for (const l of sums) {
      const [h, n] = l.split(/\s+/);
      assert.equal(createHash('sha256').update(readFileSync(join(out, n))).digest('hex'), h, n);
    }
    const tl = execFileSync('tar', ['-tzf', join(out, 'catxzzon-9.9.9-linux-x64.tar.gz')], { encoding: 'utf8' });
    for (const f of ['catxzzon', 'resources.neu', 'catxzzon.sh']) assert.ok(tl.includes('/' + f), f);
    const zl = execFileSync('unzip', ['-l', join(out, 'catxzzon-9.9.9-win-x64.zip')], { encoding: 'utf8' });
    assert.ok(zl.includes('catxzzon.exe') && zl.includes('resources.neu'));
    const ml = execFileSync('unzip', ['-l', join(out, 'catxzzon-9.9.9-mac-arm64.zip')], { encoding: 'utf8' });
    assert.ok(ml.includes('CATXZZON.app/Contents/MacOS/catxzzon') && ml.includes('Info.plist'));
    // resources.neu really holds the app + config (extract from the linux tarball)
    const neu = execFileSync('tar', ['-xzOf', join(out, 'catxzzon-9.9.9-linux-x64.tar.gz'), '--wildcards', '*/resources.neu'], { maxBuffer: 1 << 26 });
    const a = readAsar(neu);
    const cfg = JSON.parse(a.get('neutralino.config.json'));
    assert.equal(cfg.version, '9.9.9'); assert.equal(cfg.modes.window.width, 960); assert.equal(cfg.modes.window.height, 540);
    assert.equal(cfg.modes.window.resizable, true);
    assert.match(a.get('resources/index.html').toString(), /__neutralino_globals\.js/);
    assert.ok(a.get('resources/js/shell.js').toString().includes('F11'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});
