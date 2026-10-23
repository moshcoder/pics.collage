// pics.collage: a photo collage editor that runs entirely in the browser.
// One document model drives both the on-screen canvas and the exported image,
// so what you see is exactly what gets saved. Projects and photos live in
// IndexedDB on the device; nothing is uploaded anywhere.

const $ = (s) => document.querySelector(s);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, '').slice(0, 16);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- constants

const W = 1000; // design width; height follows the ratio
const MAX_IMPORT = 1600; // long side kept for imported photos (iOS canvas memory)
const EXPORT_LONG = 2048;

const RATIOS = [
  { id: '1:1', w: 1, h: 1, label: 'Square' },
  { id: '4:5', w: 4, h: 5, label: 'Portrait' },
  { id: '9:16', w: 9, h: 16, label: 'Story' },
  { id: '3:4', w: 3, h: 4, label: '3:4' },
  { id: '4:3', w: 4, h: 3, label: '4:3' },
  { id: '16:9', w: 16, h: 9, label: 'Wide' },
];

const grid = (c, r) => {
  const a = [];
  for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) a.push([x / c, y / r, 1 / c, 1 / r]);
  return a;
};
const t3 = 1 / 3;
const LAYOUTS = [
  { id: 'free', cells: [] },
  { id: '1', cells: [[0, 0, 1, 1]] },
  { id: '2v', cells: grid(2, 1) },
  { id: '2h', cells: grid(1, 2) },
  { id: '2l', cells: [[0, 0, 2 * t3, 1], [2 * t3, 0, t3, 1]] },
  { id: '3c', cells: grid(3, 1) },
  { id: '3r', cells: grid(1, 3) },
  { id: '3L', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: '3T', cells: [[0, 0, 1, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
  { id: '3B', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 1, 0.5]] },
  { id: '4', cells: grid(2, 2) },
  { id: '4T', cells: [[0, 0, 1, 2 * t3], [0, 2 * t3, t3, t3], [t3, 2 * t3, t3, t3], [2 * t3, 2 * t3, t3, t3]] },
  { id: '4L', cells: [[0, 0, 2 * t3, 1], [2 * t3, 0, t3, t3], [2 * t3, t3, t3, t3], [2 * t3, 2 * t3, t3, t3]] },
  { id: '4c', cells: grid(4, 1) },
  { id: '4r', cells: grid(1, 4) },
  { id: '5a', cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, t3, 0.5], [t3, 0.5, t3, 0.5], [2 * t3, 0.5, t3, 0.5]] },
  { id: '5b', cells: [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]] },
  { id: '5c', cells: [[0, 0, 0.5, t3], [0.5, 0, 0.5, t3], [0, t3, 1, t3], [0, 2 * t3, 0.5, t3], [0.5, 2 * t3, 0.5, t3]] },
  { id: '6', cells: grid(2, 3) },
  { id: '6w', cells: grid(3, 2) },
  { id: '6b', cells: [[0, 0, 2 * t3, 2 * t3], [2 * t3, 0, t3, t3], [2 * t3, t3, t3, t3], [0, 2 * t3, t3, t3], [t3, 2 * t3, t3, t3], [2 * t3, 2 * t3, t3, t3]] },
  { id: '7', cells: [...grid(4, 1).map(([x, , w]) => [x, 0, w, 0.5]), ...grid(3, 1).map(([x, , w]) => [x, 0.5, w, 0.5])] },
  { id: '8', cells: grid(4, 2) },
  { id: '9', cells: grid(3, 3) },
  { id: '12', cells: grid(3, 4) },
  { id: '16', cells: grid(4, 4) },
];
const layoutById = (id) => LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];

const FONTS = [
  { id: 'sans', label: 'Bold', css: (s) => `800 ${s}px -apple-system, system-ui, sans-serif` },
  { id: 'pacifico', label: 'Pacifico', css: (s) => `400 ${s}px "Pacifico", cursive` },
  { id: 'bebas', label: 'BEBAS', css: (s) => `400 ${s}px "Bebas Neue", sans-serif` },
  { id: 'caveat', label: 'Caveat', css: (s) => `700 ${s}px "Caveat", cursive` },
  { id: 'marker', label: 'Marker', css: (s) => `400 ${s}px "Permanent Marker", cursive` },
  { id: 'lobster', label: 'Lobster', css: (s) => `400 ${s}px "Lobster", cursive` },
  { id: 'playfair', label: 'Playfair', css: (s) => `700 ${s}px "Playfair Display", serif` },
  { id: 'fredoka', label: 'Fredoka', css: (s) => `600 ${s}px "Fredoka", sans-serif` },
  { id: 'serif', label: 'Serif', css: (s) => `400 ${s}px Georgia, "Times New Roman", serif` },
  { id: 'mono', label: 'Mono', css: (s) => `700 ${s}px ui-monospace, Menlo, monospace` },
];
const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];

const COLORS = [
  '#ffffff', '#000000', '#f5f0e8', '#3a3a3a', '#ff5c8a', '#ff2d55', '#ff9500', '#ffcc00',
  '#ffe8a3', '#34c759', '#a8e6cf', '#00c7be', '#5ac8fa', '#007aff', '#cfe3ff', '#5856d6',
  '#af52de', '#e6d4ff', '#ffd1dc', '#a2845e', '#8e8e93', '#d1d1d6', '#1c3d5a', '#6b0f1a',
];

const GRADIENTS = [
  ['#ff9a9e', '#fecfef'], ['#a18cd1', '#fbc2eb'], ['#fad0c4', '#ffd1ff'], ['#ffecd2', '#fcb69f'],
  ['#84fab0', '#8fd3f4'], ['#a1c4fd', '#c2e9fb'], ['#fbc2eb', '#a6c1ee'], ['#fdfbfb', '#ebedee'],
  ['#f6d365', '#fda085'], ['#30cfd0', '#330867'], ['#ff0844', '#ffb199'], ['#232526', '#414345'],
  ['#ee9ca7', '#ffdde1'], ['#c471f5', '#fa71cd'], ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'],
];

const PATTERNS = [
  { name: 'dots', fg: '#ffffff', bg: '#ff9eb8' },
  { name: 'dots', fg: '#ff5c8a', bg: '#fff1f5' },
  { name: 'stripes', fg: '#ffffff', bg: '#9fd8f5' },
  { name: 'stripes', fg: '#ffd84d', bg: '#fff8dc' },
  { name: 'checker', fg: '#ffd1dc', bg: '#ffffff' },
  { name: 'checker', fg: '#222222', bg: '#f2f2f2' },
  { name: 'grid', fg: '#c9d9ff', bg: '#ffffff' },
  { name: 'hearts', fg: '#ff5c8a', bg: '#ffe4ec' },
  { name: 'hearts', fg: '#ffffff', bg: '#d81b60' },
  { name: 'stars', fg: '#ffd84d', bg: '#1c3d5a' },
  { name: 'stars', fg: '#ffffff', bg: '#b39ddb' },
  { name: 'confetti', fg: '', bg: '#ffffff' },
];

const FILTERS = [
  { id: 'none', label: 'Original' },
  { id: 'bw', label: 'B&W' },
  { id: 'noir', label: 'Noir' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'warm', label: 'Warm' },
  { id: 'cool', label: 'Cool' },
  { id: 'fade', label: 'Fade' },
  { id: 'vivid', label: 'Vivid' },
];

