import { useEffect } from "react";

function shouldUseNativeScroll(target: EventTarget | null) {
  let node = target instanceof Element ? target : null;

  while (node && node !== document.body) {
    const tagName = node.tagName.toLowerCase();
    if (tagName === "textarea" || tagName === "select") return true;

    const style = window.getComputedStyle(node);
    const canScrollY =
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight;

    if (canScrollY) return true;
    node = node.parentElement;
  }

  return false;
}

function normalizeWheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * window.innerHeight;
  return event.deltaY;
}

export function SmoothScroll() {
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) return;

    let current = window.scrollY;
    let target = current;
    let frame = 0;
    let animating = false;
    let controlledScroll = false;

    const maxScroll = () =>
      Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

    const animate = () => {
      current += (target - current) * 0.28;

      if (Math.abs(target - current) < 0.35) {
        current = target;
        animating = false;
        controlledScroll = false;
        frame = 0;
        window.scrollTo(0, current);
        return;
      }

      window.scrollTo(0, current);
      frame = window.requestAnimationFrame(animate);
    };

    const start = () => {
      if (animating) return;
      animating = true;
      frame = window.requestAnimationFrame(animate);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (shouldUseNativeScroll(event.target)) return;

      const delta = normalizeWheelDelta(event);
      if (!delta) return;

      event.preventDefault();
      controlledScroll = true;
      target = Math.min(maxScroll(), Math.max(0, target + delta * 0.95));
      start();
    };

    const onScroll = () => {
      if (controlledScroll) return;
      current = window.scrollY;
      target = current;
    };

    const onResize = () => {
      target = Math.min(target, maxScroll());
      current = Math.min(current, maxScroll());
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}
