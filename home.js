/* Celix — home page
 * Process sequencer: a playhead steps through the engagement.
 */
(() => {
  'use strict';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const seq = document.getElementById('seq');
  if (!seq) return;

  const steps = Array.from(seq.querySelectorAll('.seq__step'));
  const toggle = document.getElementById('seq-toggle');
  const readout = document.getElementById('seq-readout');
  const icon = toggle && toggle.querySelector('.tkey__icon');
  const label = toggle && toggle.querySelector('.label');
  let i = 0, playing = !reduce.matches, visible = false, hovering = false;

  const show = (n) => {
    i = n;
    steps.forEach((s, k) => s.classList.toggle('is-on', k === n));
    if (readout) readout.textContent = `Step ${String(n + 1).padStart(2, '0')} / ${String(steps.length).padStart(2, '0')}`;
  };
  const paint = () => {
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(playing));
    if (label) label.textContent = playing ? 'Pause' : 'Play';
    if (icon) icon.innerHTML = playing
      ? '<rect x="1" y="1" width="3" height="8" fill="currentColor"/><rect x="6" y="1" width="3" height="8" fill="currentColor"/>'
      : '<path d="M1.5 1v8l7-4z" fill="currentColor"/>';
  };

  show(0);
  paint();
  setInterval(() => {
    if (playing && visible && !hovering && !document.hidden) show((i + 1) % steps.length);
  }, 2200);

  steps.forEach((s, k) => {
    s.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hovering = true; show(k); } });
    s.addEventListener('pointerleave', () => { hovering = false; });
    s.addEventListener('click', () => show(k));
  });
  if (toggle) toggle.addEventListener('click', () => { playing = !playing; paint(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.3 }).observe(seq);
})();