const STICKERS = {
  Love: '❤️ 🧡 💛 💚 💙 💜 🩷 🤍 💖 💕 💞 💘 💝 💋 😍 🥰 😘 💌 🌹 💐',
  Faces: '😀 😂 🤣 😊 😇 🙂 😉 😎 🤩 🥳 😜 🤪 😏 🥺 😭 😱 🤗 🤭 🙈 👻',
  Party: '🎉 🎊 🎈 🎂 🍰 🧁 🎁 🥂 🍾 🎀 ✨ 🌟 ⭐ 💫 🔥 💯 👑 💎 🏆 🎶',
  Nature: '🌸 🌺 🌻 🌼 🌷 🍀 🌿 🍁 🌈 ☀️ 🌙 ⛅ ❄️ 🌊 🦋 🐝 🐞 🌵 🍄 🌴',
  Animals: '🐶 🐱 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐧 🐥 🦄 🐴 🐢 🐬 🦖',
  Food: '🍓 🍒 🍑 🍉 🍋 🍍 🥑 🍕 🍔 🍟 🌮 🍩 🍪 🍦 🍭 🍫 🧋 ☕ 🍹 🍿',
  Fun: '📸 🎨 🎮 🎧 🎤 🛼 ⚽ 🏀 🏖️ ✈️ 🚗 🏠 🎄 🎃 🐣 🦃 🕶️ 👟 👗 💄',
  Hands: '👍 👏 🙌 🤞 ✌️ 🤟 👌 🫶 💪 🙏 👋 ☝️ 👉 👈 👆 👇 ✍️ 🤳 💅 🫰',
};

const TEXT_PRESETS = [
  { text: 'Happy Birthday!', font: 'pacifico', color: '#ff5c8a', style: 'outline' },
  { text: 'BEST DAY EVER', font: 'bebas', color: '#ffffff', style: 'pill', bg: '#ff5c8a' },
  { text: 'besties', font: 'caveat', color: '#5856d6', style: 'plain' },
  { text: 'Love you', font: 'lobster', color: '#ff2d55', style: 'outline' },
  { text: 'Summer', font: 'marker', color: '#ff9500', style: 'shadow' },
  { text: 'Family', font: 'playfair', color: '#1c3d5a', style: 'plain' },
];

// ---------------------------------------------------------------- storage

const dbp = new Promise((resolve, reject) => {
  const r = indexedDB.open('pics.collage', 1);
  r.onupgradeneeded = () => {
    r.result.createObjectStore('projects', { keyPath: 'id' });
    r.result.createObjectStore('images', { keyPath: 'id' });
  };
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

async function idb(store, mode, fn) {
  const db = await dbp;
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const putProject = (p) => idb('projects', 'readwrite', (s) => s.put(p));
const getProject = (id) => idb('projects', 'readonly', (s) => s.get(id));
const allProjects = () => idb('projects', 'readonly', (s) => s.getAll());
const delProject = (id) => idb('projects', 'readwrite', (s) => s.delete(id));
const putImage = (rec) => idb('images', 'readwrite', (s) => s.put(rec));
const getImage = (id) => idb('images', 'readonly', (s) => s.get(id));
const imageKeys = () => idb('images', 'readonly', (s) => s.getAllKeys());
const delImage = (id) => idb('images', 'readwrite', (s) => s.delete(id));

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// ---------------------------------------------------------------- images

const images = new Map(); // id -> { img, w, h }
const filtered = new Map(); // `${id}|${filter}` -> { img } once ready, { pending: Promise } before

function blobImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img); // keep the URL: the img stays drawable for the session
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not read that image')); };
    img.src = url;
  });
}

function canvasBlob(c, type = 'image/jpeg', q = 0.9) {
  return new Promise((resolve) => c.toBlob(resolve, type, q));
}

async function importFile(file) {
  const src = await blobImage(file);
  let w = src.naturalWidth;
  let h = src.naturalHeight;
  const m = MAX_IMPORT / Math.max(w, h);
  if (m < 1) { w = Math.round(w * m); h = Math.round(h * m); }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  URL.revokeObjectURL(src.src);
  const png = file.type === 'image/png' || file.type === 'image/webp';
  const blob = await canvasBlob(c, png ? 'image/png' : 'image/jpeg', 0.9);
  c.width = c.height = 0; // hand the canvas memory back right away (iOS caps it)
  const id = uid();
  await putImage({ id, blob, w, h });
  images.set(id, { img: await blobImage(blob), w, h });
  return id;
}

async function ensureImage(id) {
  if (!id || images.has(id)) return;
  const rec = await getImage(id);
  if (!rec) return;
  images.set(id, { img: await blobImage(rec.blob), w: rec.w, h: rec.h });
}

function applyFilter(d, f) {
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (f === 'bw') { r = g = b = lum(r, g, b); }
    else if (f === 'noir') { const l = (lum(r, g, b) - 128) * 1.45 + 128; r = g = b = l; }
    else if (f === 'sepia') {
      const nr = 0.393 * r + 0.769 * g + 0.189 * b, ng = 0.349 * r + 0.686 * g + 0.168 * b, nb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = nr; g = ng; b = nb;
    } else if (f === 'warm') { r = r * 1.08 + 12; g = g * 1.02 + 4; b = b * 0.88; }
    else if (f === 'cool') { r = r * 0.9; g = g * 1.0 + 2; b = b * 1.08 + 14; }
    else if (f === 'fade') { const l = lum(r, g, b); r = (r * 0.8 + l * 0.2) * 0.82 + 34; g = (g * 0.8 + l * 0.2) * 0.82 + 30; b = (b * 0.8 + l * 0.2) * 0.82 + 38; }
    else if (f === 'vivid') {
      const l = lum(r, g, b);
      r = ((l + (r - l) * 1.4) - 128) * 1.08 + 128; g = ((l + (g - l) * 1.4) - 128) * 1.08 + 128; b = ((l + (b - l) * 1.4) - 128) * 1.08 + 128;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b; // Uint8ClampedArray clamps for us
  }
}

function filteredSource(id, f) {
  const base = images.get(id);
  if (!base) return null;
  if (!f || f === 'none') return base.img;
  const key = `${id}|${f}`;
  const hit = filtered.get(key);
  if (hit && hit.img) return hit.img;
  if (!hit) {
    const pending = (async () => {
      const c = document.createElement('canvas');
      c.width = base.w; c.height = base.h;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(base.img, 0, 0, base.w, base.h);
      const data = x.getImageData(0, 0, base.w, base.h);
      applyFilter(data.data, f);
      x.putImageData(data, 0, 0);
      const img = await blobImage(await canvasBlob(c, 'image/jpeg', 0.92));
      c.width = c.height = 0;
      filtered.set(key, { img });
      requestRender();
    })();
    filtered.set(key, { pending });
  }
  return base.img; // draw unfiltered until the filtered copy is ready
}

