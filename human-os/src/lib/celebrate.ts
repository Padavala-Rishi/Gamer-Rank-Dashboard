// A small, tasteful burst of dots where you completed something. Skipped entirely when the
// user (or their system) prefers reduced motion.
const COLORS = ["var(--accent)", "#e0a93b", "#d9705f", "#5b8fd1", "#9a79c8"];

export function reducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.getAttribute("data-motion") === "reduce";
}

export function burst(from: Element | { x: number; y: number }, count = 12) {
  if (reducedMotion()) return;
  const pt = "getBoundingClientRect" in from ? (() => { const r = from.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })() : from;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 28 + Math.random() * 34;
    const size = 5 + Math.random() * 4;
    dot.style.cssText = `position:absolute;left:${pt.x}px;top:${pt.y}px;width:${size}px;height:${size}px;border-radius:${Math.random() > 0.5 ? "50%" : "2px"};background:${COLORS[i % COLORS.length]};transform:translate(-50%,-50%) scale(1);opacity:1;transition:transform 620ms cubic-bezier(.15,.8,.3,1),opacity 620ms ease-out`;
    layer.appendChild(dot);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        dot.style.transform = `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 14}px)) scale(.3) rotate(${Math.random() * 240}deg)`;
        dot.style.opacity = "0";
      }),
    );
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 760);
}
