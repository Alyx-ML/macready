import { useCallback, useEffect, useRef, useState } from "react";
import LiquidGlass from "liquid-glass-react";
import type { User } from "../../types/gamedb";

interface MenuItemOption {
  label?: string;
  action?: string;
  shortcut?: string;
  type?: "item" | "separator";
  hasSubmenu?: boolean;
}

interface MenuConfig {
  label: string;
  items: MenuItemOption[];
}

interface MenuDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  items: MenuItemOption[];
  position: { x: number; y: number };
  onAction: (action: string) => void;
  /** Mouse-only — keeps hover-intent timers happy when pointer is over the panel. */
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

const APPLE_MENU_ITEMS: MenuItemOption[] = [
  { label: "About MacReady", action: "about" },
  { type: "separator" },
  { label: "Preferences...", action: "preferences", shortcut: "⌘," },
];

const MENUS: MenuConfig[] = [
  {
    label: "Sitemap",
    items: [
      { label: "Home", action: "home", shortcut: "⌘H" },
      { type: "separator" },
      { label: "News", action: "news" },
      { label: "Community", action: "community" },
      { label: "Discord", action: "discord" },
    ],
  },
  {
    label: "Compatibility",
    items: [
      { label: "Compatibility", action: "compatibility", shortcut: "⌘F" },
      { label: "Reports", action: "reports", shortcut: "⌘R" },
      { label: "Games", action: "games", shortcut: "⌘G" },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Submit Report", action: "submit-report", shortcut: "⇧⌘R" },
      { type: "separator" },
      { label: "Steam", action: "steam" },
      { label: "Crossover", action: "crossover" },
      { label: "Support", action: "support" },
    ],
  },
  {
    label: "Support",
    items: [
      { label: "Search MacReady", action: "compatibility", shortcut: "⌘F" },
      { type: "separator" },
      { label: "Keyboard Shortcuts", action: "shortcuts" },
      { label: "Contact Support", action: "support" },
    ],
  },
];

const MOBILE_MENU_ITEMS: MenuItemOption[] = [
  { label: "Home", action: "home" },
  { label: "Compatibility", action: "compatibility" },
  { label: "Games", action: "games" },
  { label: "Reports", action: "reports" },
  { type: "separator" },
  { label: "News", action: "news" },
  { label: "Community", action: "community" },
  { label: "Discord", action: "discord" },
  { type: "separator" },
  { label: "Submit Report", action: "submit-report" },
  { label: "Support", action: "support" },
];