async function readyAllFilters() {
  const jobs = [];
  const need = (id, f) => {
    if (!id || !f || f === 'none' || !images.has(id)) return;
    filteredSource(id, f);
    const e = filtered.get(`${id}|${f}`);
    if (e && e.pending) jobs.push(e.pending);
  };
  doc.cells.forEach((c) => need(c.img, c.filter));
  doc.items.forEach((it) => it.kind === 'photo' && need(it.img, it.filter));
  await Promise.all(jobs);
}

// ---------------------------------------------------------------- document

let doc = null;
let sel = null; // { kind: 'cell', i } | { kind: 'item', id }
let undoStack = [];
let redoStack = [];
let lastJSON = '';

const H = () => {
  const r = RATIOS.find((x) => x.id === doc.ratio) || RATIOS[0];
  return Math.round((W * r.h) / r.w);
};
const newCell = () => ({ img: null, zoom: 1, ox: 0, oy: 0, filter: 'none' });

function newDoc() {
  return {
    v: 1, id: uid(), created: Date.now(), updated: Date.now(),
    ratio: '1:1', layout: '4', spacing: 14, radius: 10,
    bg: { kind: 'color', c: '#ffffff' },
    cells: [], items: [],
  };
}

function ensureCells() {
  const n = layoutById(doc.layout).cells.length;
  while (doc.cells.length < n) doc.cells.push(newCell());
}

function cellRects() {
  const h = H();
  const s = doc.spacing;
  return layoutById(doc.layout).cells.map(([x, y, w, hh]) => ({
    x: x * (W - s) + s,
    y: y * (h - s) + s,
    w: w * (W - s) - s,
    h: hh * (h - s) - s,
  }));
}

function commit() {
  const j = JSON.stringify(doc);
  if (j === lastJSON) return;
  if (lastJSON) undoStack.push(lastJSON);
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
  lastJSON = j;
  scheduleSave();
  syncUndo();
}

function restore(j) {
  doc = JSON.parse(j);
  lastJSON = j;
  if (sel && sel.kind === 'item' && !doc.items.find((i) => i.id === sel.id)) sel = null;
  if (sel && sel.kind === 'cell' && sel.i >= layoutById(doc.layout).cells.length) sel = null;
  Promise.all([...doc.cells.map((c) => ensureImage(c.img)), ...doc.items.map((i) => ensureImage(i.img))]).then(requestRender);
  fit();
  updateCtx();
  scheduleSave();
  syncUndo();
}

function undo() { if (!undoStack.length) return; redoStack.push(lastJSON); restore(undoStack.pop()); }
function redo() { if (!redoStack.length) return; undoStack.push(lastJSON); restore(redoStack.pop()); }
function syncUndo() { $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length; }

let saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow() {
  clearTimeout(saveTimer);
  if (!doc) return;
  doc.updated = Date.now();
  const thumb = await renderBlob(360, 'image/jpeg', 0.8);
  await putProject({ id: doc.id, updated: doc.updated, doc: JSON.parse(JSON.stringify(doc)), thumb });
}

// ---------------------------------------------------------------- drawing

const mctx = document.createElement('canvas').getContext('2d'); // for measuring text

