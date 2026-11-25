import { $, mulberry32 } from './utils.js';

const X0 = -50, VW = 930, VH = 650, MAX = 20, SPEED = 40; // scene units; 2 px per 50 ms frame, as in the Qt app
const AREAS = {
  entrance: [-40, 540, 100, 50], exit: [710, 540, 100, 50], desk: [250, 40, 150, 100],
  inventory: [650, 35, 220, 300], staff: [10, 40, 200, 200], cashier: [603, 540, 100, 50], queue: [498, 540, 100, 100]
};
const START = {
  Flower: { Rose: 20, Tulip: 15, Lily: 10, Sunflower: 12, Daisy: 18 },
  Herb: { Basil: 25, Mint: 30, Rosemary: 16, Thyme: 14, Oregano: 22 },
  Tree: { Oak: 8, Maple: 6, Pine: 10, Apple: 7 },
  Succulent: { Aloe: 24, Cactus: 28, Jade: 19, Echeveria: 13 }
};
const SEASON_STOCK = {
  Spring: { Succulent: 25, Herb: 80, Flower: 90, Tree: 100 },
  Summer: { Succulent: 100, Herb: 100, Flower: 100, Tree: 70 },
  Autumn: { Succulent: 10, Herb: 20, Flower: 50, Tree: 100 },
  Winter: { Succulent: 0, Herb: 0, Flower: 5, Tree: 30 }
};
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
const SEASON_COLOR = { Spring: '#4CAF50', Summer: '#FFC107', Autumn: '#FF5722', Winter: '#2196F3' };
const GROUPS = [['Flower', '\u{1F338} Flowers'], ['Herb', '\u{1F33F} Herbs'], ['Tree', '\u{1F333} Trees'], ['Succulent', '\u{1F335} Succulents']];
const STAFF = [['Bob', 'Sales'], ['Carol', 'Sales'], ['Dave', 'Gardener'], ['Eve', 'Manager'], ['Alice', 'Cashier']];
const DECOS = ['Gift Wrap', 'Pot', 'Special Arrangement'];
const BUBBLE = { Browsing: '#90EE90', Enquiring: '#ADD8E6', Purchasing: '#FFC0CB', Leaving: '#FFA500' };
const FONT = '"Segoe UI", Ubuntu, Cantarell, "Noto Sans", Arial, sans-serif';
// [name, highlighted areas, description]
const PATTERNS = [
  ['Facade', ['scene'], 'The <b>Nursery</b> class sets up the seasons, plant factories, clocks, staff and starting stock, and is the one object the GUI talks to.'],
  ['Observer', ['entrance', 'inventory'], 'Clocks notify observers on a timer: one changes the season, one moves plants to their next growth stage, and the customer creator brings a new customer in at the entrance.'],
  ['State', ['customers', 'staff'], 'Customers switch between browsing, enquiring and purchasing (the bubble colours), staff switch between available and busy, and plants and seasons move through their own states.'],
  ['Mediator', ['desk'], 'Customers never talk to staff directly. The <b>info desk</b> takes each request and appoints an available staff member.'],
  ['Chain of Responsibility', ['desk', 'staff'], 'A request is passed along the staff until someone can handle it: advice questions go to the gardener, then the manager; stock questions go to sales staff, then the manager.'],
  ['Iterator', ['queue', 'cashier'], 'The cashier iterates through the customers waiting in the <b>cashier queue</b> and serves them one at a time.'],
  ['Command', ['inventory'], 'Add-stock, remove-stock and seasonal commands change the <b>inventory</b>. Press Change Season to run one.'],
  ['Decorator', ['decorated'], 'Gift wrap, pots and special arrangements wrap a plant with extra features. The highlighted customers want one; pause and hover their bubble to see which.'],
  ['Prototype', ['inventory'], 'New stock is cloned from existing plants instead of being built from scratch each time.'],
  ['Factory Method', ['inventory'], 'Flower, herb, tree and succulent planters each create their own kind of plant.'],
  ['Strategy', ['inventory', 'staff'], 'Each plant type has its own care strategy, which the gardener applies.']
];

