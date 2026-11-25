import { $ } from './utils.js';
import { initFireSim } from './fire-sim.js';
import { initNursery } from './nursery.js';
import { initArchitecture } from './architecture.js';
import { initTabsAndTimeline } from './timeline.js';

/** Wires the "Copy" button next to the email address. */
function initCopyEmail() {
  const copyBtn = $('copy-email');
  const emailEl = $('email');
  if (!copyBtn || !emailEl) return;

  copyBtn.addEventListener('click', () => {
    const text = emailEl.textContent;
    const done = (label) => {
      copyBtn.textContent = label;
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
    };
    // No clipboard access: select the address so it can be copied by hand
    const fallback = () => {
      const r = document.createRange();
      r.selectNodeContents(emailEl);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      done('Selected');
    };
    try {
      navigator.clipboard.writeText(text).then(() => done('Copied'), fallback);
    } catch (e) {
      fallback();
    }
  });
}

const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

initCopyEmail();
const sim = initFireSim({ reduceMotion });
const nursery = initNursery();
initArchitecture({ reduceMotion });
initTabsAndTimeline({ reduceMotion });

// Canvas text uses web fonts: redraw once they have loaded
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { sim.redraw(); nursery.redraw(); });
}
