import { useEffect, useRef, useState } from "react";

/**
 * Vertical parallax. Translates a layer at a fraction of scroll speed,
 * scoped to a host's viewport overlap. Updates only when on-screen.
 *
 * Usage:
 *   const { hostRef, layerRef } = useParallax(0.25);
 *   <div ref={hostRef}><img ref={layerRef} className="parallax-layer"/></div>
 */
export function useParallax<HostT extends HTMLElement = HTMLElement, LayerT extends HTMLElement = HTMLElement>(
  speed: number = 0.2,
) {
  const hostRef = useRef<HostT>(null);
  const layerRef = useRef<LayerT>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const host = hostRef.current;
    const layer = layerRef.current;
    if (!host || !layer) return;

    let visible = false;
    let frame = 0;

    const update = () => {
      const rect = host.getBoundingClientRect();
      const center = rect.top + rect.height / 2 - window.innerHeight / 2;
      const offset = -center * speed;
      layer.style.setProperty("--py", `${offset.toFixed(2)}px`);
    };

    const onScroll = () => {
      if (!visible) return;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) update();
      },
      { rootMargin: "200px 0px" },
    );

    observer.observe(host);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [speed]);

  return { hostRef, layerRef };
}

/**
 * Sets data-reveal="visible" on the element when it enters the viewport.
 * Pair with the [data-reveal] CSS rules in index.css.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { threshold?: number; once?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const { threshold = 0.15, once = true } = options;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.setAttribute("data-reveal", "");

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.setAttribute("data-reveal", "visible");
          if (once) observer.disconnect();
        } else if (!once) {
          el.setAttribute("data-reveal", "");
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, once]);

  return ref;
}

/**
 * Tracks page scroll progress (0 → 1). Returns a number, updates via rAF.
 */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const calc = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
      setProgress(ratio);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        calc();
      });
    };

    calc();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return progress;
}

/**
 * Mouse-aware tilt for elements with class `tilt-host`. Returns a ref + handlers.
 * Apply to a DIV that wraps the visible card; the inner `tilt-content` lifts up.
 */
export function useMouseTilt<T extends HTMLElement = HTMLDivElement>(opts: { max?: number; lift?: number } = {}) {
  const { max = 8, lift = -3 } = opts;
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const ry = (px - 0.5) * 2 * max;
      const rx = -(py - 0.5) * 2 * max;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty("--tilt-x", `${rx.toFixed(2)}deg`);
        el.style.setProperty("--tilt-y", `${ry.toFixed(2)}deg`);
        el.style.setProperty("--tilt-lift", `${lift}px`);
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
      });
    };

    const onLeave = () => {
      el.style.setProperty("--tilt-x", "0deg");
      el.style.setProperty("--tilt-y", "0deg");
      el.style.setProperty("--tilt-lift", "0px");
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [max, lift]);

  return ref;
}

/**
 * Tracks pointer position over the element and writes --mx / --my CSS vars.
 * Drives the .cursor-spot and .cursor-edge effects.
 */
export function useCursorPosition<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        el.style.setProperty("--mx", `${x.toFixed(1)}%`);
        el.style.setProperty("--my", `${y.toFixed(1)}%`);
      });
    };

    el.addEventListener("mousemove", onMove);
    return () => {
      el.removeEventListener("mousemove", onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return ref;
}

/**
 * Magnetic pull — element drifts slightly toward the cursor on hover.
 */
export function useMagnetic<T extends HTMLElement = HTMLButtonElement>(opts: { strength?: number } = {}) {
  const { strength = 0.22 } = opts;
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) * strength;
      const dy = (e.clientY - cy) * strength;
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        el.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      });
    };

    const onLeave = () => {
      el.style.transform = "translate3d(0, 0, 0)";
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [strength]);

  return ref;
}
