import { $ } from './utils.js';

const NS = 'http://www.w3.org/2000/svg';

// n: highlighted nodes, e: active edges ('-' prefix = travels in reverse)
const STEPS = [
  { t: 'Request a forecast', n: ['client', 'api'], e: ['e1'],
    d: 'A first responder opens the Next.js web app, or the installed PWA, and requests a fire spread forecast for an area.' },
  { t: 'Check the cache first', n: ['api', 'cache'], e: ['e2'],
    d: 'The Python backend, built as a layered monolith, first looks for a ready forecast (the cache-aside pattern). On a hit it answers straight away and the GPU tier is not needed.' },
  { t: 'Hand off with a claim check', n: ['api', 's3', 'sqs'], e: ['e3', 'e4'],
    d: 'On a miss, the backend stores the bulky model inputs in S3 and puts only a small reference to them, the claim check, on an SQS queue. The request does not block while the model runs.' },
  { t: 'GPU workers run the models', n: ['sqs', 'gpu', 's3'], e: ['e5', '-e6'],
    d: 'A worker in the distributed GPU tier takes the job, uses the claim check to fetch its inputs from S3, then runs the ConvLSTM forecast and the cellular-automaton (DCA) spread simulation.' },
  { t: 'Store the results', n: ['gpu', 's3', 'rds'], e: ['e6', 'e7'],
    d: 'The worker writes its outputs back to S3 and RDS, so the backend can serve them and cache them for the next request.' },
  { t: 'Alert and display', n: ['api', 'ses', 'client'], e: ['e8', '-e1'],
    d: 'The backend sends email alerts through SES, and the web app shows responders and communities the predicted spread.' },
  { t: 'Ship it safely', n: ['plat'], e: [],
    d: 'Every service runs as a Docker image stored in ECR and deployed on EC2, with IAM limiting what each part can access. Releases use blue/green CI/CD, so a new version goes live without taking the old one down first.' }
];

/**
 * FireAway architecture walkthrough: seven SVG steps with animated packets,
 * play/pause, back/next and step dots.
 * @param {{ reduceMotion: boolean }} options
 */
export function initArchitecture({ reduceMotion }) {
  const fig = $('arch');
  if (!fig) return;

  const nodes = {};
  const edges = {};
  fig.querySelectorAll('.nd').forEach((g) => { nodes[g.getAttribute('data-id')] = g; });
  fig.querySelectorAll('.eg').forEach((p) => { edges[p.id.replace('arch-', '')] = p; });
  const layer = fig.querySelector('.pk-layer');
  const title = $('arch-title');
  const text = $('arch-text');
  const count = $('arch-count');
  const playBtn = $('arch-play');
  const dotsWrap = $('arch-dots');
  let cur = 0, playing = false, timer = null, raf = null, inView = true, packets = [];

  const dotBtns = STEPS.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'arch-dot';
    b.setAttribute('aria-label', `Step ${i + 1}: ${s.t}`);
    b.addEventListener('click', () => { setPlaying(false); show(i); });
    dotsWrap.appendChild(b);
    return b;
  });

  function show(i) {
    cur = (i + STEPS.length) % STEPS.length;
    const s = STEPS[cur];
    const act = {}; // edge id -> direction (1 forward, -1 reverse)
    s.e.forEach((x) => {
      const rev = x.charAt(0) === '-';
      act[rev ? x.slice(1) : x] = rev ? -1 : 1;
    });
    Object.keys(nodes).forEach((k) => {
      const on = s.n.indexOf(k) > -1;
      nodes[k].classList.toggle('on', on);
      nodes[k].classList.toggle('off', !on);
    });
    Object.keys(edges).forEach((k) => {
      const p = edges[k], d = act[k];
      p.classList.toggle('on', !!d);
      p.classList.toggle('off', !d);
      p.removeAttribute('marker-end');
      p.removeAttribute('marker-start');
      if (d === 1) p.setAttribute('marker-end', 'url(#ah-on)');
      if (d === -1) p.setAttribute('marker-start', 'url(#ah-on)');
    });
    title.textContent = s.t;
    text.textContent = s.d;
    count.textContent = `Step ${cur + 1} of ${STEPS.length}`;
    dotBtns.forEach((b, j) => { b.setAttribute('aria-current', j === cur ? 'step' : 'false'); });
    layer.textContent = '';
    packets = [];
    if (!reduceMotion) {
      Object.keys(act).forEach((k) => {
        const c = document.createElementNS(NS, 'circle');
        c.setAttribute('r', '4.5');
        c.setAttribute('class', 'pk');
        c.setAttribute('cx', '-20');
        c.setAttribute('cy', '-20');
        layer.appendChild(c);
        packets.push({ c, p: edges[k], dir: act[k], len: 0 });
      });
    }
  }

  // Moves each packet along its edge path, one lap every 1.5 s
  function frame(ts) {
    packets.forEach((pk) => {
      if (!pk.len) { try { pk.len = pk.p.getTotalLength(); } catch (e) { /* path not measurable yet */ } }
      if (!pk.len) return;
      let f = (ts % 1500) / 1500;
      if (pk.dir < 0) f = 1 - f;
      const pt = pk.p.getPointAtLength(f * pk.len);
      pk.c.setAttribute('cx', pt.x);
      pk.c.setAttribute('cy', pt.y);
    });
    raf = requestAnimationFrame(frame);
  }
  function loop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (!reduceMotion && inView) raf = requestAnimationFrame(frame);
  }
  function schedule() {
    if (timer) { clearInterval(timer); timer = null; }
    if (playing && inView) timer = setInterval(() => { show(cur + 1); }, 4800);
  }
  function setPlaying(p) {
    playing = p;
    playBtn.textContent = p ? 'Pause' : 'Play';
    playBtn.setAttribute('aria-pressed', String(p));
    schedule();
  }

  $('arch-prev').addEventListener('click', () => { setPlaying(false); show(cur - 1); });
  $('arch-next').addEventListener('click', () => { setPlaying(false); show(cur + 1); });
  playBtn.addEventListener('click', () => { setPlaying(!playing); });
  if (window.IntersectionObserver) {
    new IntersectionObserver((list) => { inView = list[0].isIntersecting; loop(); schedule(); }).observe(fig);
  }
  document.addEventListener('visibilitychange', () => { inView = !document.hidden; loop(); schedule(); });

  show(0);
  setPlaying(!reduceMotion);
  loop();
}
