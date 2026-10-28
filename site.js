// Shared by index.html, norway.html and iceland.html:
// split-text headings and the custom cursor.
(() => {
  // ===== Split-text animation for display headings =====
  function splitHeading(heading) {
    // Screen readers read the label instead of one span per letter.
    heading.setAttribute('aria-label', heading.textContent.trim().replace(/\s+/g, ' '));
    let charIndex = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach((word) => {
            if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(word)); return; }
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            Array.from(word).forEach((ch) => {
              const inner = document.createElement('span');
              inner.className = 'char';
              inner.style.setProperty('--char-i', charIndex++);
              inner.textContent = ch;
              wordSpan.appendChild(inner);
            });
            frag.appendChild(wordSpan);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
          walk(child);
        }
      });
    };
    walk(heading);
    heading.classList.add('split');
  }
  document.querySelectorAll('.display, .display-sm').forEach(splitHeading);

  // ===== Custom cursor (mouse / trackpad only) =====
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorRing = document.querySelector('.cursor-ring');
  if (!cursorDot || !cursorRing || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  // Hidden until the first mousemove; otherwise the dot sits in the top-left
  // corner and the ring in the middle of the hero text.
  let mouseX = 0, mouseY = 0;
  let ringX = 0, ringY = 0;
  let ringMoving = false;
  let seen = false;
  cursorDot.style.visibility = cursorRing.style.visibility = 'hidden';
  function animateRing() {
    ringX += (mouseX - ringX) * 0.15;
    ringY += (mouseY - ringY) * 0.15;
    cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
    // Stop once the ring has caught up; the next mousemove restarts it.
    if (Math.abs(mouseX - ringX) + Math.abs(mouseY - ringY) > 0.1) requestAnimationFrame(animateRing);
    else ringMoving = false;
  }
  function startRing() {
    if (ringMoving) return;
    ringMoving = true;
    requestAnimationFrame(animateRing);
  }
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX; mouseY = e.clientY;
    cursorDot.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0) translate(-50%, -50%)`;
    if (!seen) {
      // Start the ring on the pointer instead of flying in from the corner.
      seen = true;
      ringX = mouseX; ringY = mouseY;
      cursorDot.style.visibility = cursorRing.style.visibility = '';
    }
    startRing();
  });

  // Delegated, so the tiles gallery.js builds later get hover states too.
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('a, button, .grid-item');
    cursorRing.classList.toggle('is-hover', !!target);
    cursorRing.classList.toggle('is-view', !!target && target.classList.contains('grid-item'));
  });
})();
