/** One composited circle per link; no animation loop or text layout changes. */
export function mountInkHover(reduced: MediaQueryList) {
  document.querySelectorAll<HTMLElement>('.ink-link').forEach(link => {
    const ink = document.createElement('span');
    ink.className = 'link-ink'; ink.setAttribute('aria-hidden', 'true'); link.append(ink);
    let animation: Animation | undefined;
    let entering = false;
    function reveal(active: boolean, event?: PointerEvent) {
      if (reduced.matches || event?.pointerType === 'touch') return;
      const rect = link.getBoundingClientRect(), pad = 10;
      const x = event ? event.clientX - rect.left + pad : rect.width / 2 + pad;
      const y = event ? event.clientY - rect.top + 4 : rect.height / 2 + 4;
      const radius = Math.hypot(Math.max(x, rect.width + 2 * pad - x), Math.max(y, rect.height + 8 - y));
      const current = getComputedStyle(ink).clipPath;
      const from = active && !entering && (!animation || animation.playState === 'finished') ? `circle(0px at ${x}px ${y}px)` : current;
      animation?.cancel();
      animation = ink.animate([{clipPath: from}, {clipPath: `circle(${active ? radius : 0}px at ${x}px ${y}px)`}], {
        duration: active ? 650 : 550, easing: 'cubic-bezier(.22,.7,.2,1)', fill: 'forwards',
      });
      entering = active;
      link.dataset.ink = active ? 'enter' : 'leave';
    }
    link.addEventListener('pointerenter', event => reveal(true, event));
    link.addEventListener('pointerleave', event => reveal(false, event));
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) reveal(true); });
    link.addEventListener('blur', () => reveal(false));
    reduced.addEventListener('change', () => { animation?.cancel(); animation = undefined; entering = false; });
  });
}
