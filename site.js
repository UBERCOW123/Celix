/* Celix — shared site script
 * 1. Liquid glass: real refraction for Chromium via an SVG displacement map per surface
 * 2. Pointer-tracked specular sheen on glass
 * 3. Header (light/dark adaptation, scroll spy), mobile menu, reveals
 */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const reduceTransparency = matchMedia('(prefers-reduced-transparency: reduce)');

  /* ------------------------------------------------------------------
   * 1. Liquid glass
   *
   * Each .glass surface gets its own SVG filter, used as its
   * backdrop-filter. The filter blurs the backdrop lightly, then pushes
   * pixels near the edge inward along the surface normal, following the
   * slope of a convex bezel. That is what makes the rim bend and magnify
   * whatever passes behind it. Red, green and blue are displaced by
   * slightly different amounts for a touch of dispersion.
   *
   * Only Chromium renders SVG filters inside backdrop-filter. Safari and
   * Firefox keep the CSS frosted glass defined in site.css.
   * ------------------------------------------------------------------ */
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  const isChromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge|Opera|Brave/i.test(b.brand));
  const liquid = isChromium && !reduceTransparency.matches;

  const SVGNS = 'http://www.w3.org/2000/svg';
  let defs = null;
  let uid = 0;

  function ensureDefs() {
    if (defs) return defs;
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(SVGNS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return defs;
  }

  // Signed distance and outward normal for a rounded rectangle centred on 0,0.
  function roundedRect(px, py, hw, hh, r) {
    const ax = Math.abs(px), ay = Math.abs(py);
    const qx = ax - (hw - r), qy = ay - (hh - r);
    let d, nx, ny;
    if (qx > 0 && qy > 0) {
      const len = Math.hypot(qx, qy) || 1;
      d = len - r;
      nx = qx / len; ny = qy / len;
    } else if (qx > qy) {
      d = qx - r; nx = 1; ny = 0;
    } else {
      d = qy - r; nx = 0; ny = 1;
    }
    return { d, nx: px < 0 ? -nx : nx, ny: py < 0 ? -ny : ny };
  }

  // Encodes the displacement field (R = x, G = y, 0.5 = still) and, in a
  // second image, the specular highlight the bevel catches from a light
  // above and to the left.
  const LIGHT = [-0.55, -0.835];
  function buildMaps(w, h, r, bezel, shine) {
    const scale = Math.min(1, 480 / Math.max(w, h));
    const mw = Math.max(2, Math.round(w * scale));
    const mh = Math.max(2, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = mw; canvas.height = mh;
    const ctx = canvas.getContext('2d');
    const disp = ctx.createImageData(mw, mh);
    const spec = ctx.createImageData(mw, mh);
    const D = disp.data, S = spec.data;
    const hw = w / 2, hh = h / 2;
    const rim = Math.min(bezel, 1.6 / scale + 1.2); // thin bright line at the very edge
    for (let j = 0; j < mh; j++) {
      const py = (j + 0.5) / scale - hh;
      for (let i = 0; i < mw; i++) {
        const px = (i + 0.5) / scale - hw;
        const s = roundedRect(px, py, hw, hh, r);
        const inset = Math.max(0, -s.d); // distance in from the edge
        const k = (j * mw + i) * 4;
        let mag = 0, light = 0;
        if (inset < bezel) {
          // Slope of a convex squircle bezel: steep at the rim, flat inside.
          const t = inset / bezel;
          mag = Math.pow(1 - t, 2.4);
          const facing = s.nx * LIGHT[0] + s.ny * LIGHT[1]; // -1..1
          const lit = facing > 0 ? facing : -facing * 0.45; // far side glints too, weaker
          const band = Math.pow(1 - t, 3.2) * 0.55 + (inset < rim ? (1 - inset / rim) * 0.6 : 0);
          light = Math.min(1, band * Math.pow(lit, 1.6) * shine);
        }
        // Sample inward (against the outward normal) so the rim magnifies.
        D[k] = Math.round(127.5 - s.nx * mag * 127);
        D[k + 1] = Math.round(127.5 - s.ny * mag * 127);
        D[k + 2] = 128;
        D[k + 3] = 255;
        S[k] = S[k + 1] = S[k + 2] = 255;
        S[k + 3] = Math.round(light * 255);
      }
    }
    ctx.putImageData(disp, 0, 0);
    const dispURL = canvas.toDataURL('image/png');
    ctx.putImageData(spec, 0, 0);
    return { disp: dispURL, spec: canvas.toDataURL('image/png') };
  }

  function el(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function buildFilter(id, w, h, opts) {
    const f = el('filter', {
      id,
      x: 0, y: 0, width: w, height: h,
      filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB',
    });
    f.appendChild(el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: opts.frost, edgeMode: 'duplicate', result: 'blur' }));
    f.appendChild(el('feImage', { href: opts.maps.disp, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'map' }));
    const scale = opts.disp * 2;
    if (opts.dispersion) {
      const channels = [
        ['r', scale * 1.0, '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['g', scale * 1.07, '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0'],
        ['b', scale * 1.14, '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0'],
      ];
      for (const [c, s, m] of channels) {
        f.appendChild(el('feDisplacementMap', { in: 'blur', in2: 'map', scale: s.toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: 'd' + c }));
        f.appendChild(el('feColorMatrix', { in: 'd' + c, type: 'matrix', values: m, result: 'c' + c }));
      }
      f.appendChild(el('feComposite', { in: 'cr', in2: 'cg', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'rg' }));
      f.appendChild(el('feComposite', { in: 'rg', in2: 'cb', operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0, result: 'refracted' }));
    } else {
      f.appendChild(el('feDisplacementMap', { in: 'blur', in2: 'map', scale: scale.toFixed(2), xChannelSelector: 'R', yChannelSelector: 'G', result: 'refracted' }));
    }
    f.appendChild(el('feColorMatrix', { in: 'refracted', type: 'saturate', values: opts.saturate, result: 'glass' }));
    f.appendChild(el('feImage', { href: opts.maps.spec, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'none', result: 'spec' }));
    f.appendChild(el('feBlend', { in: 'spec', in2: 'glass', mode: 'screen' }));
    return f;
  }

  function num(style, prop, fallback) {
    const v = parseFloat(style.getPropertyValue(prop));
    return Number.isFinite(v) ? v : fallback;
  }

  const surfaces = new Map();

  function render(node) {
    const w = node.offsetWidth, h = node.offsetHeight;
    if (!w || !h) return;
    const state = surfaces.get(node);
    if (state.w === w && state.h === h) return;
    state.w = w; state.h = h;

    const cs = getComputedStyle(node);
    const r = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, w / 2, h / 2);
    const bezel = Math.max(6, Math.min(num(cs, '--lg-bezel', Math.max(r, 14) * 0.9), Math.min(w, h) / 2));
    const disp = bezel * num(cs, '--lg-strength', 0.85);
    const frost = num(cs, '--lg-frost', 6);
    const saturate = num(cs, '--lg-saturate', 1.7);
    const shine = num(cs, '--lg-shine', 1);
    const dispersion = w * h < 160000; // keep the 3-pass version to smaller surfaces

    const filter = buildFilter(state.id, w, h, {
      maps: buildMaps(w, h, Math.max(r, 0.01), bezel, shine),
      disp, frost, saturate, dispersion,
    });
    const old = document.getElementById(state.id);
    if (old) old.replaceWith(filter); else ensureDefs().appendChild(filter);
    node.style.backdropFilter = `url(#${state.id})`;
    node.classList.add('is-liquid');
  }

  let ro = null;
  function register(node) {
    if (!liquid || surfaces.has(node) || node.matches('.glass--lite')) return;
    surfaces.set(node, { id: 'lg' + (++uid), w: 0, h: 0 });
    ro = ro || new ResizeObserver((entries) => entries.forEach((e) => render(e.target)));
    ro.observe(node);
  }

  if (liquid) {
    root.classList.add('liquid');
    const start = () => document.querySelectorAll('.glass').forEach(register);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
    start();
  }

  /* ------------------------------------------------------------------
   * 2. Specular sheen follows the pointer
   * ------------------------------------------------------------------ */
  if (matchMedia('(hover: hover)').matches) {
    let pending = null, last = null;
    document.addEventListener('pointermove', (e) => {
      pending = e;
      if (last) return;
      last = requestAnimationFrame(() => {
        last = null;
        const t = pending.target.closest && pending.target.closest('.glass');
        if (!t) return;
        const b = t.getBoundingClientRect();
        t.style.setProperty('--mx', ((pending.clientX - b.left) / b.width * 100).toFixed(1) + '%');
        t.style.setProperty('--my', ((pending.clientY - b.top) / b.height * 100).toFixed(1) + '%');
      });
    }, { passive: true });
  }

  /* ------------------------------------------------------------------
   * 3. Page furniture
   * ------------------------------------------------------------------ */
  const header = document.getElementById('header');
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('mobile-menu');

  function setMenu(open) {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', String(open));
    header.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => { menu.classList.add('is-open'); register(menu); });
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (!menu.classList.contains('is-open')) menu.hidden = true; }, 250);
    }
  }
  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    matchMedia('(min-width: 860px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });
  }

  // The bar turns to light glass while it sits over an aluminium section.
  const lightSections = Array.from(document.querySelectorAll('[data-light]'));
  let scrollQueued = false;
  function onScroll() {
    scrollQueued = false;
    if (!header || !lightSections.length) return;
    const probe = header.getBoundingClientRect().top + 28;
    header.classList.toggle('on-light', lightSections.some((sec) => {
      const r = sec.getBoundingClientRect();
      return r.top <= probe && r.bottom >= probe;
    }));
  }
  const queueScroll = () => { if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); } };
  window.addEventListener('scroll', queueScroll, { passive: true });
  window.addEventListener('resize', queueScroll, { passive: true });
  onScroll();

  // Scroll spy: light the nav link for the section on screen.
  const navLinks = Array.from(document.querySelectorAll('.nav__links a[href*="#"]'))
    .map((a) => ({ a, target: document.getElementById(a.hash.slice(1)) }))
    .filter((x) => x.target && x.a.pathname === location.pathname);
  if (navLinks.length && 'IntersectionObserver' in window) {
    // Watch every section, so ones without a link clear it.
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        navLinks.forEach((x) => x.a.classList.toggle('is-active', x.target === e.target));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach((s) => spy.observe(s));
  }

  // Reveal on scroll. Applied to individual surfaces, never to a wrapper
  // around glass: opacity on an ancestor would cut the glass off from
  // the backdrop it is refracting.
  const reveals = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const n = e.target;
        io.unobserve(n);
        n.classList.add('is-in');
        // Hand the element back to its own hover/press transitions once in.
        const done = (ev) => {
          if (ev && (ev.target !== n || ev.propertyName !== 'transform')) return;
          n.removeEventListener('transitionend', done);
          n.removeAttribute('data-reveal');
          n.classList.remove('is-in');
        };
        n.addEventListener('transitionend', done);
        setTimeout(done, 2200);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((n) => io.observe(n));
  } else {
    reveals.forEach((n) => n.classList.add('is-in'));
  }

  // Footer year
  document.querySelectorAll('[data-year]').forEach((n) => { n.textContent = new Date().getFullYear(); });

  // Expose for page scripts
  window.Celix = { register, reduceMotion };
})();