function pathRound(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function heartPath(ctx, x, y, s) {
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.75, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
}

function starPath(ctx, x, y, r) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function drawBackground(ctx, bg, w, h) {
  if (bg.kind === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg.a); g.addColorStop(1, bg.b);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (bg.kind === 'pattern') {
    ctx.fillStyle = bg.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = bg.fg;
    ctx.strokeStyle = bg.fg;
    const n = bg.name;
    if (n === 'dots') {
      ctx.beginPath();
      for (let y = 0, row = 0; y < h + 50; y += 44, row++) for (let x = row % 2 ? 22 : 0; x < w + 50; x += 44) { ctx.moveTo(x + 7, y); ctx.arc(x, y, 7, 0, Math.PI * 2); }
      ctx.fill();
    } else if (n === 'stripes') {
      ctx.lineWidth = 26;
      ctx.beginPath();
      for (let x = -h; x < w + h; x += 70) { ctx.moveTo(x, 0); ctx.lineTo(x + h, h); }
      ctx.stroke();
    } else if (n === 'checker') {
      for (let y = 0, r = 0; y < h; y += 62, r++) for (let x = r % 2 ? 62 : 0; x < w; x += 124) ctx.fillRect(x, y, 62, 62);
    } else if (n === 'grid') {
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += 50) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
    } else if (n === 'hearts') {
      ctx.beginPath();
      for (let y = 10, r = 0; y < h + 60; y += 80, r++) for (let x = r % 2 ? 40 : 0; x < w + 60; x += 80) heartPath(ctx, x, y, 34);
      ctx.fill();
    } else if (n === 'stars') {
      ctx.beginPath();
      for (let y = 30, r = 0; y < h + 60; y += 90, r++) for (let x = r % 2 ? 45 : 0; x < w + 60; x += 90) starPath(ctx, x, y, 18);
      ctx.fill();
    } else if (n === 'confetti') {
      const cols = ['#ff5c8a', '#ffcc00', '#34c759', '#5ac8fa', '#af52de', '#ff9500'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const count = Math.round((w * h) / 2600);
      for (let i = 0; i < count; i++) {
        ctx.save();
        ctx.translate(rnd() * w, rnd() * h);
        ctx.rotate(rnd() * Math.PI);
        ctx.fillStyle = cols[i % cols.length];
        if (i % 3) ctx.fillRect(-9, -3.5, 18, 7);
        else { ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }
    return;
  }
  ctx.fillStyle = bg.c || '#ffffff';
  ctx.fillRect(0, 0, w, h);
}

function coverGeom(src, r, cell) {
  const iw = src.naturalWidth || src.width;
  const ih = src.naturalHeight || src.height;
  const s = Math.max(r.w / iw, r.h / ih) * cell.zoom;
  const dw = iw * s, dh = ih * s;
  const mx = (dw - r.w) / 2, my = (dh - r.h) / 2;
  return { dw, dh, ox: clamp(cell.ox, -mx, mx), oy: clamp(cell.oy, -my, my) };
}

function textLayout(it) {
  const f = fontById(it.font);
  const size = 84;
  mctx.font = f.css(size);
  const lines = String(it.text || ' ').split('\n');
  const lh = size * 1.18;
  const widths = lines.map((l) => mctx.measureText(l || ' ').width);
  const tw = Math.max(...widths, 20);
  const pad = it.style === 'pill' ? size * 0.42 : size * 0.12;
  return { f, size, lines, lh, widths, tw, th: lh * lines.length, hw: tw / 2 + pad, hh: (lh * lines.length) / 2 + pad * 0.6 };
}

function itemExtents(it) {
  if (it.kind === 'photo') {
    const im = images.get(it.img);
    const ar = im ? im.h / im.w : 1;
    const pad = it.frame ? 16 : 0;
    return { hw: it.w / 2 + pad, hh: (it.w * ar) / 2 + pad + (it.frame ? 26 : 0) };
  }
  if (it.kind === 'sticker') return { hw: 70, hh: 70 };
  const t = textLayout(it);
  return { hw: t.hw, hh: t.hh };
}

function drawItem(ctx, it, k) {
  ctx.save();
  ctx.translate(it.x, it.y);
  ctx.rotate(it.rot);
  ctx.scale(it.scale, it.scale);
  const sk = k * it.scale; // shadow sizes ignore the transform, so scale them by hand
  if (it.kind === 'photo') {
    const im = images.get(it.img);
    const src = filteredSource(it.img, it.filter);
    const ar = im ? im.h / im.w : 1;
    const w = it.w, h = it.w * ar;
    if (it.frame) {
      const p = 16;
      ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 22 * sk; ctx.shadowOffsetY = 8 * sk;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-w / 2 - p, -h / 2 - p, w + p * 2, h + p * 2 + 52);
      ctx.shadowColor = 'transparent';
      ctx.translate(0, -26);
    } else if (it.shadow !== false) {
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 20 * sk; ctx.shadowOffsetY = 6 * sk;
    }
    if (src) ctx.drawImage(src, -w / 2, -h / 2, w, h);
    else { ctx.fillStyle = '#ddd'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  } else if (it.kind === 'sticker') {
    ctx.font = '120px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8 * sk; ctx.shadowOffsetY = 3 * sk;
    ctx.fillText(it.emoji, 0, 6);
  } else {
    const t = textLayout(it);
    ctx.font = t.f.css(t.size);
    ctx.textBaseline = 'middle';
    ctx.textAlign = it.align || 'center';
    const ax = ctx.textAlign === 'left' ? -t.tw / 2 : ctx.textAlign === 'right' ? t.tw / 2 : 0;
    if (it.style === 'pill') {
      ctx.fillStyle = it.bg || '#ff5c8a';
      pathRound(ctx, -t.hw, -t.hh, t.hw * 2, t.hh * 2, Math.min(t.hh, 60));
      ctx.fill();
    }
    if (it.style === 'shadow') { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 10 * sk; ctx.shadowOffsetX = 4 * sk; ctx.shadowOffsetY = 5 * sk; }
    t.lines.forEach((line, i) => {
      const y = -t.th / 2 + t.lh * (i + 0.5);
      if (it.style === 'outline') {
        ctx.lineJoin = 'round';
        ctx.lineWidth = t.size * 0.16;
        ctx.strokeStyle = isLight(it.color) ? '#222222' : '#ffffff';
        ctx.strokeText(line, ax, y);
      }
      ctx.fillStyle = it.color || '#ffffff';
      ctx.fillText(line, ax, y);
    });
  }
  ctx.restore();
}

function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

function renderDoc(ctx, k, editing) {
  const h = H();
  ctx.save();
  ctx.scale(k, k);
  drawBackground(ctx, doc.bg, W, h);
  const rects = cellRects();
  rects.forEach((r, i) => {
    const cell = doc.cells[i] || newCell();
    ctx.save();
    pathRound(ctx, r.x, r.y, r.w, r.h, doc.radius);
    ctx.clip();
    const src = cell.img && filteredSource(cell.img, cell.filter);
    if (src) {
      const g = coverGeom(src, r, cell);
      ctx.drawImage(src, r.x + r.w / 2 - g.dw / 2 + g.ox, r.y + r.h / 2 - g.dh / 2 + g.oy, g.dw, g.dh);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (editing) {
        ctx.fillStyle = 'rgba(0,0,0,.08)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const s = Math.min(r.w, r.h) * 0.18;
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = Math.max(3, s * 0.12);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(r.x + r.w / 2 - s / 2, r.y + r.h / 2); ctx.lineTo(r.x + r.w / 2 + s / 2, r.y + r.h / 2);
        ctx.moveTo(r.x + r.w / 2, r.y + r.h / 2 - s / 2); ctx.lineTo(r.x + r.w / 2, r.y + r.h / 2 + s / 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (editing && sel && sel.kind === 'cell' && sel.i === i) {
      ctx.save();
      ctx.lineWidth = 4 / view.k;
      ctx.strokeStyle = '#ff5c8a';
      pathRound(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, doc.radius);
      ctx.stroke();
      ctx.restore();
    }
  });
  doc.items.forEach((it) => drawItem(ctx, it, k));
  if (editing && sel && sel.kind === 'item') {
    const it = doc.items.find((x) => x.id === sel.id);
    if (it) drawSelection(ctx, it);
  }
  ctx.restore();
}

function handlePoints(it) {
  const e = itemExtents(it);
  const c = Math.cos(it.rot), s = Math.sin(it.rot);
  const pt = (lx, ly) => ({ x: it.x + (lx * c - ly * s) * it.scale, y: it.y + (lx * s + ly * c) * it.scale });
  return { e, del: pt(-e.hw, -e.hh), rot: pt(e.hw, e.hh), corners: [pt(-e.hw, -e.hh), pt(e.hw, -e.hh), pt(e.hw, e.hh), pt(-e.hw, e.hh)] };
}

function drawSelection(ctx, it) {
  const hp = handlePoints(it);
  const u = 1 / view.k; // one CSS pixel in design units
  ctx.save();
  ctx.lineWidth = 2 * u;
  ctx.setLineDash([8 * u, 6 * u]);
  ctx.strokeStyle = '#ff5c8a';
  ctx.beginPath();
  hp.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
  const knob = (p, label, color) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15 * u, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = 4;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${18 * u}px -apple-system, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, p.x, p.y + 1 * u);
  };
  knob(hp.del, '×', '#ff3b30');
  knob(hp.rot, '⤡', '#ff5c8a');
  ctx.restore();
}

async function renderBlob(longSide, type = 'image/jpeg', q = 0.92) {
  const h = H();
  const k = longSide / Math.max(W, h);
  const c = document.createElement('canvas');
  c.width = Math.round(W * k);
  c.height = Math.round(h * k);
  renderDoc(c.getContext('2d'), k, false);
  const blob = await canvasBlob(c, type, q);
  c.width = c.height = 0;
  return blob;
}

// ---------------------------------------------------------------- view

const cv = $('#cv');
const ctx = cv.getContext('2d');
const view = { k: 1, dpr: 1 };
let raf = 0;

function fit() {
  if (!doc) return;
  const st = $('#stage');
  const aw = st.clientWidth - 24, ah = st.clientHeight - 24;
  const h = H();
  view.k = Math.max(0.05, Math.min(aw / W, ah / h));
  view.dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = `${Math.round(W * view.k)}px`;
  cv.style.height = `${Math.round(h * view.k)}px`;
  cv.width = Math.round(W * view.k * view.dpr);
  cv.height = Math.round(h * view.k * view.dpr);
  render();
}

function render() {
  raf = 0;
  if (!doc) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  renderDoc(ctx, view.k * view.dpr, true);
}
function requestRender() { if (!raf) raf = requestAnimationFrame(render); }

new ResizeObserver(() => fit()).observe($('#stage'));
document.fonts && document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', requestRender);

// iOS: keep the editor inside the visible viewport when the keyboard is up.
function syncViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
  document.documentElement.style.setProperty('--vvt', `${vv.offsetTop}px`);
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', syncViewport);
  visualViewport.addEventListener('scroll', syncViewport);
}

// ---------------------------------------------------------------- hit tests

function toDesign(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / view.k, y: (e.clientY - r.top) / view.k };
}

function hitItem(p) {
  for (let i = doc.items.length - 1; i >= 0; i--) {
    const it = doc.items[i];
    const e = itemExtents(it);
    const dx = p.x - it.x, dy = p.y - it.y;
    const c = Math.cos(-it.rot), s = Math.sin(-it.rot);
    const lx = (dx * c - dy * s) / it.scale, ly = (dx * s + dy * c) / it.scale;
    const slop = 10 / view.k / it.scale;
    if (Math.abs(lx) <= e.hw + slop && Math.abs(ly) <= e.hh + slop) return it;
  }
  return null;
}

function hitCell(p) {
  const rects = cellRects();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return i;
  }
  return -1;
}

function hitHandle(it, p) {
  const hp = handlePoints(it);
  const rad = 24 / view.k;
  if (Math.hypot(p.x - hp.del.x, p.y - hp.del.y) <= rad) return 'del';
  if (Math.hypot(p.x - hp.rot.x, p.y - hp.rot.y) <= rad) return 'rot';
  return null;
}

const selItem = () => (sel && sel.kind === 'item' ? doc.items.find((x) => x.id === sel.id) : null);
const selCell = () => (sel && sel.kind === 'cell' ? doc.cells[sel.i] : null);

// ---------------------------------------------------------------- gestures

const ptrs = new Map();
let gest = null;
let lastTap = { t: 0, id: null };

function pinchInfo() {
  const [a, b] = [...ptrs.values()];
  return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, a: Math.atan2(b.y - a.y, b.x - a.x), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

function startSingle(p) {
  const it = selItem();
  if (it) {
    const h = hitHandle(it, p);
    if (h === 'del') { removeItem(it.id); gest = { type: 'none' }; return; }
    if (h === 'rot') {
      gest = { type: 'handle', it, ang0: Math.atan2(p.y - it.y, p.x - it.x), d0: Math.hypot(p.x - it.x, p.y - it.y) || 1, rot0: it.rot, s0: it.scale };
      return;
    }
  }
  const hit = hitItem(p);
  if (hit) {
    sel = { kind: 'item', id: hit.id };
    gest = { type: 'move', it: hit, p0: p, x0: hit.x, y0: hit.y, moved: false, t0: Date.now() };
  } else {
    const ci = hitCell(p);
    if (ci >= 0) {
      sel = { kind: 'cell', i: ci };
      const c = doc.cells[ci];
      gest = { type: 'pan', ci, p0: p, ox0: c.ox, oy0: c.oy, moved: false, t0: Date.now() };
    } else {
      sel = null;
      gest = { type: 'none', p0: p, moved: false, t0: Date.now() };
    }
  }
  updateCtx();
}

function startPinch() {
  const pi = pinchInfo();
  const it = selItem();
  if (it) { gest = { type: 'pinch', it, ...pi, s0: it.scale, rot0: it.rot, x0: it.x, y0: it.y }; return; }
  const c = selCell();
  if (c) { gest = { type: 'zoom', cell: c, ...pi, z0: c.zoom, ox0: c.ox, oy0: c.oy }; return; }
  gest = { type: 'none', moved: true };
}

function clampCell(ci) {
  const c = doc.cells[ci];
  const r = cellRects()[ci];
  const src = c && c.img && filteredSource(c.img, c.filter);
  if (!src || !r) return;
  const g = coverGeom(src, r, c);
  c.ox = g.ox; c.oy = g.oy;
}

cv.addEventListener('pointerdown', (e) => {
  if (!doc) return;
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, toDesign(e));
  closePanelIfTransient();
  if (ptrs.size === 1) startSingle(ptrs.get(e.pointerId));
  else if (ptrs.size === 2) startPinch();
  requestRender();
});

cv.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId) || !gest) return;
  const p = toDesign(e);
  ptrs.set(e.pointerId, p);
  const moved = gest.p0 && Math.hypot(p.x - gest.p0.x, p.y - gest.p0.y) * view.k > 6;
  if (moved) gest.moved = true;
  if (gest.type === 'move' && gest.moved) {
    gest.it.x = gest.x0 + (p.x - gest.p0.x);
    gest.it.y = gest.y0 + (p.y - gest.p0.y);
  } else if (gest.type === 'pan' && gest.moved) {
    const c = doc.cells[gest.ci];
    c.ox = gest.ox0 + (p.x - gest.p0.x);
    c.oy = gest.oy0 + (p.y - gest.p0.y);
    clampCell(gest.ci);
  } else if (gest.type === 'handle') {
    const it = gest.it;
    it.rot = gest.rot0 + (Math.atan2(p.y - it.y, p.x - it.x) - gest.ang0);
    it.scale = clamp(gest.s0 * (Math.hypot(p.x - it.x, p.y - it.y) / gest.d0), 0.15, 8);
    it.rot = snapAngle(it.rot);
  } else if ((gest.type === 'pinch' || gest.type === 'zoom') && ptrs.size >= 2) {
    const pi = pinchInfo();
    if (gest.type === 'pinch') {
      const it = gest.it;
      it.scale = clamp(gest.s0 * (pi.d / gest.d), 0.15, 8);
      it.rot = snapAngle(gest.rot0 + (pi.a - gest.a));
      it.x = gest.x0 + (pi.mx - gest.mx);
      it.y = gest.y0 + (pi.my - gest.my);
    } else {
      const c = gest.cell;
      c.zoom = clamp(gest.z0 * (pi.d / gest.d), 1, 6);
      c.ox = gest.ox0 + (pi.mx - gest.mx);
      c.oy = gest.oy0 + (pi.my - gest.my);
      clampCell(sel.i);
    }
  }
  requestRender();
});

