import { $, mulberry32 } from './utils.js';

const W = 96, H = 72, N = W * H, TICKS = 72, CELL_HA = 0.25, CELL_M = 50;

// Wind "from" direction -> angle the fire is pushed toward (canvas y points down)
const FROM = { N: 90, NE: 135, E: 180, SE: -135, S: -90, SW: -45, W: 0, NW: 45 };
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const COMPASS = ['East', 'South-east', 'South', 'South-west', 'West', 'North-west', 'North', 'North-east'];
const PENCIL = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.5 3.5l3 3L7 16H4v-3z"/><path d="M11.5 5.5l3 3"/></svg>';
const CHECK = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M6.8 10.2l2.2 2.2 4.2-4.4"/></svg>';

// Built-up areas (no fuel) and roads, in map fractions
const URBAN = [
  [[0, 0], [0.075, 0], [0.11, 1], [0, 1]],
  [[0.075, 0.53], [0.22, 0.5], [0.28, 0.975], [0.45, 0.965], [0.46, 1], [0.1, 1]]
];
const ROADS = [
  [0.24, 0, 0.25, 0.08, 0.32, 0.11, 0.42, 0.12, 0.48, 0.13, 0.5, 0.14, 0.52, 0.13, 0.56, 0.08, 0.6, 0.03, 0.64, 0],
  [0.5, 0.135, 0.53, 0.22, 0.5, 0.34, 0.44, 0.44, 0.42, 0.5, 0.46, 0.56, 0.5, 0.58, 0.52, 0.66, 0.55, 0.72, 0.58, 0.76, 0.65, 0.8, 0.72, 0.68, 0.79, 0.58],
  [0.87, 0, 0.9, 0.08, 0.93, 0.14, 0.92, 0.2, 0.88, 0.24, 0.84, 0.28, 0.8, 0.36, 0.78, 0.45, 0.79, 0.52, 0.79, 0.58, 0.82, 0.65, 0.92, 0.7, 0.98, 0.8],
  [0.92, 0.2, 0.96, 0.25, 0.99, 0.27, 1, 0.28],
  [0.79, 0.58, 0.74, 0.66, 0.7, 0.72, 0.64, 0.78],
  [0.55, 1, 0.56, 0.97, 0.6, 0.95, 0.7, 0.945, 0.8, 0.94, 0.9, 0.935, 1, 0.93],
  [0, 0.33, 0.02, 0.325, 0.05, 0.315, 0.08, 0.31],
  [0, 0.36, 0.03, 0.35, 0.05, 0.34, 0.08, 0.33]
];

