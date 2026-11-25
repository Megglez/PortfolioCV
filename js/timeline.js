import { $ } from './utils.js';

/**
 * Sets up the tab list (with arrow-key navigation) and the generated
 * timeline, whose items jump to entries in the Full CV tab and flash them.
 * @param {{ reduceMotion: boolean }} options
 */
export function initTabsAndTimeline({ reduceMotion }) {
  const entries = Array.from(document.querySelectorAll('.body .entry'));

  // ---------- Tabs ----------
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const setTab = (name, focus) => {
    tabs.forEach((t) => {
      const on = t.getAttribute('data-tab') === name;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
      if (on && focus) t.focus();
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setTab(t.getAttribute('data-tab')));
    t.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setTab(n.getAttribute('data-tab'), true);
    });
  });

  // ---------- Timeline ----------
  const host = $('tl');
  if (!host) return;

  const now = new Date();
  const nowM = now.getFullYear() * 12 + now.getMonth();
  const startM = 2021 * 12;
  const endM = Math.max(2027 * 12, nowM + 2);
  // "YYYY-MM" -> months since year 0
  const mo = (s) => { const p = s.split('-'); return +p[0] * 12 + (+p[1] - 1); };
  const pct = (v) => ((v - startM) / (endM - startM) * 100).toFixed(3);

  // `go` is either the start of an entry heading or a "#id" of a section heading
  const data = [
    { lane: 'Education', items: [
      { label: 'BSc IT, Data Science', w: '2023 – present', s: '2023-01', go: 'BSc' }] },
    { lane: 'Projects', items: [
      { label: 'Chaotic Plants', w: 'Sep – Oct 2025', s: '2025-09', e: '2025-10', go: 'Chaotic Plants' },
      { label: 'FireAway', w: 'Mar – Oct 2026', s: '2026-03', e: '2026-10', go: 'FireAway' }] },
    { lane: 'Hackathons', items: [
      { label: 'DIRISA Datathon', w: 'Jul 2026', s: '2026-07', e: '2026-07', go: 'DIRISA' },
      { label: 'SANReN Cyber Security Challenge', w: 'Sep 2026', s: '2026-09', e: '2026-09', go: 'SANReN' }] },
    { lane: 'Experience', items: [
      { label: 'Technical Crew Training', w: '2021 – present', s: '2021-01', go: 'Technical Crew' },
      { label: 'Head of the Technical Team', w: '2022', s: '2022-01', e: '2022-12', go: 'Technical Crew' },
      { label: 'Space Camp', w: 'Jun 2026', s: '2026-06', e: '2026-06', go: 'Space Camp' }] },
    { lane: 'Awards', cls: 'aw', items: [
      { label: 'FLY@UP Award', w: '2023', y: 2023, go: '#h-awards' },
      { label: 'UP Special Award', w: '2023', y: 2023, go: '#h-awards' },
      { label: 'EPI-USE Labs Most Innovative Final Year Project Award', w: '2026', y: 2026, go: '#h-awards' }] }
  ];

  let html = '<div class="tl-grid" aria-hidden="true">';
  let axis = '';
  for (let y = 2021; y * 12 < endM; y++) {
    html += `<span class="tl-line" style="left:${pct(y * 12)}%"></span>`;
    axis += `<span class="tl-yr" style="left:${pct(y * 12)}%">${y}</span>`;
  }
  html += `<span class="tl-line tl-now" style="left:${pct(nowM + 0.5)}%"></span></div>`;
  html += `<div class="tl-axis" aria-hidden="true"><div class="tl-lab">Year</div><div class="tl-axis-track">${axis}` +
    `<span class="tl-now-lab" style="left:${pct(nowM + 0.5)}%">Now</span></div></div>`;

  data.forEach((lane) => {
    html += `<div class="tl-lane"><div class="tl-lab">${lane.lane}</div><div class="tl-track">`;
    lane.items.forEach((it) => {
      let s, e, point;
      if (it.y) { s = it.y * 12 + 6; e = s; point = true; }
      else {
        s = mo(it.s);
        e = it.e ? mo(it.e) + 1 : nowM + 1; // open-ended items run to the current month
        point = !!it.e && it.e === it.s;    // single-month items are drawn as dots
        if (point) s += 0.5;
      }
      const L = +pct(s), R = +pct(e);
      // Labels on the right half grow leftwards so they stay inside the track
      const anchorRight = L > 55;
      const pos = anchorRight ? `right:${(100 - (point ? L : R)).toFixed(3)}%` : `left:${L}%`;
      html += '<div class="tl-row">';
      if (point) html += `<span class="tl-dot${lane.cls ? ' ' + lane.cls : ''}" style="left:${L}%" data-go="${it.go}" aria-hidden="true"></span>`;
      else html += `<span class="tl-bar${it.e ? '' : ' open'}" style="left:${L}%;width:${(R - L).toFixed(3)}%" data-go="${it.go}" aria-hidden="true"></span>`;
      html += `<button type="button" class="tl-label" style="${pos}" data-go="${it.go}">${it.label}<span class="w">${it.w}</span></button>`;
      html += '</div>';
    });
    html += '</div></div>';
  });
  host.innerHTML = html;

  const jump = (go) => {
    let target = null;
    if (go.charAt(0) === '#') {
      const h = document.querySelector(go);
      target = h && h.closest('section');
    } else {
      entries.forEach((en) => {
        const h3 = en.querySelector('h3');
        if (!target && h3 && h3.textContent.indexOf(go) === 0) target = en;
      });
    }
    setTab('list');
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.classList.remove('flash');
    void target.offsetWidth; // force reflow so the flash animation restarts
    target.classList.add('flash');
  };
  host.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t) jump(t.getAttribute('data-go'));
  });
}