function snapAngle(a) {
  const q = Math.PI / 2;
  const n = Math.round(a / q) * q;
  return Math.abs(a - n) < 0.05 ? n : a;
}

function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!gest) return;
  if (ptrs.size === 1 && (gest.type === 'pinch' || gest.type === 'zoom')) {
    // one finger left: carry on as a drag from where it is, without a jump
    const p = [...ptrs.values()][0];
    if (gest.type === 'pinch') gest = { type: 'move', it: gest.it, p0: p, x0: gest.it.x, y0: gest.it.y, moved: true };
    else gest = { type: 'pan', ci: sel.i, p0: p, ox0: gest.cell.ox, oy0: gest.cell.oy, moved: true };
    return;
  }
  if (ptrs.size) return;
  const g = gest;
  gest = null;
  const tap = !g.moved && g.t0 && Date.now() - g.t0 < 450;
  if (tap && e.type === 'pointerup') {
    if (g.type === 'pan' && !doc.cells[g.ci].img) {
      pickPhotos({ cell: g.ci });
    } else if (g.type === 'move') {
      const now = Date.now();
      if (lastTap.id === g.it.id && now - lastTap.t < 380 && g.it.kind === 'text') openText(g.it);
      lastTap = { t: now, id: g.it.id };
    }
  }
  commit();
  updateCtx();
  requestRender();
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);

cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(-e.deltaY * 0.002);
  const it = selItem();
  if (it) { if (e.shiftKey) it.rot += e.deltaY * 0.003; else it.scale = clamp(it.scale * f, 0.15, 8); }
  else if (selCell()) { const c = selCell(); c.zoom = clamp(c.zoom * f, 1, 6); clampCell(sel.i); }
  requestRender();
  clearTimeout(cv._wt);
  cv._wt = setTimeout(commit, 300);
}, { passive: false });

