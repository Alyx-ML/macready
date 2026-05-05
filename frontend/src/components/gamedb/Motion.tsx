import type { JSX } from "react";
import { type CSSProperties, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from "react";
import { useCursorPosition, useParallax, useScrollProgress, useScrollReveal } from "../../hooks/useDesignMotion";

/* Reveal — wraps content in a div that fades + lifts in on scroll. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
} & HTMLAttributes<HTMLElement>) {
  const ref = useScrollReveal<HTMLElement>();
  const style = delay ? ({ transitionDelay: `${delay}ms` } as CSSProperties) : undefined;
  // Cast to any so we can assign the ref to whichever intrinsic element was chosen.
  const Component = Tag as any;
  return (
    <Component ref={ref} className={className} style={style} {...rest}>
      {children}
    </Component>
  );
}

/* ParallaxImage — image that translates vertically as the host scrolls. */
export function ParallaxImage({
  src,
  alt = "",
  speed = 0.18,
  scale = 1.12,
  hostClassName = "",
  className = "",
  ...rest
}: {
  src: string;
  alt?: string;
  speed?: number;
  scale?: number;
  hostClassName?: string;
  className?: string;
} & ImgHTMLAttributes<HTMLImageElement>) {
  const { hostRef, layerRef } = useParallax<HTMLDivElement, HTMLImageElement>(speed);
  return (
    <div ref={hostRef} className={`parallax-host relative ${hostClassName}`}>
      <img
        ref={layerRef}
        src={src}
        alt={alt}
        className={`parallax-layer ${className}`}
        style={{ ["--ps" as any]: scale }}
        {...rest}
      />
    </div>
  );
}

/* ScrollProgress — fixed top bar that fills with page scroll. */
export function ScrollProgress() {
  const progress = useScrollProgress();
  return <div className="scroll-progress" style={{ ["--progress" as any]: `${(progress * 100).toFixed(2)}%` }} />;
}

/* GlassPanel — Tahoe 26 liquid glass surface with optional sheen + grain. */
export function GlassPanel({
  intensity = "regular",
  sheen = true,
  grain = false,
  className = "",
  children,
  ...rest
}: {
  intensity?: "clear" | "regular" | "prominent";
  sheen?: boolean;
  grain?: boolean;
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
  const base =
    intensity === "clear"
      ? "glass-pane--clear"
      : intensity === "prominent"
        ? "glass-pane--prominent"
        : "glass-pane";
  return (
    <div
      className={[
        base,
        sheen ? "glass-sheen" : "",
        grain ? "grain-soft" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

/* CursorSpot — pointer-aware container; pair with .cursor-spot or .cursor-edge */
export function CursorSpot({
  className = "",
  children,
  edge = false,
  ...rest
}: {
  className?: string;
  children?: ReactNode;
  edge?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
  const ref = useCursorPosition<HTMLDivElement>();
  return (
    <div ref={ref} className={`cursor-spot ${edge ? "cursor-edge" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* NoiseField — fixed full-bleed grain overlay (use one per page max). */
export function NoiseField({ opacity = 0.08 }: { opacity?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[120] mix-blend-overlay"
      style={{
        opacity,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        backgroundSize: "240px 240px",
      }}
    />
  );
}

/* AmbientBlobs — slow-drifting white luminous blurs behind dark surfaces.
   Fully greyscale; reads as atmospheric depth, not "color". */
export function AmbientBlobs({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full opacity-[0.06] blur-[120px] animate-float-slow"
        style={{ background: "radial-gradient(circle, #fff, transparent 70%)" }}
      />
      <div
        className="absolute -bottom-32 -right-32 h-[480px] w-[480px] rounded-full opacity-[0.04] blur-[140px] animate-float-slow"
        style={{ background: "radial-gradient(circle, #fff, transparent 70%)", animationDelay: "-3s" }}
      />
    </div>
  );
}
