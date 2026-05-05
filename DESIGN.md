# MacGameDB Design Guidelines

## Core Philosophy
1. **Precise. Confident. Minimal.** The UI must feel like an engineering-grade tool, not a playful consumer app.
2. **Density over Decoration.** Pack information in efficiently (e.g., `max-w-[1600px]` grids). The user wants to see everything at once; avoid sparse, airy layouts.
3. **Data is the Interface.** Navigation and chrome should recede.
4. **Dark Mode First.** Backgrounds are deep blacks (`#000`, `#0a0a0a`, `#111`), borders are subtle (`border-white/5` to `border-[#2a2a2a]`), text is `text-white` for primary data and `text-white/60` (or similar) for secondary labels.

## Strict Directives for Agents
- **DO NOT TOUCH EXISTING LAYOUTS UNPROMPTED.** If the user asks for a specific component change, *only* change that component. Do not try to proactively "improve" the overall layout structure, header heights, or routing unless explicitly requested.
- **NO NPM PACKAGES FOR EFFECTS.** If a visual effect is requested (like Liquid Glass), build it natively using raw WebGL, Canvas, or standard DOM APIs. Do not install experimental npm packages.
- **Typography & Contrast:** Rely on strict typography (e.g., `Aeonik` font where specified). Ensure contrast is high enough for readability (do not use `text-white/15` for important labels; use `text-white/60` or `text-white`).
- **Layout Practices:** Center standalone call-to-actions appropriately when they sit at the bottom of a page (e.g., the Sign Out button is centered below content, not wrapped in a massive full-width block).

## Visual Language
- **Glassmorphism:** Achieved natively via Tailwind utilities: `bg-black/40 backdrop-blur-3xl border border-white/5`.
- **Hover States:** Subtle, smooth, and premium. Examples include `group-hover:scale-[1.05] transition-transform duration-500`, or bringing border opacity from `5%` to `20%` / `30%`.
- **Media:** The Hero Video must be `object-contain`. Do not force `object-cover` or artificial scaling that crops the content.

## Warning
The user is extremely meticulous about layout stability. A small, unauthorized change to a container's width, a video's object-fit, or injecting unrequested components will result in immediate rejection. Proceed with surgical precision.