// iOS Safari fires gesture events alongside pointers; swallow them so the page never zooms.
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault()));

// ---------------------------------------------------------------- item actions

function addItem(it) {
  const h = H();
  const jitter = () => (Math.random() - 0.5) * 120;
  const item = { id: uid(), x: W / 2 + jitter(), y: h / 2 + jitter(), rot: (Math.random() - 0.5) * 0.25, scale: 1, ...it };
  doc.items.push(item);
  sel = { kind: 'item', id: item.id };
  commit();
  updateCtx();
  requestRender();
  return item;
}

function removeItem(id) {
  doc.items = doc.items.filter((x) => x.id !== id);
  sel = null;
  commit();
  updateCtx();
  requestRender();
}

function reorder(id, dir) {
  const i = doc.items.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [it] = doc.items.splice(i, 1);
  if (dir === 'front') doc.items.push(it); else doc.items.unshift(it);
  commit();
  requestRender();
}

function duplicate(id) {
  const it = doc.items.find((x) => x.id === id);
  if (!it) return;
  const copy = { ...JSON.parse(JSON.stringify(it)), id: uid(), x: it.x + 40, y: it.y + 40 };
  doc.items.push(copy);
  sel = { kind: 'item', id: copy.id };
  commit();
  updateCtx();
  requestRender();
}

// ---------------------------------------------------------------- photos

const fileInput = $('#file');
let pickTarget = null;

function pickPhotos(target = null) {
  pickTarget = target;
  fileInput.multiple = !(target && (target.cell !== undefined || target.replace));
  fileInput.value = '';
  fileInput.click();
}

fileInput.addEventListener('change', async () => {
  const files = [...fileInput.files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
  const target = pickTarget;
  pickTarget = null;
  if (!files.length) return;
  toast(files.length > 1 ? `Adding ${files.length} photos…` : 'Adding photo…');
  const ids = [];
  for (const f of files) {
    try { ids.push(await importFile(f)); } catch (err) { toast(`Skipped ${f.name}: ${err.message}`); }
  }
  if (!ids.length) return;
  if (target && target.replace) {
    const it = doc.items.find((x) => x.id === target.replace);
    if (it) { it.img = ids[0]; it.filter = 'none'; }
  } else {
    let queue = ids;
    if (target && target.cell !== undefined) {
      Object.assign(doc.cells[target.cell], { ...newCell(), img: queue[0] });
      sel = { kind: 'cell', i: target.cell };
      queue = queue.slice(1);
    }
    const n = layoutById(doc.layout).cells.length;
    for (let i = 0; i < n && queue.length; i++) {
      if (!doc.cells[i].img) { Object.assign(doc.cells[i], { ...newCell(), img: queue.shift() }); }
    }
    for (const id of queue) addItem({ kind: 'photo', img: id, w: 420, filter: 'none', frame: false });
  }
  toast('');
  commit();
  updateCtx();
  requestRender();
});

// ---------------------------------------------------------------- context bar

function ctxButtons(list) {
  const bar = $('#ctxbar');
  bar.innerHTML = '';
  list.forEach(([label, fn, cls]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  });
  bar.hidden = !list.length;
}

function updateCtx() {
  if (!doc) return;
  const it = selItem();
  const c = selCell();
  if (it) {
    const common = [['Duplicate', () => duplicate(it.id)], ['To front', () => reorder(it.id, 'front')], ['To back', () => reorder(it.id, 'back')], ['Delete', () => removeItem(it.id), 'danger']];
    if (it.kind === 'text') ctxButtons([['Edit text', () => openText(it)], ...common]);
    else if (it.kind === 'photo') ctxButtons([
      ['Filters', () => openFilters()],
      [it.frame ? 'No frame' : 'Frame', () => { it.frame = !it.frame; commit(); requestRender(); updateCtx(); }],
      ['Replace', () => pickPhotos({ replace: it.id })],
      ...common,
    ]);
    else ctxButtons(common);
  } else if (c) {
    if (c.img) ctxButtons([
      ['Replace', () => pickPhotos({ cell: sel.i })],
      ['Filters', () => openFilters()],
      ['Fit', () => { Object.assign(c, { zoom: 1, ox: 0, oy: 0 }); commit(); requestRender(); }],
      ['Swap ⇄', () => swapCell(sel.i)],
      ['Remove', () => { Object.assign(c, newCell()); commit(); requestRender(); updateCtx(); }, 'danger'],
    ]);
    else ctxButtons([['Add photo', () => pickPhotos({ cell: sel.i })]]);
  } else {
    ctxButtons([]);
  }
}

function swapCell(i) {
  const n = layoutById(doc.layout).cells.length;
  if (n < 2) return;
  const j = (i + 1) % n;
  [doc.cells[i], doc.cells[j]] = [doc.cells[j], doc.cells[i]];
  doc.cells[i].ox = doc.cells[i].oy = doc.cells[j].ox = doc.cells[j].oy = 0;
  sel = { kind: 'cell', i: j };
  commit();
  updateCtx();
  requestRender();
}

// ---------------------------------------------------------------- panels

let panelTool = null;
let panelTransient = false;

function openPanel(tool, title, build, transient = false) {
  panelTool = tool;
  panelTransient = transient;
  $('#panel-title').textContent = title;
  const body = $('#panel-body');
  body.innerHTML = '';
  build(body);
  $('#panel').hidden = false;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
}

function closePanel() {
  if ($('#panel').hidden) return;
  const was = panelTool;
  $('#panel').hidden = true;
  panelTool = null;
  document.querySelectorAll('#tools button').forEach((b) => b.classList.remove('on'));
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (was === 'text') {
    const it = selItem();
    if (it && it.kind === 'text' && !String(it.text).trim()) removeItem(it.id);
  }
  commit();
}
function closePanelIfTransient() { if (panelTransient) closePanel(); }
$('#panel-close').addEventListener('click', closePanel);

function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'on') Object.entries(v).forEach(([ev, fn]) => e.addEventListener(ev, fn));
    else if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  kids.forEach((c) => c && e.appendChild(c));
  return e;
}

function rebuild() { if (panelTool && TOOLS[panelTool]) TOOLS[panelTool](); }

function layoutThumb(l) {
  const b = el('button', { type: 'button', class: `lay${doc.layout === l.id ? ' on' : ''}`, 'aria-label': `Layout ${l.id}` });
  if (!l.cells.length) b.appendChild(el('em', { text: 'Free' }));
  l.cells.forEach(([x, y, w, h]) => b.appendChild(el('span', { style: `left:calc(${x * 100}% + 3px);top:calc(${y * 100}% + 3px);width:calc(${w * 100}% - 4px);height:calc(${h * 100}% - 4px)` })));
  b.addEventListener('click', () => setLayout(l.id));
  return b;
}

function setLayout(id) {
  if (id === doc.layout) return;
  if (id === 'free') {
    // freestyle keeps the photos: they become loose prints you can move around
    const n = layoutById(doc.layout).cells.length;
    doc.cells.slice(0, n).forEach((c, i) => {
      if (!c.img) return;
      const r = cellRects()[i];
      doc.items.unshift({ id: uid(), kind: 'photo', img: c.img, filter: c.filter, w: 380, frame: true, x: r.x + r.w / 2, y: r.y + r.h / 2, rot: (Math.random() - 0.5) * 0.4, scale: 1 });
    });
    doc.cells = [];
  }
  doc.layout = id;
  ensureCells();
  sel = null;
  commit();
  updateCtx();
  requestRender();
  rebuild();
}