/**
 * Chaotic Plants nursery: a canvas recreation of the Qt app (customers,
 * staff, inventory, cashier queue, seasons) plus design-pattern chips that
 * highlight where each pattern appears.
 * @returns {{ redraw: () => void }} redraw re-measures and repaints the canvas (e.g. after fonts load)
 */
export function initNursery() {
  const cvs = $('cp-canvas');
  if (!cvs) return { redraw() {} };

  const ui = {
    start: $('cp-start'), pause: $('cp-pause'), reset: $('cp-reset'), add: $('cp-add'), season: $('cp-season'),
    seasonL: $('cp-season-l'), count: $('cp-count'), state: $('cp-state'),
    staff: $('cp-staff'), inv: $('cp-inv'), queue: $('cp-queue'), chips: $('cp-chips'), patD: $('cp-pat-d')
  };
  const rnd = mulberry32(42);
  let inv, staff, customers, nextId, qSeq, season, spawnAcc, seasonAcc;
  let running = false, hovered = null, pattern = -1;
  let raf = null, lastT = 0, inView = true;
  const lastPanels = ['', '', ''];

  // Panels sit over the canvas like the Qt proxy widgets
  function place(el, a) {
    el.style.left = ((a[0] + 2 - X0) / VW * 100) + '%';
    el.style.top = ((a[1] + 2) / VH * 100) + '%';
    el.style.width = ((a[2] - 4) / VW * 100) + '%';
    el.style.height = ((a[3] - 4) / VH * 100) + '%';
  }
  place(ui.staff, AREAS.staff); place(ui.inv, AREAS.inventory); place(ui.queue, AREAS.queue);

  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const rint = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const typeOf = (name) => {
    for (const t in inv) if (Object.prototype.hasOwnProperty.call(inv[t], name)) return t;
    return null;
  };
  const stock = (name) => { const t = typeOf(name); return t ? inv[t][name] : 0; };
  const allPlants = () => {
    const a = [];
    for (const t in inv) for (const n in inv[t]) a.push(n);
    return a;
  };
  const byId = (id) => {
    for (let i = 0; i < customers.length; i++) if (customers[i].id === id) return customers[i];
    return null;
  };
  const go = (c, phase, pt) => { c.phase = phase; c.tx = pt[0]; c.ty = pt[1]; };
  const floorSpot = () => [rint(40, 610), rint(260, 495)];
  const deskSpot = () => [rint(268, 382), rint(152, 178)];
  const leave = (c) => { c.state = 'Leaving'; go(c, 'toExit', [760, 565]); };
  const anyMissing = (c) => c.wants.some((w) => stock(w.name) < w.qty);
  // Moves the wanted plants from inventory to the basket, unless something is out of stock
  function takeStock(c) {
    if (anyMissing(c)) return false;
    c.wants.forEach((w) => { inv[typeOf(w.name)][w.name] -= w.qty; });
    c.basket = c.wants.slice();
    return true;
  }
  const toQueue = (c) => { c.state = 'Purchasing'; c.qn = qSeq++; go(c, 'toQueue', [640, 512]); };

  function reset() {
    inv = {};
    Object.keys(START).forEach((t) => {
      inv[t] = {};
      Object.keys(START[t]).sort().forEach((n) => { inv[t][n] = START[t][n]; });
    });
    staff = STAFF.map((p) => ({ name: p[0], type: p[1], cust: null, t: 0 }));
    customers = []; nextId = 1; qSeq = 0; season = 0; spawnAcc = 0; seasonAcc = 0; hovered = null;
    seasonUI();
  }
  function seasonUI() {
    const n = SEASONS[season];
    ui.seasonL.textContent = 'Season: ' + n;
    ui.seasonL.style.color = SEASON_COLOR[n];
  }
  function changeSeason() {
    season = (season + 1) % 4;
    const lv = SEASON_STOCK[SEASONS[season]];
    for (const t in inv) for (const n in inv[t]) inv[t][n] = lv[t];
    seasonUI();
  }

  function spawn() {
    if (customers.length >= MAX) return;
    const c = { id: nextId++, x: 10, y: 565, tx: 10, ty: 565, wants: [], basket: [], q: null, phase: '', hops: 0, helper: null };
    const plants = allPlants(), n = rint(1, 2), r = rnd();
    for (let k = 0; k < n; k++) c.wants.push({ name: pick(plants), qty: rint(1, 5), deco: rnd() < 0.4 ? pick(DECOS) : null });
    customers.push(c);
    if (r < 0.3) {
      const adv = rnd() < 0.5;
      c.state = 'Enquiring';
      c.q = adv
        ? { type: 'Advice Question', text: 'What plants are good for ' + SEASONS[season].toLowerCase() + '?' }
        : { type: 'Information Question', text: 'Do you have ' + c.wants[0].name + ' in stock?' };
      go(c, 'toDesk', deskSpot());
    } else if (r < 0.45) {
      if (takeStock(c)) toQueue(c); else leave(c);
    } else if (anyMissing(c)) {
      leave(c);
    } else {
      c.state = 'Browsing'; c.hops = rint(2, 4); go(c, 'wander', floorSpot());
    }
  }
  // Chain of Responsibility: advice goes to the gardener then manager, stock questions to sales then manager
  function assignHelper(c) {
    const order = c.q.type === 'Advice Question' ? ['Gardener', 'Manager'] : ['Sales', 'Manager'];
    for (let o = 0; o < order.length; o++) {
      for (let i = 0; i < staff.length; i++) {
        const s = staff[i];
        if (s.type === order[o] && s.cust === null) { s.cust = c.id; s.t = 3; c.helper = s.name; c.phase = 'helped'; return; }
      }
    }
  }
  function finishStaff(s) {
    const c = byId(s.cust);
    s.cust = null;
    if (!c) return;
    if (s.type === 'Cashier') { leave(c); return; }
    c.helper = null;
    if (rnd() < 0.6 && !anyMissing(c)) { c.state = 'Browsing'; c.hops = 2; go(c, 'wander', floorSpot()); }
    else leave(c);
  }
  /** Moves a customer toward its target; returns true on arrival. */
  function move(c, dt) {
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.sqrt(dx * dx + dy * dy), step = SPEED * dt;
    if (d <= step || d < 0.5) { c.x = c.tx; c.y = c.ty; return true; }
    c.x += dx / d * step; c.y += dy / d * step;
    return false;
  }
  function arrive(c, k) {
    if (c.phase === 'wander') {
      c.hops--;
      if (c.hops > 0) go(c, 'wander', floorSpot());
      else if (takeStock(c)) toQueue(c);
      else leave(c);
    } else if (c.phase === 'toDesk') c.phase = 'atDesk';
    else if (c.phase === 'toQueue') c.phase = 'inQueue';
    else if (c.phase === 'toExit') { customers.splice(k, 1); if (hovered === c.id) hovered = null; }
  }
  function update(dt) {
    spawnAcc += dt; if (spawnAcc >= 3) { spawnAcc -= 3; spawn(); }
    seasonAcc += dt; if (seasonAcc >= 30) { seasonAcc -= 30; changeSeason(); }
    staff.forEach((s) => { if (s.cust !== null) { s.t -= dt; if (s.t <= 0) finishStaff(s); } });
    customers.forEach((c) => { if (c.phase === 'atDesk') assignHelper(c); });
    const q = customers.filter((c) => c.phase === 'toQueue' || c.phase === 'inQueue' || c.phase === 'paying')
      .sort((a, b) => a.qn - b.qn);
    q.forEach((c, i) => { c.tx = 640 - i * 26; c.ty = 512; });
    const cashier = staff[4];
    if (cashier.cust === null && q[0] && q[0].phase === 'inQueue' && q[0].x === q[0].tx) {
      cashier.cust = q[0].id; cashier.t = 2.5; q[0].phase = 'paying';
    }
    // Backwards so arrive() can remove customers while iterating
    for (let k = customers.length - 1; k >= 0; k--) {
      const c = customers[k];
      if (move(c, dt)) arrive(c, k);
    }
  }

  // ----- drawing -----
  function size() {
    const r = cvs.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; }
  }
  function box(c, a, fill, line, lw) {
    c.fillStyle = fill; c.fillRect(a[0], a[1], a[2], a[3]);
    c.strokeStyle = line; c.lineWidth = lw; c.strokeRect(a[0], a[1], a[2], a[3]);
  }
  function label(c, t, x, y, px, color, bold) {
    c.font = (bold ? '700 ' : '400 ') + px + 'px ' + FONT;
    c.fillStyle = color; c.textBaseline = 'top'; c.textAlign = 'left';
    c.fillText(t, x + 4, y + 4);
  }
  /** Lines of text for a customer's hover bubble. */
  function thoughts(cu) {
    const L = ['Customer #' + cu.id, '', 'State: ' + cu.state, ''];
    if (cu.state === 'Browsing') {
      L.push('Looking for:');
      cu.wants.forEach((w) => { L.push('  • ' + w.qty + ' x ' + w.name); if (w.deco) L.push('    → Wants: ' + w.deco); });
    } else if (cu.state === 'Enquiring') {
      L.push('Asking about:', '  Type: ' + cu.q.type, '  Q: ' + cu.q.text);
      cu.wants.forEach((w) => { L.push('  • ' + w.name); });
      if (cu.helper) L.push('', 'Being helped by ' + cu.helper);
    } else if (cu.state === 'Purchasing') {
      const n = cu.basket.reduce((a, w) => a + w.qty, 0);
      L.push('Ready to checkout', '', 'Basket (' + n + ' items):');
      cu.basket.forEach((w) => { L.push('  • ' + w.qty + ' x ' + w.name); });
    } else {
      L.push('Heading for the exit');
      const miss = cu.wants.filter((w) => stock(w.name) < w.qty);
      if (miss.length && !cu.basket.length) L.push('Out of stock: ' + miss.map((w) => w.name).join(', '));
    }
    return L;
  }
  function highlight(c, a) {
    c.fillStyle = 'rgba(217, 119, 6, 0.10)'; c.fillRect(a[0] - 6, a[1] - 6, a[2] + 12, a[3] + 12);
    c.strokeStyle = '#d97706'; c.lineWidth = 3; c.setLineDash([10, 6]);
    c.strokeRect(a[0] - 6, a[1] - 6, a[2] + 12, a[3] + 12); c.setLineDash([]);
  }
  function ring(c, cu) {
    c.beginPath(); c.arc(cu.x, cu.y, 16, 0, Math.PI * 2);
    c.strokeStyle = '#d97706'; c.lineWidth = 3; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]);
  }
  function render() {
    const c = cvs.getContext('2d'), k = cvs.width / VW;
    c.setTransform(k, 0, 0, k, -X0 * k, 0);
    c.fillStyle = '#F0FFF0'; c.fillRect(X0, 0, VW, VH);
    box(c, AREAS.entrance, '#90EE90', '#006400', 2); label(c, 'Entrance', -25, 550, 13, '#000000');
    box(c, AREAS.exit, '#FFDAB9', '#8B0000', 2); label(c, 'Exit', 735, 550, 13, '#000000');
    box(c, AREAS.desk, '#ADD8E6', '#00008B', 2); label(c, 'Info Desk', 285, 76, 16, '#00008B', true);
    box(c, AREAS.inventory, '#ffffff', '#A9A9A9', 2); label(c, 'Inventory', 660, 6, 16, '#00008B', true);
    box(c, AREAS.staff, '#FFFACD', '#A9A9A9', 2); label(c, 'Staff Status', 20, 11, 16, '#006400', true);
    box(c, AREAS.cashier, '#FFC0CB', '#8B008B', 2); label(c, 'Cashier', 622, 552, 15, '#8B008B', true);
    box(c, AREAS.queue, 'rgba(255, 255, 255, 0.8)', '#808080', 1); label(c, 'Cashier Queue', 498, 518, 12, '#555555', true);
    if (pattern >= 0) {
      PATTERNS[pattern][1].forEach((key) => {
        if (key === 'scene') highlight(c, [X0 + 10, 4, VW - 20, VH - 8]);
        else if (AREAS[key]) highlight(c, AREAS[key]);
      });
    }
    const rings = pattern >= 0 ? PATTERNS[pattern][1] : [];
    customers.forEach((cu) => {
      if (rings.indexOf('customers') > -1 || (rings.indexOf('decorated') > -1 && cu.wants.some((w) => w.deco) && cu.state !== 'Leaving')) ring(c, cu);
      c.beginPath(); c.arc(cu.x, cu.y, 10, 0, Math.PI * 2);
      c.fillStyle = 'rgba(0, 120, 255, 0.85)'; c.fill();
      c.strokeStyle = '#00468c'; c.lineWidth = 1; c.stroke();
      const col = BUBBLE[cu.state];
      c.fillStyle = col; c.strokeStyle = '#555555';
      // Thought bubble: two small circles, then the main ellipse
      [[9, -13, 2.5], [14, -20, 4]].forEach((b) => {
        c.beginPath(); c.arc(cu.x + b[0], cu.y + b[1], b[2], 0, Math.PI * 2); c.fill(); c.stroke();
      });
      c.beginPath(); c.ellipse(cu.x + 22, cu.y - 32, 13, 9, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    });
    const hc = hovered !== null ? byId(hovered) : null;
    if (hc) {
      const L = thoughts(hc), lh = 15, pad = 7;
      c.font = '400 12px ' + FONT;
      let w = 0;
      L.forEach((t) => { w = Math.max(w, c.measureText(t).width); });
      w += pad * 2;
      const h = L.length * lh + pad * 2;
      const bx = Math.min(X0 + VW - w - 4, Math.max(X0 + 4, hc.x + 34));
      const by = Math.min(VH - h - 4, Math.max(4, hc.y - 40 - h));
      c.fillStyle = 'rgba(255, 255, 220, 0.94)'; c.fillRect(bx, by, w, h);
      c.strokeStyle = '#808080'; c.lineWidth = 1; c.strokeRect(bx, by, w, h);
      c.fillStyle = '#000000'; c.textBaseline = 'top';
      L.forEach((t, i) => {
        c.font = (i === 0 ? '700 ' : '400 ') + '12px ' + FONT;
        c.fillText(t, bx + pad, by + pad + i * lh);
      });
    }
  }
  // Only touches the DOM panels when their content changed
  function panels() {
    let st = '';
    staff.forEach((s) => {
      const ok = s.cust === null;
      st += '<b>' + s.name + '</b> (' + s.type + ')<br><span class="' + (ok ? 'cp-ok">✓ Available' : 'cp-no">✗ Busy') + '</span><br>';
      if (!ok) st += '<i>→ Customer #' + s.cust + '</i><br>';
      st += '<br>';
    });
    const buyers = customers.filter((cu) => cu.state === 'Purchasing' && cu.basket.length)
      .sort((a, b) => a.qn - b.qn);
    if (buyers.length) st += '<b class="cp-qn">Cashier Queue: ' + buyers.length + '</b>';
    const iv = GROUPS.map((g) =>
      '<b>' + g[1] + ':</b><br>' + Object.keys(inv[g[0]]).map((n) => n + ': ' + inv[g[0]][n]).join('<br>')
    ).join('<br><br>');
    const qt = buyers.length
      ? 'Cashier Queue (' + buyers.length + '):\n\n' + buyers.map((cu) => {
        const n = cu.basket.reduce((a, w) => a + w.qty, 0);
        return (cu.phase === 'paying' ? '▶ ' : '') + 'Customer #' + cu.id + ': ' + n + ' items';
      }).join('\n')
      : 'Cashier Queue: Empty';
    if (st !== lastPanels[0]) { ui.staff.innerHTML = st; lastPanels[0] = st; }
    if (iv !== lastPanels[1]) { ui.inv.innerHTML = iv; lastPanels[1] = iv; }
    if (qt !== lastPanels[2]) { ui.queue.textContent = qt; lastPanels[2] = qt; }
    ui.count.textContent = 'Customers: ' + customers.length + '/' + MAX;
  }
  function draw() { render(); panels(); }

  // ----- loop and controls -----
  function frame(t) {
    raf = null;
    if (!running || !inView) { lastT = 0; return; }
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    update(dt); draw();
    raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf && running && inView) { lastT = 0; raf = requestAnimationFrame(frame); } }
  function setRunning(on, statusText) {
    running = on;
    ui.start.disabled = on; ui.pause.disabled = !on;
    ui.state.textContent = 'Status: ' + statusText;
    if (on) { hovered = null; startLoop(); } else draw();
  }
  ui.start.addEventListener('click', () => { setRunning(true, 'Running'); });
  ui.pause.addEventListener('click', () => { setRunning(false, 'Paused'); });
  ui.reset.addEventListener('click', () => { reset(); setRunning(false, 'Ready'); });
  ui.add.addEventListener('click', () => { spawn(); draw(); });
  ui.season.addEventListener('click', () => { changeSeason(); draw(); });

  // Hover (only while paused) over a customer or its thought bubble shows what they are thinking
  function hoverAt(e) {
    const r = cvs.getBoundingClientRect();
    const vx = (e.clientX - r.left) / r.width * VW + X0, vy = (e.clientY - r.top) / r.height * VH;
    let found = null;
    if (!running) {
      for (let i = customers.length - 1; i >= 0; i--) {
        const cu = customers[i], bx = vx - (cu.x + 22), by = vy - (cu.y - 32);
        if ((bx * bx) / 256 + (by * by) / 144 <= 1 || Math.hypot(vx - cu.x, vy - cu.y) <= 12) { found = cu.id; break; }
      }
    }
    if (found !== hovered) { hovered = found; render(); }
    cvs.style.cursor = found !== null ? 'pointer' : 'default';
  }
  cvs.addEventListener('pointermove', hoverAt);
  cvs.addEventListener('pointerdown', hoverAt);
  cvs.addEventListener('pointerleave', () => { if (hovered !== null) { hovered = null; render(); } });

  PATTERNS.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cp-chip'; b.textContent = p[0];
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      pattern = pattern === i ? -1 : i;
      Array.prototype.forEach.call(ui.chips.children, (x, j) => { x.setAttribute('aria-pressed', String(j === pattern)); });
      ui.patD.innerHTML = pattern >= 0 ? '<b>' + p[0] + '.</b> ' + p[2] : 'Select a pattern to see where it shows up in the nursery.';
      render();
    });
    ui.chips.appendChild(b);
  });

  // Pause the loop while the canvas is off screen
  if (window.IntersectionObserver) {
    new IntersectionObserver((list) => { inView = list[list.length - 1].isIntersecting; startLoop(); }).observe(cvs);
  }
  if (window.ResizeObserver) new ResizeObserver(() => { size(); render(); }).observe(cvs);

  // Open paused with a few customers already in the nursery, so the bubbles can be explored straight away
  reset();
  spawn(); spawn();
  for (let s0 = 0; s0 < 220; s0++) update(0.05);
  size();
  setRunning(false, 'Paused');

  return { redraw() { size(); render(); } };
}