function MenuDropdown({ isOpen, onClose, items, position, onAction, onPointerEnter, onPointerLeave }: MenuDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const panelHeight = items.reduce((height, item) => height + (item.type === "separator" ? 9 : 28), 4);
  const panelWidth = Math.max(
    150,
    Math.min(
      190,
      Math.max(
        ...items
          .filter((item) => item.type !== "separator")
          .map((item) => (item.label?.length ?? 0) * 7.8 + (item.shortcut ? 34 : 0) + (item.hasSubmenu ? 14 : 0) + 42)
      )
    )
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="mac-menu-dropdown absolute z-[60] rounded-xl"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        height: `${panelHeight}px`,
        width: `${panelWidth}px`,
      }}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        onPointerEnter?.();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        onPointerLeave?.();
      }}
    >
      <div className="menu-liquid-glass pointer-events-none absolute inset-[2px] overflow-hidden rounded-[10px] opacity-75">
        <LiquidGlass
          displacementScale={86}
          blurAmount={0.055}
          saturation={185}
          aberrationIntensity={1.8}
          elasticity={0}
          cornerRadius={10}
          mode="prominent"
          padding="0"
          style={{ position: "absolute", width: "100%", height: "100%" }}
        >
          <div className="h-full" style={{ width: `${panelWidth}px` }} />
        </LiquidGlass>
      </div>
      <div
        className="pointer-events-none absolute inset-[1px] rounded-[11px]"
        style={{
          background:
            "radial-gradient(110% 85% at 18% 0%, rgba(255,255,255,0.042), rgba(255,255,255,0.012) 36%, transparent 64%), radial-gradient(95% 80% at 82% 100%, rgba(160,185,230,0.026), transparent 58%), rgba(255,255,255,0.012)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-xl shadow-[0_20px_58px_rgba(0,0,0,0.34),inset_0_0_0_0.5px_rgba(255,255,255,0.026),inset_0_1px_0_rgba(255,255,255,0.018)]" />
      <div className="relative z-10 h-full w-full overflow-hidden rounded-xl py-0.5">
        {items.map((item, index) => {
          if (item.type === "separator") {
            return <div key={index} className="mx-2 my-1 h-px bg-white/15" />;
          }

          return (
            <button
              key={`${item.label}-${index}`}
              type="button"
              className="flex h-7 w-full cursor-pointer items-center justify-between px-4 text-left text-sm text-white transition-colors duration-100 hover:bg-white/10"
              onClick={() => {
                if (item.action) onAction(item.action);
                onClose();
              }}
            >
              <span className="flex items-center">
                {item.label}
                {item.hasSubmenu && (
                  <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="ml-1.5 opacity-55">
                    <path d="M5 2l6 6-6 6" />
                  </svg>
                )}
              </span>
              {item.shortcut && <span className="ml-4 text-xs text-white/60">{item.shortcut}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg width="14" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
      <path
        d="M17.057 10.45c-.015-2.484 2.03-3.677 2.118-3.73a3.782 3.782 0 0 0-2.955-1.597c-1.25-.126-2.43.74-3.064.74-.633 0-1.6-.724-2.642-.703a3.94 3.94 0 0 0-3.308 2.006c-1.393 2.417-.356 5.992 1.008 7.958.667.962 1.462 2.038 2.5 1.998 1.003-.04 1.38-.646 2.593-.646s1.55.646 2.61.625c1.08-.02 1.776-.974 2.44-1.942.766-1.119 1.083-2.203 1.101-2.261-.024-.01-2.13-.815-2.152-3.253zM14.93 4.298a3.616 3.616 0 0 0 .843-2.528 3.67 3.67 0 0 0-2.393 1.238 3.483 3.483 0 0 0-.877 2.442 3.1 3.1 0 0 0 2.427-1.152z"
        fill="white"
      />
    </svg>
  );
}

function MacMenuIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block">
      <rect x="5" y="4.75" width="14" height="4.5" rx="2.25" stroke="white" strokeWidth="1.8" />
      <rect x="5" y="14.75" width="14" height="4.5" rx="2.25" stroke="white" strokeWidth="1.8" />
      <circle cx="8" cy="7" r="1" fill="white" />
      <circle cx="16" cy="17" r="1" fill="white" />
    </svg>
  );
}

function formatTime() {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToCards() {
  document.getElementById("game-cards")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToFooter() {
  document.getElementById("footer")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusSearch() {
  const input = document.getElementById("spotlight-search") as HTMLInputElement | null;
  input?.focus();
}

export function TopNavbar({ user, onAccountClick, onNavigate }: { user: User | null; onAccountClick: () => void; onNavigate: (action: string) => void }) {
  const [currentTime, setCurrentTime] = useState(() => formatTime());
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const [scrolled, setScrolled] = useState(false);

  const appleLogoRef = useRef<HTMLButtonElement>(null);
  const menuRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  // Hover-intent timer — opening delay AND closing delay use the same timer.
  const hoverTimerRef = useRef<number | null>(null);
  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const updateTime = () => setCurrentTime(formatTime());
    updateTime();
    const interval = window.setInterval(updateTime, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  // Scroll-state ramp — Tahoe menu bar gets more saturated/opaque
  // once content is scrolling beneath it.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > 24);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  // Cleanup hover timer on unmount.
  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  const setPositionFromElement = useCallback((element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const parentRect = element.offsetParent?.getBoundingClientRect() || { left: 0 };
    setDropdownPosition({
      x: rect.left - parentRect.left,
      y: 34,
    });
  }, []);

  const openMenuFromElement = useCallback((menuKey: string, element: HTMLElement) => {
    setPositionFromElement(element);
    setActiveMenu(menuKey);
  }, [setPositionFromElement]);

  // ── Hover-intent logic ────────────────────────────────────────────────
  // Opening delay: 90ms (avoid accidental triggering as cursor passes through).
  // Switching: instant (when another menu is already open).
  // Closing delay: 220ms (lets cursor travel from trigger to dropdown).

  const HOVER_OPEN_DELAY = 90;
  const HOVER_CLOSE_DELAY = 220;

  const scheduleClose = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setActiveMenu(null);
      hoverTimerRef.current = null;
    }, HOVER_CLOSE_DELAY);
  }, [clearHoverTimer]);

  const cancelClose = useCallback(() => {
    clearHoverTimer();
  }, [clearHoverTimer]);

  const handleTriggerEnter = useCallback((menuKey: string, element: HTMLElement) => {
    clearHoverTimer();
    if (activeMenu === menuKey) return;
    if (activeMenu !== null) {
      // Already open: switch instantly (Apple menu bar behaviour).
      openMenuFromElement(menuKey, element);
      return;
    }
    // Closed: wait briefly to confirm intent.
    hoverTimerRef.current = window.setTimeout(() => {
      openMenuFromElement(menuKey, element);
      hoverTimerRef.current = null;
    }, HOVER_OPEN_DELAY);
  }, [activeMenu, clearHoverTimer, openMenuFromElement]);

  const handleAppleMenuClick = useCallback(() => {
    const menuKey = window.matchMedia("(max-width: 767px)").matches ? "mobile" : "apple";

    if (activeMenu === menuKey) {
      setActiveMenu(null);
      return;
    }

    if (appleLogoRef.current) {
      setPositionFromElement(appleLogoRef.current);
    }
    setActiveMenu(menuKey);
  }, [activeMenu, setPositionFromElement]);

  const handleMenuItemClick = useCallback((menuLabel: string) => {
    clearHoverTimer();
    if (activeMenu === menuLabel) {
      setActiveMenu(null);
      return;
    }

    const menuRef = menuRefs.current[menuLabel];
    if (menuRef) {
      setPositionFromElement(menuRef);
    }
    setActiveMenu(menuLabel);
  }, [activeMenu, setPositionFromElement, clearHoverTimer]);

  const closeDropdown = useCallback(() => {
    clearHoverTimer();
    setActiveMenu(null);
  }, [clearHoverTimer]);

  const handleMenuAction = useCallback((action: string) => {
    onNavigate(action);
    switch (action) {
      case "home":
      case "about":
        scrollToTop();
        break;
      case "compatibility":
      case "hardware":
      case "steam":
      case "crossover":
        focusSearch();
        break;
      case "reports":
      case "games":
        scrollToCards();
        break;
      case "news":
      case "community":
      case "discord":
      case "submit-report":
      case "support":
      case "preferences":
      case "shortcuts":
        scrollToFooter();
        break;
      default:
        break;
    }
  }, [onNavigate]);

  return (
    <div className="fixed inset-x-0 top-0 z-[80]">
      <style>{`
        .mac-menu-dropdown {
          opacity: 0;
          animation: macMenuFadeIn 90ms ease-out forwards;
          transform-origin: top center;
          will-change: opacity;
        }

        .mac-menu-dropdown * {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }

        @keyframes macMenuFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .menu-liquid-glass > * {
          top: 0 !important;
          left: 0 !important;
          transform: none !important;
          transition: none !important;
          animation: none !important;
        }

        .menu-liquid-glass .glass {
          width: 100% !important;
          height: 100% !important;
          padding: 0 !important;
        }
      `}</style>

      {/* Tahoe 26 menu bar — translucent, hairline-bordered, subtle saturation */}
      <div
        className={[
          "relative h-8 backdrop-blur-2xl border-b border-white/[0.06] transition-[background-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          scrolled
            ? "bg-black/72 supports-[backdrop-filter]:bg-black/58 supports-[backdrop-filter]:saturate-[2.2]"
            : "bg-black/55 supports-[backdrop-filter]:bg-black/40 supports-[backdrop-filter]:saturate-180",
        ].join(" ")}
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 0 rgba(0,0,0,0.4)",
        }}
      >
        <div className="flex h-full items-center justify-between px-3 sm:px-4">
          <div className="flex h-full items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              ref={appleLogoRef}
              onClick={handleAppleMenuClick}
              onPointerEnter={(e) => {
                if (e.pointerType !== "mouse") return;
                handleTriggerEnter("apple", appleLogoRef.current!);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType !== "mouse") return;
                scheduleClose();
              }}
              className="flex h-7 w-6 cursor-pointer items-center justify-center rounded-md transition-all duration-200 hover:bg-white/[0.08] active:bg-white/[0.12]"
              aria-label={activeMenu === "mobile" ? "Close sitemap" : "Open sitemap"}
            >
              {activeMenu === "mobile" ? <MacMenuIcon /> : <AppleLogo />}
            </button>

            <span className="inline-flex h-8 items-center px-1.5 text-[12px] font-semibold leading-none text-white tracking-[-0.005em]">
              {user ? user.display_name : "Guest"}
            </span>

            <div className="hidden h-8 items-center gap-0.5 md:flex">
              {MENUS.map((menu) => {
                const active = activeMenu === menu.label;
                return (
                  <span
                    key={menu.label}
                    ref={(element) => {
                      menuRefs.current[menu.label] = element;
                    }}
                    className={[
                      "relative inline-flex h-7 cursor-pointer select-none items-center rounded-md px-2 text-[12px] font-normal leading-none transition-all duration-200",
                      active
                        ? "bg-white/[0.10] text-white"
                        : "text-white/85 hover:bg-white/[0.06] hover:text-white",
                    ].join(" ")}
                    onClick={() => handleMenuItemClick(menu.label)}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return;
                      const el = menuRefs.current[menu.label];
                      if (el) handleTriggerEnter(menu.label, el);
                    }}
                    onPointerLeave={(e) => {
                      if (e.pointerType !== "mouse") return;
                      scheduleClose();
                    }}
                  >
                    {menu.label}
                  </span>
                );
              })}
            </div>
          </div>

          <div className="hidden items-center gap-1.5 md:flex">
            <button
              type="button"
              onClick={onAccountClick}
              className={user
                ? "group inline-flex h-7 items-center gap-2 rounded-full pr-2.5 pl-1 text-[12px] font-medium leading-none text-white/85 transition-all duration-200 hover:bg-white/[0.07] hover:text-white border border-transparent hover:border-white/[0.08]"
                : "inline-flex h-7 items-center px-2 text-[12px] font-medium leading-none text-white/85 transition-colors duration-200 hover:text-white"
              }
              title={user ? "Account" : "Sign in"}
            >
              {user && (
                <span className="h-5 w-5 overflow-hidden rounded-full ring-1 ring-white/15 group-hover:ring-white/30 transition-[box-shadow] duration-300">
                  <img src={`${import.meta.env.BASE_URL}imgs/ChatGPT Image May 4, 2026, 06_01_12 AM.webp`} alt="" className="h-full w-full object-cover" />
                </span>
              )}
              <span className="max-w-[160px] truncate">{user ? user.display_name : "Sign in"}</span>
            </button>
            <span className="ml-1 inline-flex h-7 select-none items-center px-2 text-[12px] font-medium leading-none text-white/85 font-mono-tabular tracking-[-0.005em]">
              {currentTime}
            </span>
          </div>
        </div>
      </div>

      <MenuDropdown
        isOpen={activeMenu === "apple"}
        onClose={closeDropdown}
        items={APPLE_MENU_ITEMS}
        position={dropdownPosition}
        onAction={handleMenuAction}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      />

      <MenuDropdown
        isOpen={activeMenu === "mobile"}
        onClose={closeDropdown}
        items={MOBILE_MENU_ITEMS}
        position={dropdownPosition}
        onAction={handleMenuAction}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      />

      {MENUS.map((menu) => (
        <MenuDropdown
          key={menu.label}
          isOpen={activeMenu === menu.label}
          onClose={closeDropdown}
          items={menu.items}
          position={dropdownPosition}
          onAction={handleMenuAction}
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        />
      ))}
    </div>
  );
}