const TOOLS = {
  layout() {
    openPanel('layout', 'Layout', (body) => {
      body.appendChild(el('div', { class: 'layouts' }, LAYOUTS.map(layoutThumb)));
    });
  },
  photos() {
    closePanel();
    pickPhotos();
  },
  stickers() {
    openPanel('stickers', 'Stickers', (body) => {
      for (const [name, list] of Object.entries(STICKERS)) {
        body.appendChild(el('div', { class: 'sec', text: name }));
        body.appendChild(el('div', { class: 'emoji' }, list.split(' ').map((em) => el('button', {
          type: 'button', text: em,
          on: { click: () => { addItem({ kind: 'sticker', emoji: em, scale: 0.9 + Math.random() * 0.3 }); closePanel(); } },
        }))));
      }
    });
  },
  text() {
    const it = addItem({ kind: 'text', text: '', font: 'sans', color: '#ffffff', style: 'outline', bg: '#ff5c8a', align: 'center', rot: 0 });
    openText(it, true);
  },
  background() {
    openPanel('background', 'Backdrop', (body) => {
      const isOn = (b) => JSON.stringify(b) === JSON.stringify(doc.bg);
      const set = (b) => { doc.bg = b; commit(); requestRender(); rebuild(); };
      body.appendChild(el('div', { class: 'sec', text: 'Colors' }));
      const sw = COLORS.map((c) => el('button', { type: 'button', class: `sw${isOn({ kind: 'color', c }) ? ' on' : ''}`, style: `background:${c}`, 'aria-label': c, on: { click: () => set({ kind: 'color', c }) } }));
      const pick = el('input', { type: 'color', value: doc.bg.kind === 'color' ? doc.bg.c : '#ffffff', 'aria-label': 'Any color' });
      pick.addEventListener('input', () => { doc.bg = { kind: 'color', c: pick.value }; requestRender(); });
      pick.addEventListener('change', () => commit());
      sw.push(el('label', { class: 'sw custom' }, [pick]));
      body.appendChild(el('div', { class: 'swatches' }, sw));
      body.appendChild(el('div', { class: 'sec', text: 'Gradients' }));
      body.appendChild(el('div', { class: 'tiles' }, GRADIENTS.map(([a, b]) => {
        const g = { kind: 'gradient', a, b };
        return el('button', { type: 'button', class: `tile${isOn(g) ? ' on' : ''}`, style: `background:linear-gradient(135deg,${a},${b})`, on: { click: () => set(g) } });
      })));
      body.appendChild(el('div', { class: 'sec', text: 'Patterns' }));
      body.appendChild(el('div', { class: 'tiles' }, PATTERNS.map((p) => {
        const g = { kind: 'pattern', ...p };
        const c = el('canvas', { width: 128, height: 128, class: `tile${isOn(g) ? ' on' : ''}` });
        const x = c.getContext('2d');
        x.scale(128 / 300, 128 / 300);
        drawBackground(x, g, 300, 300);
        const b = el('button', { type: 'button', class: `tile${isOn(g) ? ' on' : ''}`, style: 'overflow:hidden;padding:0', on: { click: () => set(g) } });
        c.style.cssText = 'width:100%;height:100%;display:block;border:0;border-radius:0';
        b.appendChild(c);
        return b;
      })));
    });
  },
  border() {
    openPanel('border', 'Border', (body) => {
      const slider = (label, key, max) => {
        const r = el('input', { type: 'range', min: 0, max, value: doc[key] });
        r.addEventListener('input', () => { doc[key] = Number(r.value); cellRects().forEach((_, i) => clampCell(i)); requestRender(); });
        r.addEventListener('change', () => commit());
        return el('div', { class: 'row' }, [el('label', { text: label }), r]);
      };
      body.appendChild(slider('Spacing', 'spacing', 70));
      body.appendChild(slider('Corners', 'radius', 120));
      body.appendChild(el('p', { class: 'note', text: 'The border shows your backdrop. Pick a color or pattern under Backdrop.' }));
    });
  },
  size() {
    openPanel('size', 'Size', (body) => {
      body.appendChild(el('div', { class: 'chips' }, RATIOS.map((r) => el('button', {
        type: 'button', class: `chip${doc.ratio === r.id ? ' on' : ''}`, text: `${r.label} ${r.id}`,
        on: { click: () => { doc.ratio = r.id; fit(); cellRects().forEach((_, i) => clampCell(i)); commit(); rebuild(); } },
      }))));
    });
  },
};

$('#tools').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tool]');
  if (!b) return;
  if (panelTool === b.dataset.tool) { closePanel(); return; }
  TOOLS[b.dataset.tool]();
});

function openFilters() {
  const it = selItem();
  const c = selCell();
  const target = it && it.kind === 'photo' ? it : c && c.img ? c : null;
  if (!target) return;
  openPanel('filters', 'Filters', (body) => {
    body.appendChild(el('div', { class: 'chips' }, FILTERS.map((f) => el('button', {
      type: 'button', class: `chip${(target.filter || 'none') === f.id ? ' on' : ''}`, text: f.label,
      on: { click: () => { target.filter = f.id; commit(); requestRender(); openFilters(); } },
    }))));
  });
}

