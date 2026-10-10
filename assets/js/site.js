(function () {
  'use strict';

  var root = document.documentElement;
  // Content marked data-reveal is hidden only once this script is running.
  root.classList.add('reveal-ready');

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  function reduced() { return reduceMQ.matches; }
  function still() { return root.classList.contains('is-still'); }
  function animate() { return !reduced() && !still(); }

  /* ---------- theme ---------- */
  var themeBtn = document.getElementById('theme-toggle');
  function currentTheme() {
    var t = root.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return darkMQ.matches ? 'dark' : 'light';
  }
  function syncThemeLabel() {
    if (!themeBtn) return;
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    themeBtn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    var meta = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < meta.length; i++) meta[i].setAttribute('content', currentTheme() === 'dark' ? '#0D1A17' : '#F1F4F3');
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('rf-theme', next); } catch (e) {}
      syncThemeLabel();
    });
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', syncThemeLabel);
  syncThemeLabel();

  /* ---------- mobile menu ---------- */
  var menuBtn = document.getElementById('menu-toggle');
  var links = document.getElementById('nav-links');
  var scrim = document.getElementById('nav-scrim');
  function menuOpen() { return !!links && links.classList.contains('is-open'); }
  function setMenu(open, opts) {
    if (!links || !menuBtn) return;
    var hadFocus = links.contains(document.activeElement);
    links.classList.toggle('is-open', open);
    if (scrim) scrim.classList.toggle('is-open', open);
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    if (open) {
      var first = links.querySelector('a');
      if (first) first.focus();
    } else if (hadFocus && !(opts && opts.keepFocus)) {
      menuBtn.focus();
    }
  }
  if (menuBtn && links) {
    menuBtn.addEventListener('click', function () { setMenu(!menuOpen()); });
    // following a link moves focus to its section, so leave focus alone there
    links.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false, { keepFocus: true }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuOpen()) setMenu(false);
    });
    // Tab past the last link (or Shift+Tab before the first) closes the panel
    links.addEventListener('focusout', function (e) {
      if (!menuOpen()) return;
      var to = e.relatedTarget;
      if (to && !links.contains(to) && to !== menuBtn) setMenu(false, { keepFocus: true });
    });
    if (scrim) scrim.addEventListener('click', function () { setMenu(false); });
    window.addEventListener('resize', function () { if (menuOpen() && window.innerWidth > 1023) setMenu(false, { keepFocus: true }); });
  }

  /* ---------- Seattle clock ---------- */
  var timeEl = document.getElementById('seattle-time');
  if (timeEl && window.Intl) {
    var fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
    var tick = function () {
      var now = new Date();
      timeEl.textContent = fmt.format(now) + ' here right now';
      timeEl.setAttribute('datetime', now.toISOString());
    };
    tick();
    setInterval(tick, 30000);
  }

  /* ---------- hero parallax, nav background, timeline ---------- */
  var nav = document.getElementById('top-nav');
  var hero = document.querySelector('.hero');
  var layers = Array.prototype.slice.call(document.querySelectorAll('.hero__range .layer'));
  var depths = layers.map(function (l) { return parseFloat(l.getAttribute('data-depth')) || 0; });
  var heroVisible = true;
  var timeline = document.getElementById('timeline');
  var tlItems = timeline ? Array.prototype.slice.call(timeline.querySelectorAll('.tl')) : [];
  var timelineVisible = false;
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      // reads first ...
      var y = window.scrollY || window.pageYOffset;
      var heroH = hero ? hero.offsetHeight : 0;
      var tlRect = null, itemTops = null, mark = 0;
      if (timeline && timelineVisible && !reduced()) {
        tlRect = timeline.getBoundingClientRect();
        mark = window.innerHeight * 0.62;
        itemTops = tlItems.map(function (li) { return li.getBoundingClientRect().top; });
      }
      // ... then writes
      if (nav && hero) nav.classList.toggle('is-solid', y > heroH - 80);
      if (!reduced() && heroVisible) {
        for (var i = 0; i < layers.length; i++) {
          layers[i].style.transform = 'translate3d(0,' + (y * depths[i] * -0.9).toFixed(1) + 'px,0)';
        }
      }
      if (tlRect) {
        var p = Math.max(0, Math.min(1, (mark - tlRect.top) / tlRect.height));
        timeline.style.setProperty('--progress', p.toFixed(4));
        for (var j = 0; j < tlItems.length; j++) tlItems[j].classList.toggle('is-passed', itemTops[j] + 14 < mark);
      }
    });
  }
  function fillTimeline() {
    if (!timeline) return;
    timeline.style.setProperty('--progress', '1');
    tlItems.forEach(function (li) { li.classList.add('is-passed'); });
  }
  if (timeline) {
    if (reduced() || !('IntersectionObserver' in window)) fillTimeline();
    else new IntersectionObserver(function (en) { timelineVisible = en[0].isIntersecting; if (timelineVisible) onScroll(); }, { rootMargin: '10% 0px' }).observe(timeline);
  }

  /* ---------- snow (stars too, after dark) ---------- */
  var canvas = document.getElementById('snow');
  var ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  var flakes = [], stars = [];
  var running = false, rafId = 0;
  var W = 0, H = 0, dpr = 1;
  var flakeRGB = '225,236,238';
  var dark = false;
  var sprite = null;

  function readTheme() {
    var v = getComputedStyle(root).getPropertyValue('--flake').trim();
    if (v) flakeRGB = v.replace(/\s+/g, '');
    dark = currentTheme() === 'dark';
    sprite = makeSprite();
    sizeCanvas();
    if (!running) drawStatic();
  }
  // a soft, blurred dot used for the few big flakes close to the viewer
  function makeSprite() {
    var c = document.createElement('canvas');
    c.width = c.height = 32;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(' + flakeRGB + ',0.95)');
    grad.addColorStop(0.45, 'rgba(' + flakeRGB + ',0.55)');
    grad.addColorStop(1, 'rgba(' + flakeRGB + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  }
  function sizeCanvas() {
    if (!canvas || !ctx) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var target = Math.round(Math.min(84, Math.max(24, W * H / 17000)) * (dark ? 0.6 : 1));
    while (flakes.length < target) flakes.push(makeFlake(true));
    flakes.length = target;
    stars = [];
    if (dark) {
      var n = Math.round(Math.min(70, W / 18));
      for (var i = 0; i < n; i++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H * 0.5, r: 0.35 + Math.random() * 0.75, a: 0.2 + Math.random() * 0.5 });
      }
    }
  }
  function makeFlake(anywhere) {
    var near = Math.random() < 0.14;
    var z = Math.random();
    var slow = dark ? 0.6 : 1;
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -12,
      near: near,
      r: near ? 2.6 + Math.random() * 2.2 : 0.6 + z * 1.2,
      vy: (near ? 0.9 + Math.random() * 0.5 : 0.22 + z * 0.55) * slow,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.004 + Math.random() * 0.01,
      a: near ? 0.55 + Math.random() * 0.3 : 0.35 + z * 0.45
    };
  }
  function paint() {
    ctx.clearRect(0, 0, W, H);
    for (var s = 0; s < stars.length; s++) {
      var st = stars[s];
      ctx.fillStyle = 'rgba(' + flakeRGB + ',' + st.a.toFixed(2) + ')';
      ctx.fillRect(st.x, st.y, st.r * 2, st.r * 2);
    }
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      if (f.near) {
        ctx.globalAlpha = f.a;
        ctx.drawImage(sprite, f.x - f.r * 2, f.y - f.r * 2, f.r * 4, f.r * 4);
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + flakeRGB + ',' + f.a.toFixed(2) + ')';
        ctx.arc(f.x, f.y, f.r, 0, 6.2832);
        ctx.fill();
      }
    }
  }
  function drawStatic() { if (ctx && sprite) paint(); }
  function frame() {
    if (!running) return;
    for (var i = 0; i < flakes.length; i++) {
      var f = flakes[i];
      f.sway += f.swaySpeed;
      f.y += f.vy;
      f.x += Math.sin(f.sway) * (f.near ? 0.55 : 0.3) + 0.12;
      if (f.y > H + 12 || f.x > W + 12) { flakes[i] = makeFlake(false); }
    }
    paint();
    rafId = requestAnimationFrame(frame);
  }
  function startSnow() {
    if (!ctx || running || !animate() || document.hidden || !heroVisible) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }
  function stopSnow() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  if (ctx) {
    readTheme();
    var rs;
    window.addEventListener('resize', function () { clearTimeout(rs); rs = setTimeout(function () { sizeCanvas(); if (!running) drawStatic(); }, 150); });
    document.addEventListener('visibilitychange', function () { document.hidden ? stopSnow() : startSnow(); });
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', function () { reduced() ? stopSnow() : startSnow(); });
    new MutationObserver(readTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', readTheme);
  }

  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      heroVisible ? startSnow() : stopSnow();
    }, { threshold: 0 }).observe(hero);
  } else {
    startSnow();
  }

  /* ---------- pause / play every looping animation (WCAG 2.2.2) ---------- */
  var motionBtn = document.getElementById('motion-toggle');
  function syncMotion() {
    if (!motionBtn) return;
    var paused = still();
    motionBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    motionBtn.setAttribute('aria-label', paused ? 'Let it snow again' : 'Pause the snow and other motion');
  }
  if (motionBtn) {
    motionBtn.addEventListener('click', function () {
      var pause = !still();
      root.classList.toggle('is-still', pause);
      try { localStorage.setItem('rf-motion', pause ? 'paused' : 'on'); } catch (e) {}
      if (pause) stopSnow(); else startSnow();
      syncMotion();
    });
    syncMotion();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- reveals ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if ('IntersectionObserver' in window && !reduced()) {
    // stagger siblings that enter together (gallery tiles, honours)
    var groups = document.querySelectorAll('.gallery, .honors-row');
    for (var gi = 0; gi < groups.length; gi++) {
      var kids = groups[gi].querySelectorAll('[data-reveal]');
      for (var g = 0; g < kids.length; g++) kids[g].style.setProperty('--stagger', (g % 4) * 90 + 'ms');
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- active section in nav ---------- */
  if ('IntersectionObserver' in window && links) {
    var navLinks = Array.prototype.slice.call(links.querySelectorAll('a'));
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var navObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        // every section is observed; one with no link (the hero) clears the marker
        var a = byId[en.target.id];
        navLinks.forEach(function (x) { x.removeAttribute('aria-current'); });
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    var observed = document.querySelectorAll('main > section[id], footer[id]');
    for (var k = 0; k < observed.length; k++) navObs.observe(observed[k]);
  }

  /* ---------- lightbox ---------- */
  var dialog = document.getElementById('lightbox');
  var lbImg = document.getElementById('lb-img');
  var lbWebp = document.getElementById('lb-webp');
  var lbCap = document.getElementById('lb-cap');
  var lastTrigger = null;
  if (dialog && typeof dialog.showModal === 'function') {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.g__btn');
      if (!btn) return;
      lastTrigger = btn;
      lbWebp.srcset = btn.getAttribute('data-webp');
      lbImg.src = btn.getAttribute('data-jpg');
      lbImg.width = +btn.getAttribute('data-w');
      lbImg.height = +btn.getAttribute('data-h');
      lbImg.alt = btn.getAttribute('data-alt');
      lbCap.textContent = btn.getAttribute('data-caption');
      dialog.showModal();
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
    dialog.addEventListener('close', function () { if (lastTrigger) lastTrigger.focus(); });
  } else {
    // no <dialog>: open the full photo directly
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.g__btn');
      if (btn) window.open(btn.getAttribute('data-jpg'), '_blank', 'noopener');
    });
  }
})();
