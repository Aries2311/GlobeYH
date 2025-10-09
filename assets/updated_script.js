// Mobile nav toggle
const headerWrap = document.querySelector('.site-header .container');
const toggle = document.querySelector('.nav__toggle');
const menu = document.querySelector('.nav__menu');

if (toggle) {
  toggle.addEventListener('click', () => {
    let expanded = toggle.getAttribute("aria-expanded") === "true"; toggle.setAttribute("aria-expanded", !expanded);
    toggle.setAttribute('aria-expanded', String(!expanded));
    headerWrap.classList.toggle('nav--open');
  });

  // Close on link click (mobile)
  menu?.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      toggle.setAttribute('aria-expanded', 'false');
      headerWrap.classList.remove('nav--open');
    }, { passive: true });
  });
}

// Smooth scroll for same-page links
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const id = link.getAttribute('href');
    if (id && id.length > 1) {
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, { passive: false });
});

// Footer year
const y = document.getElementById('year');
if (y) y.textContent = new Date().getFullYear();

/* ===============================
   Generic Looping Carousel
   - Works for every .carousel on the page
   - Items-per-view: data-phone / data-tablet / data-desktop
   - Static desktop (grid) ONLY if data-static-desktop="true" (Pricing)
   - Desktop breakpoint = 1024px
   =============================== */
function initCarousel(root){
  const viewport = root.querySelector('.carousel__viewport');
  const track = root.querySelector('.carousel__track');
  const slides = Array.from(track.children);
  const prevBtn = root.querySelector('.carousel__btn--prev');
  const nextBtn = root.querySelector('.carousel__btn--next');
  const dotsWrap = root.querySelector('.carousel__dots');

  const cfg = {
    phone: parseInt(root.dataset.phone || '1', 10),
    tablet: parseInt(root.dataset.tablet || '2', 10),
    desktop: parseInt(root.dataset.desktop || '4', 10),
    staticDesktop: root.dataset.staticDesktop === 'true'
  };

  // --- state
  let itemsPerView = 1;
  let page = 0;
  let pages = 1;
  let slideW = 0;
  let isStatic = false; // computed ONCE per layout and reused

  const desktopBp = 1024;
  const isDesktopWidth = () => (root.clientWidth || window.innerWidth) >= desktopBp;

  const calcItemsPerView = () => {
    const w = root.clientWidth || window.innerWidth;
    if (w >= desktopBp) return cfg.desktop;
    if (w >= 980)       return cfg.tablet;
    return cfg.phone;
  };

  function setStaticMode(on){
    isStatic = !!on;
    root.classList.toggle('is-static', isStatic);

    if (isStatic) {
      // grid shows everything; hide/clear motion UI
      track.style.transition = 'none';
      track.style.transform = 'none';
      slides.forEach(s => { s.style.width = ''; });
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (dotsWrap) dotsWrap.style.display = 'none';
    } else {
      if (prevBtn) prevBtn.style.display = '';
      if (nextBtn) nextBtn.style.display = '';
      if (dotsWrap) dotsWrap.style.display = '';
    }
  }

  function computeStatic(){
    // Only Pricing has data-static-desktop="true"
    setStaticMode(cfg.staticDesktop && isDesktopWidth());
  }

  function layout(){
    computeStatic();

    if (isStatic) return; // nothing to size in grid mode

    itemsPerView = calcItemsPerView();
    const vpW = viewport.clientWidth;
    const gap = 16;
    slideW = (vpW - ((itemsPerView - 1) * gap)) / itemsPerView;
    slides.forEach(s => { s.style.width = `${slideW}px`; });

    pages = Math.ceil(slides.length / itemsPerView);
    page = ((page % pages) + pages) % pages;
    buildDots();
    goTo(page, false);
  }

  function goTo(p, animate = true){
    if (isStatic) return; // ignore moves in static mode
    p = ((p % pages) + pages) % pages; // loop
    const gap = 16;
    const x = p * (itemsPerView * (slideW + gap));
    if (!animate) track.style.transition = 'none';
    track.style.transform = `translateX(${-x}px)`;
    if (!animate) { void track.offsetWidth; track.style.transition = 'transform .35s ease'; }
    page = p;
    updateDots();
  }

  function buildDots(){
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    if (isStatic) return;
    for (let i = 0; i < pages; i++){
      const b = document.createElement('button');
      b.className = 'carousel__dot';
      b.type = 'button';
      if (i === page) b.setAttribute('aria-current', 'true');
      b.setAttribute('aria-label', `Go to group ${i+1}`);
      b.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(b);
    }
  }
  function updateDots(){
    if (!dotsWrap || isStatic) return;
    const kids = Array.from(dotsWrap.children);
    kids.forEach((k,i) => {
      if (i === page) k.setAttribute('aria-current', 'true');
      else k.removeAttribute('aria-current');
    });
  }

  // Controls (looping)
  prevBtn?.addEventListener('click', () => goTo(page - 1));
  nextBtn?.addEventListener('click', () => goTo(page + 1));

  // Keyboard
  viewport?.addEventListener('keydown', (e) => {
    if (isStatic) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(page - 1); }
    if (e.key === 'ArrowRight'){ e.preventDefault(); goTo(page + 1); }
  });

  // Touch/drag
  let startX = 0, curX = 0, dragging = false, startTransform = 0;
  function getTranslateX(){
    const style = getComputedStyle(track).transform;
    if (style && style !== 'none') {
      const m = style.match(/matrix\(([^)]+)\)/);
      if (m) {
        const parts = m[1].split(',').map(v => parseFloat(v.trim()));
        return parts[4] || 0;
      }
    }
    return 0;
  }
  const onPointerDown = (e) => {
    if (isStatic) return;
    dragging = true;
    startX = e.touches ? e.touches[0].clientX : e.clientX;
    startTransform = getTranslateX();
    track.style.transition = 'none';
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    curX = e.touches ? e.touches[0].clientX : e.clientX;
    const dx = curX - startX;
    track.style.transform = `translateX(${startTransform + dx}px)`;
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    track.style.transition = 'transform .35s ease';
    const dx = (curX || startX) - startX;
    const threshold = Math.max(40, slideW * 0.15);
    if (dx < -threshold) goTo(page + 1);
    else if (dx > threshold) goTo(page - 1);
    else goTo(page);
    startX = curX = 0;
  };

  viewport?.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove, { passive: true });
  window.addEventListener('mouseup', onPointerUp, { passive: true });
  viewport?.addEventListener('touchstart', onPointerDown, { passive: true });
  window.addEventListener('touchmove', onPointerMove, { passive: true });
  window.addEventListener('touchend', onPointerUp, { passive: true });

  // Resize
  let resizeTimer;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layout, 120);
  };
  window.addEventListener('resize', onResize, { passive: true });

  // init
  layout();
}

// Initialize all carousels
document.querySelectorAll('.carousel').forEach(initCarousel);