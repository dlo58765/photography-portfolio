// Chapter gallery shared by norway.html and iceland.html.
// Each page sets window.GALLERY = { folder, manifests, chapters } before
// loading this file. `manifests` is the object make_thumbs.py inlines
// between the MANIFEST_BEGIN / MANIFEST_END markers.
(() => {
  const { folder: FOLDER, manifests, chapters: CHAPTERS } = window.GALLERY;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ===== Reveal on scroll =====
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add('is-visible');
    });
  }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
  const observeReveals = (root = document) =>
    root.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => revealObserver.observe(el));
  observeReveals();

  // ===== Image candidates =====
  // Manifest entries carry widths for each copy make_thumbs.py wrote:
  // md (1200px), thumb (1600px) and full (original, or a 2560px .lg.jpg
  // for heavy originals). URLs are encoded because srcset splits on spaces
  // and some chapter folders have spaces in their names.
  function srcsetOf(base, candidates) {
    const widths = new Set();
    const parts = [];
    for (const [path, w] of candidates) {
      if (!path || !w || widths.has(w)) continue;
      widths.add(w);
      parts.push(`${encodeURI(`${base}/${path}`)} ${w}w`);
    }
    return parts.join(', ');
  }
  // Tiles are one column on phones (24px gutters) and otherwise full width
  // for wides, half width for the rest — see .chapter-grid in styles.css.
  // Tiles never use the original, so phones can't pull a 20MB file.
  const TILE_SIZES = {
    wide: '(max-width: 640px) calc(100vw - 48px), 90vw',
    other: '(max-width: 640px) calc(100vw - 48px), 45vw',
  };
  // The lightbox image is at most 92vw wide (.lightbox img).
  const LIGHTBOX_SIZES = '92vw';

  // ===== Lightbox =====
  // Each chapter's frames get their own array so prev/next stays within
  // the chapter you opened. `lbState` tracks which chapter + which frame.
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = lightbox.querySelector('img');
  const lightboxCap = lightbox.querySelector('.lightbox-caption');
  const lbClose = lightbox.querySelector('.lightbox-close');
  const lbPrev = lightbox.querySelector('.lightbox-prev');
  const lbNext = lightbox.querySelector('.lightbox-next');
  // Caption: the photo's title, then "City · 5 / 14", then the exposure.
  lightboxCap.innerHTML =
    '<span class="lightbox-title"></span>' +
    '<span class="lightbox-meta"></span>' +
    '<span class="lightbox-shot"></span>';
  const [lbTitle, lbMeta, lbShot] = lightboxCap.children;
  const chapterFrames = {};   // slug -> [{ src, srcset, alt, id, title, city, shot }, ...]
  const lbState = { slug: null, index: 0, opener: null };

  function loadInto(img, frame) {
    img.sizes = LIGHTBOX_SIZES;   // sizes before srcset, so the first pick is right
    img.srcset = frame.srcset;
    img.src = frame.src;
  }

  function showFrame(slug, index) {
    const frames = chapterFrames[slug];
    if (!frames || !frames.length) return;
    const n = frames.length;
    const wrap = (j) => ((j % n) + n) % n;
    const i = wrap(index);
    const frame = frames[i];
    loadInto(lightboxImg, frame);
    lightboxImg.alt = frame.alt;
    lbTitle.textContent = frame.title;
    lbMeta.textContent = `${frame.city} · ${i + 1} / ${n}`;
    lbShot.textContent = frame.shot;
    lbShot.hidden = !frame.shot;
    lbState.slug = slug;
    lbState.index = i;
    // Hide arrows if the chapter has only one frame.
    const solo = n <= 1;
    lbPrev.classList.toggle('is-hidden', solo);
    lbNext.classList.toggle('is-hidden', solo);
    // Warm the neighbours so prev/next feel instant.
    if (!solo) [i - 1, i + 1].forEach((j) => loadInto(new Image(), frames[wrap(j)]));
  }
  function openLightbox(slug, index) {
    lbState.opener = document.activeElement;
    showFrame(slug, index);
    // Which photos people open: a GoatCounter event per open (not per
    // prev/next). Absent locally and when the script is blocked.
    const frame = chapterFrames[slug][lbState.index];
    window.goatcounter?.count?.({ path: `photo/${FOLDER}/${slug}/${frame.id}`, title: frame.title, event: true });
    lightbox.classList.add('is-open');
    document.documentElement.classList.add('lightbox-open');
    lbClose.focus({ preventScroll: true });
  }
  function closeLightbox() {
    lightbox.classList.remove('is-open');
    document.documentElement.classList.remove('lightbox-open');
    if (lbState.opener && lbState.opener.focus) lbState.opener.focus({ preventScroll: true });
  }
  function nextFrame() { showFrame(lbState.slug, lbState.index + 1); }
  function prevFrame() { showFrame(lbState.slug, lbState.index - 1); }

  // Click the backdrop closes; clicks inside the image / arrows don't bubble
  // as close intents.
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  lbClose.addEventListener('click', closeLightbox);
  lightboxImg.addEventListener('click', (e) => e.stopPropagation());
  lbPrev.addEventListener('click', (e) => { e.stopPropagation(); prevFrame(); });
  lbNext.addEventListener('click', (e) => { e.stopPropagation(); nextFrame(); });

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('is-open')) return;
    if (e.key === 'Escape')          closeLightbox();
    else if (e.key === 'ArrowLeft')  prevFrame();
    else if (e.key === 'ArrowRight') nextFrame();
    else if (e.key === 'Tab') {
      // Keep keyboard focus inside the dialog.
      const items = [lbClose, lbPrev, lbNext].filter((b) => b.offsetParent !== null);
      const at = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(at + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });

  // Touch swipe (horizontal). Vertical swipes fall through to close.
  let touchStartX = null, touchStartY = null;
  lightbox.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = touchStartY = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) nextFrame(); else prevFrame();
    }
  });

  // ===== Read a chapter's frames from the inlined manifest =====
  // (An inline object instead of fetch() lets file:// double-clicks work.)
  function loadManifest(slug) {
    return (manifests && manifests[slug]) || { frames: [] };
  }

  // ===== Build one chapter block =====
  function buildChapter(chapter, idx, cover) {
    const section = document.createElement('section');
    section.className = 'chapter reveal';
    section.id = `stop-${chapter.number}`;
    // Alt chapters mirror horizontally (intro / hero swap sides).
    if (idx % 2 === 1) section.classList.add('chapter--alt');

    const intro = document.createElement('div');
    intro.className = 'chapter-intro';
    intro.innerHTML = `
      <p class="eyebrow">STOP ${chapter.number} · ${chapter.dates}</p>
      <h3 class="chapter-title">${chapter.city}<span class="chapter-region">${chapter.region}</span></h3>
      <p class="chapter-summary">${chapter.summary}</p>
      <ul class="chapter-notes">
        ${chapter.notes.map((n) => `<li>${n}</li>`).join('')}
      </ul>
    `;

    const grid = document.createElement('div');
    grid.className = 'chapter-grid';

    if (cover) {
      // Has-cover layout: [hero + intro] as a header row, then grid full width.
      section.classList.add('chapter--has-hero');
      const header = document.createElement('div');
      header.className = 'chapter-header';
      const heroSrc = `${FOLDER}/${chapter.slug}/${cover.thumb}`;
      const hero = document.createElement('div');
      hero.className = 'chapter-hero';
      hero.style.backgroundImage = `url('${heroSrc}')`;
      header.appendChild(hero);
      header.appendChild(intro);
      section.appendChild(header);
      section.appendChild(grid);
    } else {
      // No-cover layout: [intro | grid] sticky-sidebar (original design).
      section.appendChild(intro);
      section.appendChild(grid);
    }
    return { section, grid };
  }

  function addTile(grid, rel, frameNum, chapter) {
    const base = `${FOLDER}/${chapter.slug}`;
    const thumbSrc = `${base}/${rel.thumb}`;
    const fullSrc = `${base}/${rel.full}`;
    const label = String(frameNum).padStart(2, '0');
    // `title` comes from the chapter's captions.json; untitled frames
    // fall back to their number.
    const alt = rel.title || `${chapter.city} frame ${label}`;
    // Register this frame in the chapter's array so the lightbox
    // knows how to page prev/next.
    const list = chapterFrames[chapter.slug] || (chapterFrames[chapter.slug] = []);
    const frameIdx = list.length;
    list.push({
      src: fullSrc,
      srcset: srcsetOf(base, [[rel.md, rel.md_w], [rel.thumb, rel.w], [rel.full, rel.full_w]]),
      alt,
      // File stem: stays the same when photos are added and frames renumber.
      id: rel.thumb.split('/').pop().replace(/\.jpg$/i, ''),
      title: rel.title || `Frame ${label}`,
      city: chapter.city,
      shot: rel.shot || '',
    });

    const cell = document.createElement('a');
    // Shape drives the grid layout: portraits stay single-column,
    // wides span 2 cols, squares span 1 col but taller.
    cell.className = `grid-item shape-${rel.shape || 'square'}`;
    cell.href = fullSrc;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = alt;
    img.onerror = () => {
      // if the thumb is missing, fall back to the original; if that also fails, drop the tile
      if (!img.dataset.fallback) {
        img.dataset.fallback = '1';
        img.removeAttribute('srcset');
        img.src = fullSrc;
      } else {
        cell.remove();
      }
    };
    img.sizes = rel.shape === 'wide' ? TILE_SIZES.wide : TILE_SIZES.other;
    img.srcset = srcsetOf(base, [[rel.md, rel.md_w], [rel.thumb, rel.w]]);
    img.src = thumbSrc;
    cell.appendChild(img);
    const cap = document.createElement('span');
    cap.className = 'grid-caption';
    cap.textContent = `Frame ${label}`;
    cell.appendChild(cap);
    cell.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(chapter.slug, frameIdx);
    });
    grid.appendChild(cell);
  }

  // ===== Build chapter nav =====
  function buildNav() {
    const nav = document.getElementById('chapter-nav');
    const rail = document.getElementById('chapter-rail');
    CHAPTERS.forEach((c) => {
      const a = document.createElement('a');
      a.href = `#stop-${c.number}`;
      a.className = 'chapter-nav-link';
      a.innerHTML = `<span class="chapter-nav-num">${c.number}</span><span class="chapter-nav-city">${c.city}</span>`;
      nav.appendChild(a);

      // Mirror into the sticky rail
      const r = document.createElement('a');
      r.href = `#stop-${c.number}`;
      r.className = 'chapter-rail-link';
      r.dataset.stop = c.number;
      r.setAttribute('aria-label', c.city);
      r.innerHTML =
        `<span class="chapter-rail-dot"></span>` +
        `<span class="chapter-rail-label">${c.city}</span>`;
      rail.appendChild(r);
    });
  }

  // ===== Sticky rail: show after the intro, highlight current chapter =====
  function initChapterRail() {
    const rail = document.getElementById('chapter-rail');
    const intro = document.querySelector('.gallery-intro');
    const chapters = Array.from(document.querySelectorAll('.chapter'));
    if (!rail || !chapters.length) return;

    // Show the rail once the intro has scrolled past the top. (An
    // IntersectionObserver can't tell "still below, on the hero" from
    // "already above", and a jump straight past the intro never fires it.)
    if (intro) {
      const update = () =>
        rail.classList.toggle('is-visible', intro.getBoundingClientRect().bottom < 0);
      window.addEventListener('scroll', update, { passive: true });
      update();
    } else {
      rail.classList.add('is-visible');
    }

    // Highlight the chapter closest to the viewport top.
    const links = new Map(
      Array.from(rail.querySelectorAll('.chapter-rail-link'))
        .map((el) => [el.dataset.stop, el])
    );
    function setActive(stopNum) {
      links.forEach((el, key) =>
        el.classList.toggle('is-active', key === stopNum));
    }
    const activeObserver = new IntersectionObserver((entries) => {
      // pick the most-visible chapter this tick
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) {
        const stop = visible.target.id.replace('stop-', '');
        setActive(stop);
      }
    }, {
      rootMargin: '-30% 0px -55% 0px',
      threshold: [0, 0.25, 0.5, 0.75, 1],
    });
    chapters.forEach((c) => activeObserver.observe(c));
  }

  // Document position ignoring transforms (a .reveal still sliding in is
  // offset by translateY, which would skew getBoundingClientRect).
  function pageTop(el) {
    let y = 0;
    for (; el; el = el.offsetParent) y += el.offsetTop;
    return y;
  }

  // ===== Render everything =====
  buildNav();
  const chaptersEl = document.getElementById('chapters');
  let total = 0;

  CHAPTERS.forEach((chapter, idx) => {
    const manifest = loadManifest(chapter.slug);
    const frames = manifest.frames || [];
    const { section, grid } = buildChapter(chapter, idx, manifest.cover);
    chaptersEl.appendChild(section);

    frames.forEach((entry, i) => {
      // Manifest schema: entry = { thumb, md, full, w, md_w, full_w, shape,
      // title?, shot? },
      // paths relative to the chapter folder. (Older builds used a bare
      // filename string — fall back to that for compatibility.)
      const rel = (typeof entry === 'string')
        ? { thumb: `thumbs/${entry}`, full: entry }
        : entry;
      addTile(grid, rel, i + 1, chapter);
      total++;
    });

    if (frames.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'grid-item empty';
      empty.textContent = `Add ${chapter.city} photos to /${FOLDER}/${chapter.slug}/`;
      grid.appendChild(empty);
    }
  });

  document.getElementById('frame-count').textContent =
    total ? String(total).padStart(2, '0') : '—';

  observeReveals();
  initChapterRail();

  // ===== Handle URL hash to scroll to chapter =====
  if (window.location.hash) {
    const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (target) {
      target.classList.add('is-visible');
      requestAnimationFrame(() => {
        window.scrollTo({ top: pageTop(target), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    }
  }
})();