function openText(it, fresh = false) {
  sel = { kind: 'item', id: it.id };
  updateCtx();
  openPanel('text', fresh ? 'Add text' : 'Text', (body) => {
    const ta = el('textarea', { class: 'txt', rows: 2, placeholder: 'Type something…' });
    ta.value = it.text;
    ta.addEventListener('input', () => { it.text = ta.value; requestRender(); });
    body.appendChild(ta);
    body.appendChild(el('div', { class: 'sec', text: 'Font' }));
    body.appendChild(el('div', { class: 'chips fonts' }, FONTS.map((f) => {
      const b = el('button', { type: 'button', class: `chip${it.font === f.id ? ' on' : ''}`, text: f.label, style: `font:${f.css(18)}` });
      b.addEventListener('click', () => {
        it.font = f.id;
        if (document.fonts) document.fonts.load(f.css(84)).then(requestRender, () => {});
        body.querySelectorAll('.fonts .chip').forEach((x) => x.classList.toggle('on', x === b));
        requestRender();
      });
      return b;
    })));
    body.appendChild(el('div', { class: 'sec', text: 'Style' }));
    const styles = [['plain', 'Plain'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['pill', 'Label']];
    body.appendChild(el('div', { class: 'chips styles' }, styles.map(([id, label]) => {
      const b = el('button', { type: 'button', class: `chip${it.style === id ? ' on' : ''}`, text: label });
      b.addEventListener('click', () => { it.style = id; body.querySelectorAll('.styles .chip').forEach((x) => x.classList.toggle('on', x === b)); requestRender(); });
      return b;
    })));
    const swatchRow = (title, key) => {
      body.appendChild(el('div', { class: 'sec', text: title }));
      const row = el('div', { class: 'swatches' });
      COLORS.forEach((c) => {
        const b = el('button', { type: 'button', class: `sw${it[key] === c ? ' on' : ''}`, style: `background:${c}`, 'aria-label': c });
        b.addEventListener('click', () => { it[key] = c; row.querySelectorAll('.sw').forEach((x) => x.classList.toggle('on', x === b)); requestRender(); });
        row.appendChild(b);
      });
      body.appendChild(row);
    };
    swatchRow('Color', 'color');
    swatchRow('Label color', 'bg');
    body.appendChild(el('div', { class: 'sec', text: 'Align' }));
    body.appendChild(el('div', { class: 'chips aligns' }, [['left', 'Left'], ['center', 'Center'], ['right', 'Right']].map(([id, label]) => {
      const b = el('button', { type: 'button', class: `chip${(it.align || 'center') === id ? ' on' : ''}`, text: label });
      b.addEventListener('click', () => { it.align = id; body.querySelectorAll('.aligns .chip').forEach((x) => x.classList.toggle('on', x === b)); requestRender(); });
      return b;
    })));
    if (fresh) {
      body.appendChild(el('div', { class: 'sec', text: 'Quick picks' }));
      body.appendChild(el('div', { class: 'chips' }, TEXT_PRESETS.map((p) => el('button', {
        type: 'button', class: 'chip', text: p.text, style: `font:${fontById(p.font).css(16)}`,
        on: { click: () => { Object.assign(it, p); ta.value = p.text; requestRender(); rebuildText(it); } },
      }))));
    }
    setTimeout(() => ta.focus(), 50);
  });
}
function rebuildText(it) { openText(it, false); }

// Canvas text never asks the browser to fetch a web font, so ask for the ones in use.
function loadFonts() {
  if (!document.fonts || !doc) return Promise.resolve();
  const ids = new Set(doc.items.filter((i) => i.kind === 'text').map((i) => i.font));
  return Promise.all([...ids].map((id) => document.fonts.load(fontById(id).css(84)).catch(() => {}))).then(requestRender);
}

// ---------------------------------------------------------------- export

$('#export').addEventListener('click', async () => {
  sel = null;
  updateCtx();
  requestRender();
  openPanel('export', 'Save your collage', (body) => body.appendChild(el('p', { class: 'note', text: 'Making your picture…' })));
  await readyAllFilters();
  await loadFonts();
  const blob = await renderBlob(EXPORT_LONG, 'image/jpeg', 0.92);
  const name = `collage-${new Date().toISOString().slice(0, 10)}.jpg`;
  const file = new File([blob], name, { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  saveNow();
  openPanel('export', 'Save your collage', (body) => {
    body.appendChild(el('img', { class: 'preview', src: url, alt: 'Your collage' }));
    const actions = el('div', { class: 'actions' });
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    if (canShare) {
      actions.appendChild(el('button', {
        type: 'button', class: 'big-btn', text: 'Save to Photos / Share',
        on: { click: () => navigator.share({ files: [file] }).catch(() => {}) },
      }));
    }
    actions.appendChild(el('a', { href: url, download: name, text: canShare ? 'Download file instead' : 'Download picture' }));
    body.appendChild(actions);
    body.appendChild(el('p', { class: 'note', text: canShare ? 'Tip: in the share sheet pick "Save Image".' : 'Or press and hold the picture to save it.' }));
  });
});

// ---------------------------------------------------------------- home

function toast(msg) {
  let t = $('#toast');
  if (!t) {
    t = el('div', { id: 'toast', style: 'position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);background:#000c;color:#fff;padding:8px 14px;border-radius:99px;font-size:14px;z-index:50;pointer-events:none' });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.hidden = !msg;
  clearTimeout(t._h);
  if (msg) t._h = setTimeout(() => { t.hidden = true; }, 2500);
}

let thumbURLs = [];
async function showHome() {
  if (doc) await saveNow();
  doc = null;
  sel = null;
  closePanel();
  $('#editor').hidden = true;
  $('#home').hidden = false;
  document.body.classList.remove('editing');
  thumbURLs.forEach(URL.revokeObjectURL);
  thumbURLs = [];
  const list = (await allProjects()).sort((a, b) => b.updated - a.updated);
  const box = $('#projects');
  box.innerHTML = '';
  $('#mine-title').hidden = !list.length;
  list.forEach((p) => {
    const u = p.thumb ? URL.createObjectURL(p.thumb) : '';
    if (u) thumbURLs.push(u);
    const card = el('div', { class: 'proj', role: 'button', tabindex: '0' }, [
      el('img', { src: u, alt: '' }),
      el('small', { text: new Date(p.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) }),
    ]);
    card.addEventListener('click', () => openProject(p.id));
    const del = el('button', { type: 'button', class: 'del', 'aria-label': 'Delete collage', text: '×' });
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this collage? This cannot be undone.')) return;
      await delProject(p.id);
      await gcImages();
      showHome();
    });
    card.appendChild(del);
    box.appendChild(card);
  });
  gcImages();
}

async function gcImages() {
  const used = new Set();
  (await allProjects()).forEach((p) => {
    p.doc.cells.forEach((c) => c.img && used.add(c.img));
    p.doc.items.forEach((i) => i.img && used.add(i.img));
  });
  if (doc) {
    doc.cells.forEach((c) => c.img && used.add(c.img));
    doc.items.forEach((i) => i.img && used.add(i.img));
    undoStack.concat(redoStack).forEach((j) => (j.match(/"img":"[^"]+"/g) || []).forEach((m) => used.add(m.slice(7, -1))));
  }
  for (const k of await imageKeys()) if (!used.has(k)) { await delImage(k); images.delete(k); }
}

function enterEditor() {
  $('#home').hidden = true;
  $('#editor').hidden = false;
  document.body.classList.add('editing');
  undoStack = [];
  redoStack = [];
  lastJSON = JSON.stringify(doc);
  syncUndo();
  syncViewport();
  fit();
  updateCtx();
}

async function openProject(id) {
  const p = await getProject(id);
  if (!p) return;
  doc = p.doc;
  ensureCells();
  await Promise.all([...doc.cells.map((c) => ensureImage(c.img)), ...doc.items.map((i) => ensureImage(i.img))]);
  loadFonts();
  enterEditor();
  history.pushState({ editor: doc.id }, '', `#${doc.id}`);
}

function newProject() {
  doc = newDoc();
  ensureCells();
  enterEditor();
  history.pushState({ editor: doc.id }, '', `#${doc.id}`);
  TOOLS.layout();
}

$('#new').addEventListener('click', newProject);
$('#back').addEventListener('click', () => { if (history.state && history.state.editor) history.back(); else showHome(); });
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
window.addEventListener('popstate', () => { if (doc) showHome(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && doc) saveNow(); });
document.addEventListener('keydown', (e) => {
  if (!doc || e.target.closest('textarea, input')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.key === 'Backspace' || e.key === 'Delete') && selItem()) removeItem(sel.id);
});

const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (/iPhone|iPad|iPod/.test(navigator.userAgent) && !standalone) $('#a2hs').hidden = false;

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async () => {
  const id = location.hash.slice(1);
  if (id && (await getProject(id))) { history.replaceState(null, '', location.pathname); await showHome(); openProject(id); }
  else { if (id) history.replaceState(null, '', location.pathname); showHome(); }
})();
