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
let sim = { redraw() {} };
try { sim = initFireSim({ reduceMotion }); } catch (err) { console.error(err); }
let nursery = { redraw() {} };
try { nursery = initNursery(); } catch (err) { console.error(err); }
try { initArchitecture({ reduceMotion }); } catch (err) { console.error(err); }
try { initTabsAndTimeline({ reduceMotion }); } catch (err) { console.error(err); }

// Canvas text uses web fonts: redraw once they have loaded
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => { sim.redraw(); nursery.redraw(); });
}
