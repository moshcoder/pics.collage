// Builds dist/: copies src/, bakes both footers into the page (they render
// server-side for the ring verifier, so a static site prints them at build),
// rasterizes the icons with headless Chrome and stamps the service worker.
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SITE = 'https://pics.collage.pit.world/';
const NAME = 'pics.collage';
const SOURCE = 'https://github.com/moshcoder/pics.collage';

rmSync('dist', { recursive: true, force: true });
cpSync('src', 'dist', { recursive: true });

const ring = execFileSync('npx', ['-y', '@profullstack/footer@latest', 'html', '--site', SITE,
  '--link', `Source=${SOURCE}`, '--since', '2026'], { encoding: 'utf8' }).trim();
const pfs = `<footer data-profullstack-footer data-site="${SITE}" data-links='[{"label":"Source","href":"${SOURCE}"}]'>\n${ring}\n</footer>\n`
  + '<script type="module" src="https://cdn.jsdelivr.net/npm/@profullstack/footer@latest/src/embed.js"></script>';

let pit = '';
try {
  const r = await fetch(`https://pit.world/snippets/footer.html?site=${NAME}.pit.world`, { signal: AbortSignal.timeout(8000) });
  if (r.ok) pit = (await r.text()).trim();
} catch (err) {
  console.warn('pit.world footer unavailable, building without it:', err.message);
}

let html = readFileSync('dist/index.html', 'utf8');
html = html.replace('<footer class="site-foot">\n<!--PFS_FOOTER-->\n</footer>', `<div class="site-foot">\n${pfs}\n</div>`);
html = html.replace('<!--PIT_FOOTER-->', pit);
writeFileSync('dist/index.html', html);

const chrome = process.env.CHROME || 'google-chrome';
const work = mkdtempSync(join(tmpdir(), 'collage-icons-'));
const svg = readFileSync('src/icon.svg', 'utf8');
for (const size of [180, 192, 512]) {
  const page = join(work, `icon-${size}.html`);
  writeFileSync(page, `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${size},${size}`, `--screenshot=${join(process.cwd(), 'dist', `icon-${size}.png`)}`, `file://${page}`], { stdio: 'ignore' });
}
rmSync(work, { recursive: true, force: true });

const hash = createHash('sha256');
for (const f of ['index.html', 'app.js', 'style.css', 'manifest.webmanifest']) hash.update(readFileSync(`dist/${f}`));
const version = `collage-${hash.digest('hex').slice(0, 10)}`;
writeFileSync('dist/sw.js', readFileSync('dist/sw.js', 'utf8').replace('__VERSION__', version));
console.log(`built dist/ (${version}), pit footer ${pit ? 'baked' : 'MISSING'}`);