/** Point-in-polygon test (ray casting). */
function inPoly(px, py, poly) {
  let inside = false;
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const xi = poly[a][0], yi = poly[a][1], xj = poly[b][0], yj = poly[b][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * FireAway fire-spread sandbox: a cellular automaton over generated terrain,
 * with click-to-ignite, Mapbox-Draw-style containment lines, a timeline
 * slider, weather inputs, spread bars and a log of drawn lines.
 * @param {{ reduceMotion: boolean }} options
 * @returns {{ redraw: () => void }} redraw re-measures and repaints the canvas (e.g. after fonts load)
 */
export function initFireSim({ reduceMotion }) {
  const cvs = $('fa-canvas');
  if (!cvs) return { redraw() {} };

  // Cell states: 0 fuel, 1 burning, 2 burnt, 3 built-up, 5 containment line
  const fuel = new Float32Array(N), kind = new Uint8Array(N), base = new Uint8Array(N);
  let frames = [], ages = [], view = 0, anim = null, pending = null;
  let lines = [], ignitions = [], drawMode = false, drawing = null;
  const baseCanvas = document.createElement('canvas');
  const ui = {
    run: $('fa-run'), runL: $('fa-run-l'), draw: $('fa-draw'), clear: $('fa-clear'), mode: $('fa-mode'),
    time: $('fa-time'), auto: $('fa-auto'), slider: $('fa-slider'), note: $('fa-note'),
    wind: $('fa-wind'), dir: $('fa-dir'), temp: $('fa-temp'), hum: $('fa-hum'),
    windV: $('fa-wind-v'), windL: $('fa-wind-l'), tempV: $('fa-temp-v'), humV: $('fa-hum-v'), danger: $('fa-danger'),
    bars: Array.from(document.querySelectorAll('.fa-bar')), lines: $('fa-lines')
  };

  function terrain() {
    const r = mulberry32(7), p1 = r() * 6.28, p2 = r() * 6.28, p3 = r() * 6.28;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = (x + 0.5) / W, v = (y + 0.5) / H;
      const urban = inPoly(u, v, URBAN[0]) || inPoly(u, v, URBAN[1]);
      const f = 0.62 + 0.1 * Math.sin(x * 0.11 + p1) * Math.cos(y * 0.13 + p2) + 0.06 * Math.sin((x - y) * 0.07 + p3) + (r() - 0.5) * 0.45;
      kind[i] = urban ? 3 : 0;
      fuel[i] = urban ? 0 : Math.max(0.08, Math.min(1, f));
      base[i] = kind[i];
    }
  }

  /** Paints the static map (ground, built-up areas, roads, label) to an offscreen canvas. */
  function paintBase() {
    const w = cvs.width, h = cvs.height;
    baseCanvas.width = w; baseCanvas.height = h;
    const c = baseCanvas.getContext('2d');
    c.fillStyle = '#46595b'; c.fillRect(0, 0, w, h);
    c.lineWidth = Math.max(1.2, w / 420); c.strokeStyle = 'rgba(26, 30, 33, 0.85)';
    URBAN.forEach((poly) => {
      c.beginPath();
      poly.forEach((p, k) => { if (k) c.lineTo(p[0] * w, p[1] * h); else c.moveTo(p[0] * w, p[1] * h); });
      c.closePath(); c.fillStyle = '#414b5c'; c.fill(); c.stroke();
    });
    ROADS.forEach((R) => {
      c.beginPath(); c.moveTo(R[0] * w, R[1] * h);
      for (let k = 2; k + 5 < R.length; k += 6) c.bezierCurveTo(R[k] * w, R[k + 1] * h, R[k + 2] * w, R[k + 3] * h, R[k + 4] * w, R[k + 5] * h);
      if ((R.length - 2) % 6) c.lineTo(R[R.length - 2] * w, R[R.length - 1] * h);
      c.stroke();
    });
    c.fillStyle = '#9bd6b1'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `500 ${Math.round(w / 30)}px "Exo 2", system-ui, sans-serif`;
    c.fillText('Nature Reserve', w * 0.68, h * 0.08);
  }

  function params() {
    const a = FROM[ui.dir.value] * Math.PI / 180, spd = +ui.wind.value, t = +ui.temp.value, hu = +ui.hum.value;
    return {
      wx: Math.cos(a), wy: Math.sin(a), s: spd / 12,
      hf: Math.max(0.3, Math.min(1.3, 1.35 - hu / 100 * 1.1)), tf: 0.8 + t / 100,
      ember: spd >= 25 ? 0.0012 * spd / 12 : 0
    };
  }
  /** Advances the automaton one tick; returns [nextStates, nextAges]. */
  function step(st, age, r, P) {
    const next = st.slice(), nage = age.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (st[i] !== 1) continue;
      nage[i] = age[i] + 1;
      if (nage[i] >= 3) next[i] = 2;
      for (let d = 0; d < 8; d++) {
        const nx = x + NB[d][0], ny = y + NB[d][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (st[j] !== 0 || next[j] !== 0) continue;
        const diag = d > 3;
        const align = (NB[d][0] * P.wx + NB[d][1] * P.wy) / (diag ? 1.4142 : 1);
        const wf = Math.max(0.3, 1 + align * P.s * 0.5);
        if (r() < 0.22 * fuel[j] * wf * P.hf * P.tf * (diag ? 0.7 : 1)) { next[j] = 1; nage[j] = 0; }
      }
      if (P.ember && r() < P.ember) {
        const dist = 3 + Math.floor(r() * 3);
        const sx = Math.round(x + P.wx * dist), sy = Math.round(y + P.wy * dist);
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
          const e = sy * W + sx;
          if (st[e] === 0 && next[e] === 0 && r() < fuel[e]) { next[e] = 1; nage[e] = 0; }
        }
      }
    }
    return [next, nage];
  }
  function compute() {
    const P = params(), r = mulberry32(1234);
    let st = base.slice(), age = new Uint8Array(N);
    frames = [st]; ages = [age];
    for (let k = 0; k < TICKS; k++) {
      const o = step(st, age, r, P);
      st = o[0]; age = o[1];
      frames.push(st); ages.push(age);
    }
  }
  /** Burnt-plus-burning area in hectares at tick k. */
  function area(k) {
    const st = frames[k];
    let n = 0;
    for (let i = 0; i < N; i++) if (st[i] === 1 || st[i] === 2) n++;
    return n * CELL_HA;
  }

  function size() {
    const r = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cvs.width !== w || cvs.height !== h || baseCanvas.width !== w) { cvs.width = w; cvs.height = h; paintBase(); }
  }
  function trace(c, pts, cw, ch) {
    c.beginPath();
    pts.forEach((p, k) => {
      const x = p[0] * cw, y = p[1] * ch;
      if (k) c.lineTo(x, y); else c.moveTo(x, y);
    });
  }
  function strokeLine(c, pts, cw, ch, w) {
    const lw = Math.max(4, w / 170);
    trace(c, pts, cw, ch);
    c.lineCap = 'butt'; c.lineJoin = 'round'; c.lineWidth = lw;
    c.globalAlpha = 0.7; c.strokeStyle = '#38bdf8'; c.setLineDash([]); c.stroke();
    c.globalAlpha = 1; c.strokeStyle = '#0284c7'; c.setLineDash([lw * 2, lw]); c.stroke();
    c.setLineDash([]);
  }
  // In-progress line, styled like Mapbox Draw: dotted orange preview and white-ringed vertices
  function drawPreview(c, cw, ch, w) {
    const v = drawing.verts, pts = drawing.hover ? v.concat([drawing.hover]) : v;
    const lw = Math.max(2, w / 400);
    if (pts.length > 1) {
      trace(c, pts, cw, ch);
      c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = lw; c.strokeStyle = '#fbb03b';
      c.setLineDash([0.1, lw * 2.5]); c.stroke(); c.setLineDash([]);
    }
    v.forEach((q) => {
      const x = q[0] * cw, y = q[1] * ch, r = Math.max(4, w / 170);
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = '#ffffff'; c.fill();
      c.beginPath(); c.arc(x, y, r * 0.6, 0, Math.PI * 2); c.fillStyle = '#fbb03b'; c.fill();
    });
  }
  function render() {
    const c = cvs.getContext('2d'), w = cvs.width, h = cvs.height, cw = w / W, ch = h / H;
    c.drawImage(baseCanvas, 0, 0);
    const st = frames.length ? frames[view] : base, age = frames.length ? ages[view] : null;
    const gap = Math.max(1, Math.round(Math.min(cw, ch) * 0.14));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, s = st[i];
      if (s !== 1 && s !== 2) continue;
      const x0 = Math.floor(x * cw), y0 = Math.floor(y * ch), x1 = Math.floor((x + 1) * cw), y1 = Math.floor((y + 1) * ch);
      c.fillStyle = '#2c2e31'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      c.fillStyle = s === 2 ? '#3d3f43' : ((!age || age[i] === 0) ? '#e08a45' : '#c8743a');
      c.fillRect(x0, y0, Math.max(1, x1 - x0 - gap), Math.max(1, y1 - y0 - gap));
    }
    lines.forEach((L) => { strokeLine(c, L.raw, cw, ch, w); });
    if (drawing) drawPreview(c, cw, ch, w);
    ignitions.forEach((p) => {
      const x = (p[0] + 0.5) * cw, y = (p[1] + 0.5) * ch;
      c.beginPath(); c.arc(x, y, w * 0.075, 0, Math.PI * 2);
      c.fillStyle = 'rgba(244, 123, 32, 0.12)'; c.fill();
      c.beginPath(); c.arc(x, y, Math.max(5, w / 80), 0, Math.PI * 2);
      c.fillStyle = '#f47b20'; c.fill();
      c.lineWidth = Math.max(2, w / 300); c.strokeStyle = '#ffffff'; c.stroke();
    });
  }

  // Tick count -> hours (3 ticks per hour)
  const fmtH = (k) => { const hrs = k / 3; return (hrs % 1 ? hrs.toFixed(1) : String(hrs)) + ' h'; };
  function weatherUI() {
    const spd = +ui.wind.value, t = +ui.temp.value, hu = +ui.hum.value;
    ui.windV.textContent = spd + ' km/h';
    ui.windL.textContent = 'Wind ' + ui.dir.value;
    ui.tempV.textContent = t + '°C';
    ui.humV.textContent = hu + '%';
    const score = spd / 40 * 0.4 + (1 - hu / 100) * 0.4 + t / 40 * 0.2;
    ui.danger.textContent = score < 0.3 ? 'low' : score < 0.45 ? 'moderate' : score < 0.62 ? 'high' : 'extreme';
  }
  function updateUI() {
    const has = frames.length > 0;
    ui.time.textContent = 'Timeline: ' + fmtH(has ? view : 0);
    ui.slider.value = has ? view : 0;
    ui.slider.disabled = !has;
    ui.note.textContent = (anim ? 'Running…' : has ? 'Showing ' + fmtH(view) + ' of 24 h' : 'Not run yet') + (ui.auto.checked ? ' · Auto Update' : '');
    ui.run.classList.toggle('cancel', !!anim);
    ui.runL.textContent = anim ? 'Cancel Simulation' : 'RUN';
    const max = has ? area(TICKS) : 0;
    ui.bars.forEach((b) => {
      const k = +b.getAttribute('data-h') * 3, bar = b.querySelector('i'), val = b.querySelector('b');
      if (has && k <= view) {
        const a = area(k);
        bar.style.width = (max ? a / max * 100 : 0) + '%';
        val.textContent = a.toFixed(1) + ' ha';
      } else { bar.style.width = '0%'; val.textContent = '—'; }
    });
  }
  function renderLines() {
    if (!lines.length) { ui.lines.innerHTML = '<li class="fa-empty">No lines yet. Use Draw Containment to add one.</li>'; return; }
    ui.lines.innerHTML = lines.map((L) =>
      `<li>${PENCIL}<div><b>${L.name}</b><span>Logged · ${L.len} m</span></div>${CHECK}</li>`
    ).join('');
  }

  function stopAnim() { if (anim) { clearInterval(anim); anim = null; } }
  function run() {
    clearTimeout(pending); stopAnim(); compute();
    if (reduceMotion) { view = TICKS; updateUI(); render(); return; }
    view = 0;
    anim = setInterval(() => {
      view++;
      if (view >= TICKS) { view = TICKS; stopAnim(); }
      updateUI(); render();
    }, 95);
    updateUI(); render();
  }
  /** Discards the computed run; re-runs after a short delay when Auto Update is on (unless noRun). */
  function invalidate(noRun) {
    clearTimeout(pending); stopAnim();
    frames = []; ages = []; view = 0;
    updateUI(); render();
    if (!noRun && ui.auto.checked) pending = setTimeout(run, 350);
  }

  // Map pointer position to fractional cell coordinates / whole cell
  function pointAt(e) {
    const r = cvs.getBoundingClientRect();
    return [Math.max(0, Math.min(W, (e.clientX - r.left) / r.width * W)), Math.max(0, Math.min(H, (e.clientY - r.top) / r.height * H))];
  }
  function cellAt(e) {
    const r = cvs.getBoundingClientRect();
    return [
      Math.max(0, Math.min(W - 1, Math.floor((e.clientX - r.left) / r.width * W))),
      Math.max(0, Math.min(H - 1, Math.floor((e.clientY - r.top) / r.height * H)))
    ];
  }
  function ignite(p) {
    let any = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = p[0] + dx, y = p[1] + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (base[i] === 0) { base[i] = 1; any = true; }
    }
    if (any) { ignitions.push(p); invalidate(true); }
  }
  // 4-connected line so fire cannot slip diagonally through a containment line
  function addPath(pts, a, b) {
    let x = a[0], y = a[1];
    const dx = Math.abs(b[0] - x), dy = -Math.abs(b[1] - y);
    const sx = x < b[0] ? 1 : -1, sy = y < b[1] ? 1 : -1;
    let err = dx + dy;
    while (x !== b[0] || y !== b[1]) {
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; pts.push([x, y]); }
      else if (e2 <= dx) { err += dx; y += sy; pts.push([x, y]); }
    }
  }
  function commitLine(pts, raw) {
    pts.forEach((p) => { const i = p[1] * W + p[0]; if (base[i] === 0 || base[i] === 1) base[i] = 5; });
    let mx = 0, my = 0;
    pts.forEach((p) => { mx += p[0]; my += p[1]; });
    mx = mx / pts.length - W / 2; my = my / pts.length - H / 2;
    // Name the line after the compass sector its centre lies in, relative to the map centre
    const sector = Math.round(Math.atan2(my, mx) / (Math.PI / 4));
    const name = 'Line ' + String.fromCharCode(65 + lines.length % 26) + ' - ' + COMPASS[(sector + 8) % 8];
    lines.push({ name, len: pts.length * CELL_M, pts, raw });
    renderLines();
  }

  function setDrawMode(on) {
    drawMode = on;
    if (!on) drawing = null;
    ui.draw.setAttribute('aria-pressed', String(on));
    cvs.classList.toggle('drawing', on);
    ui.mode.textContent = on ? 'Click to add points · double-click to finish' : 'Click to ignite';
    ui.mode.classList.toggle('draw', on);
    render();
  }
  function finishLine() {
    if (!drawing) return;
    const v = drawing.verts;
    drawing = null;
    if (v.length >= 2) {
      const cell = (q) => [Math.min(W - 1, Math.floor(q[0])), Math.min(H - 1, Math.floor(q[1]))];
      const pts = [cell(v[0])];
      for (let k = 1; k < v.length; k++) addPath(pts, pts[pts.length - 1], cell(v[k]));
      commitLine(pts, v);
      invalidate(true);
    }
    setDrawMode(false);
  }
  cvs.addEventListener('pointerdown', (e) => {
    if (!drawMode) { ignite(cellAt(e)); return; }
    const q = pointAt(e);
    if (!drawing) {
      clearTimeout(pending); stopAnim();
      drawing = { verts: [q], hover: q };
      render(); return;
    }
    const last = drawing.verts[drawing.verts.length - 1];
    const d = Math.hypot(q[0] - last[0], q[1] - last[1]);
    if (drawing.verts.length >= 2 && d < 1.5) { finishLine(); return; }
    if (d >= 0.5) drawing.verts.push(q);
    render();
  });
  cvs.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    drawing.hover = pointAt(e); render();
  });
  cvs.addEventListener('pointerleave', () => {
    if (!drawing) return;
    drawing.hover = null; render();
  });
  cvs.addEventListener('dblclick', (e) => { e.preventDefault(); if (drawing) finishLine(); });
  cvs.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawMode) { e.preventDefault(); setDrawMode(false); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (drawing) finishLine();
      else if (!drawMode) ignite([Math.floor(W * 0.7), Math.floor(H * 0.45)]);
    }
  });

  ui.run.addEventListener('click', () => { if (anim) invalidate(true); else run(); });
  ui.draw.addEventListener('click', () => { setDrawMode(!drawMode); });
  ui.clear.addEventListener('click', () => {
    for (let i = 0; i < N; i++) base[i] = kind[i];
    lines = []; ignitions = []; drawing = null;
    renderLines(); invalidate(true);
  });
  ui.slider.addEventListener('input', () => {
    if (!frames.length) return;
    stopAnim(); view = +ui.slider.value; updateUI(); render();
  });
  ui.auto.addEventListener('change', updateUI);
  [ui.wind, ui.temp, ui.hum].forEach((inp) => {
    inp.addEventListener('input', weatherUI);
    inp.addEventListener('change', () => { invalidate(); });
  });
  ui.dir.addEventListener('change', () => { weatherUI(); invalidate(); });
  if (window.ResizeObserver) new ResizeObserver(() => { size(); render(); }).observe(cvs);

  // Open on a finished 24 h run: a fire in the reserve, wind from the east, and a containment line to its west
  terrain();
  ignite([Math.floor(W * 0.55), Math.floor(H * 0.45)]);
  const seedLine = [[12, 0]];
  addPath(seedLine, [12, 0], [56, 71]);
  commitLine(seedLine, [[12.3, 0], [56.4, 72]]);
  clearTimeout(pending);
  weatherUI(); renderLines(); compute(); view = TICKS;
  size(); updateUI(); render();

  return { redraw() { size(); paintBase(); render(); } };
}
