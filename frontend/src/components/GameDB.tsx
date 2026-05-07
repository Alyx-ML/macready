import { forwardRef, useState, useCallback, useMemo, useRef, useEffect, type Dispatch, type HTMLAttributes, type RefObject, type SetStateAction } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { Game, MacNewsCategory, MacNewsItem, UserHardware } from "../types/gamedb";
import { listGames, getDistinctValues, createGame, getMe, getMacNews, getAppStoreDetails, getSteamTrending, searchSteamCatalog, searchAppStore, isStaticDataMode, type SteamCatalogItem } from "../api/gamedb";
import { FloatingAgentChat } from "./FloatingAgentChat";
import { LoadingCards, GameCard, TierBadge } from "./gamedb/GameCards";
import { GameDetailView } from "./gamedb/GameDetailView";
import { AuthModal } from "./gamedb/AuthModal";
import { AccountPage } from "./gamedb/AccountPage";
import { TopNavbar } from "./gamedb/TopNavbar";
import { LiquidGlass } from "./gamedb/LiquidGlass";
import { getTierConfig, NEW_TIERS } from "./gamedb/tierConfig";
import { Apple, ChevronLeft, ChevronRight, Gamepad2, ListOrdered, ScrollText, ShoppingBag, Star, type LucideIcon } from "lucide-react";

type MainView = "home" | "compatibility";

const COMPATIBILITY_VISIBLE_COUNT_KEY = "macready:compatibility:visible-count";
const COMPATIBILITY_SCROLL_TOP_KEY = "macready:compatibility:scroll-top";
const INITIAL_COMPATIBILITY_CARD_COUNT = 15;
const COMPATIBILITY_CARD_LOAD_STEP = 15;

function readSessionNumber(key: string, defaultValue: number) {
  if (typeof window === "undefined") return defaultValue;
  const value = Number(window.sessionStorage.getItem(key));
  return Number.isFinite(value) && value >= 0 ? value : defaultValue;
}

function writeSessionNumber(key: string, value: number) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, String(Math.max(0, Math.round(value))));
}

type SessionJSONValue<T> = {
  savedAt: number;
  value: T;
};

function readSessionJSON<T>(key: string, maxAgeMs: number): T | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as SessionJSONValue<T>;
    if (!parsed || Date.now() - parsed.savedAt > maxAgeMs) return undefined;
    return parsed.value;
  } catch {
    window.sessionStorage.removeItem(key);
    return undefined;
  }
}

function writeSessionJSON<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
}

type ScrollShadowProps = HTMLAttributes<HTMLDivElement> & {
  hideScrollBar?: boolean;
};

const ScrollShadow = forwardRef<HTMLDivElement, ScrollShadowProps>(function ScrollShadow({ hideScrollBar: _hideScrollBar, className = "", ...props }, ref) {
  return <div ref={ref} className={className} {...props} />;
});

function formatLockTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatLockDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function getSizedImageUrl(url: string, size: number) {
  if (url.includes("mzstatic.com/image/thumb/")) {
    return url.replace(/\/\d+x\d+bb\.(png|jpg|jpeg|webp)(\?.*)?$/i, `/${size}x${size}bb.$1$2`);
  }

  if (url.startsWith("http") && (url.includes("9to5mac.com/") || url.includes("appleinsider.com/"))) {
    const imageUrl = new URL(url);
    imageUrl.searchParams.set("w", String(size));
    return imageUrl.toString();
  }

  return url;
}

function getImageSrcSet(url: string, sizes: number[]) {
  const entries = sizes.map((size) => `${getSizedImageUrl(url, size)} ${size}w`);
  const uniqueEntries = Array.from(new Set(entries));
  return uniqueEntries.length > 1 ? uniqueEntries.join(", ") : undefined;
}

const APPLE_SILICON_CHIPS = [
  "M1", "M1 Pro", "M1 Max", "M1 Ultra",
  "M2", "M2 Pro", "M2 Max", "M2 Ultra",
  "M3", "M3 Pro", "M3 Max",
  "M4", "M4 Pro", "M4 Max", "M4 Ultra"
];

const MACOS_VERSIONS = [
  "macOS 26 Tahoe",
  "macOS 15 Sequoia",
  "macOS 14 Sonoma",
  "macOS 13 Ventura",
  "macOS 12 Monterey",
  "macOS 11 Big Sur"
];

const ADULT_STEAM_TERMS = [
  "ahegao",
  "bdsm",
  "boobs",
  "breast",
  "brothel",
  "busty",
  "ecchi",
  "eroge",
  "erotic",
  "femboy",
  "futa",
  "futanari",
  "harem",
  "hentai",
  "incest",
  "lewd",
  "milf",
  "nsfw",
  "nude",
  "nudity",
  "porn",
  "pornographic",
  "seduce",
  "sex",
  "sexual",
  "sexy",
  "succubus",
  "tentacle",
  "waifu",
  "yuri"
];

const ADULT_STEAM_PHRASES = [
  "erotic visual novel",
  "sexual content",
  "adult only"
];

const LOW_QUALITY_MAIN_FEED_TERMS = [
  "chatgpt",
  "shovelware",
  "assetflip"
];

const LOW_QUALITY_MAIN_FEED_PHRASES = [
  "ai generated",
  "generated by ai",
  "made with ai",
  "ai art",
  "ai girlfriend",
  "ai companion",
  "asset flip",
  "low effort"
];

function normalizeSteamFilterText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}

function isAdultSteamItem(item: SteamCatalogItem) {
  const haystack = normalizeSteamFilterText([
    item.name,
    item.description ?? "",
    item.genres?.join(" ") ?? "",
    item.compatibility_reasons?.join(" ") ?? ""
  ].join(" "));
  const tokens = new Set(haystack.split(/\s+/).filter(Boolean));

  return ADULT_STEAM_TERMS.some((term) => tokens.has(term)) ||
    ADULT_STEAM_PHRASES.some((phrase) => haystack.includes(phrase));
}

function isLowQualityMainFeedItem(item: SteamCatalogItem) {
  const haystack = normalizeSteamFilterText([
    item.name,
    item.description ?? "",
    item.genres?.join(" ") ?? "",
    item.compatibility_reasons?.join(" ") ?? ""
  ].join(" "));
  const tokens = new Set(haystack.split(/\s+/).filter(Boolean));

  return LOW_QUALITY_MAIN_FEED_TERMS.some((term) => tokens.has(term)) ||
    LOW_QUALITY_MAIN_FEED_PHRASES.some((phrase) => haystack.includes(phrase));
}

const NON_GAME_STEAM_NAMES = new Set(["steam controller", "steam deck", "steam link"]);

function isNonGameSteamItem(item: SteamCatalogItem) {
  return NON_GAME_STEAM_NAMES.has(normalizeSteamFilterText(item.name));
}

function cleanArticleText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&rsquo;|&lsquo;/gi, "'")
    .replace(/&rdquo;|&ldquo;/gi, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function formatArticleParagraphs(value: string) {
  const cleaned = cleanArticleText(value);

  if (!cleaned) {
    return [];
  }

  const numberedSections = cleaned.split(/\s+(?=\d+\.\s)/).map((section) => section.trim()).filter(Boolean);

  if (numberedSections.length > 2) {
    return numberedSections;
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]+(?:["')\]]+)?|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [cleaned];
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }

  return paragraphs;
}

function titleCaseDetailValue(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function hasSteamCover(item: SteamCatalogItem) {
  const value = item.cover_art_url?.trim();
  return Boolean(value && /^https?:\/\//.test(value));
}

function steamHeaderImageUrl(appId: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

type GameDBProps = {
  routeView?: MainView;
  routeDetailId?: number | null;
  routeAccount?: boolean;
};

export function GameDB({ routeView = "home", routeDetailId = null, routeAccount = false }: GameDBProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routePathname = useLocation({ select: (location) => location.pathname });
  const previousRoutePathname = useRef(routePathname);
  const [detailId, setDetailId] = useState<number | null>(routeDetailId);
  const [showAccount, setShowAccount] = useState(false);
  const [showAccountPage, setShowAccountPage] = useState(routeAccount);
  const [mainView, setMainView] = useState<MainView>(routeView);
  const [pageTransitionKey, setPageTransitionKey] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTime, setLockTime] = useState(() => formatLockTime());
  const [lockDate, setLockDate] = useState(() => formatLockDate());
  const lockedAtRef = useRef(0);
  const runPageCrossfade = useCallback((update: () => void, afterUpdate?: () => void) => {
    update();
    afterUpdate?.();
    setPageTransitionKey((key) => key + 1);
  }, []);
  const goHome = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);
  const goCompatibility = useCallback(() => {
    navigate({ to: "/compatibility" });
  }, [navigate]);
  const goAccount = useCallback(() => {
    navigate({ to: "/account" });
  }, [navigate]);
  const goGameDetail = useCallback((id: number) => {
    navigate({ to: "/compatibility/$gameId", params: { gameId: String(id) } });
  }, [navigate]);

  useEffect(() => {
    if (previousRoutePathname.current === routePathname) return;
    previousRoutePathname.current = routePathname;
    runPageCrossfade(() => {
      setDetailId(routeDetailId);
      setShowAccountPage(routeAccount);
      setMainView(routeView);
    });
  }, [routeAccount, routeDetailId, routePathname, routeView, runPageCrossfade]);

  const handleAccountClick = useCallback(() => {
    if (user) {
      runPageCrossfade(() => {
        setDetailId(null);
        setShowAccountPage(true);
      }, goAccount);
    } else {
      setShowAccount(true);
    }
  }, [goAccount, runPageCrossfade, user]);
  const handleNavAction = useCallback((action: string) => {
    if (action === "lock-screen") {
      lockedAtRef.current = Date.now();
      setIsLocked(true);
      return;
    }

    if (action === "home" || action === "about" || action === "news" || action === "community") {
      runPageCrossfade(() => {
        setDetailId(null);
        setShowAccountPage(false);
        setMainView("home");
        goHome();
      }, () => {
        if (action === "news") {
          document.getElementById("macready-news")?.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
      });
      return;
    }

    if (["compatibility", "hardware", "steam", "crossover", "games", "reports", "submit-report"].includes(action)) {
      runPageCrossfade(() => {
        setDetailId(null);
        setShowAccountPage(false);
        setMainView("compatibility");
        goCompatibility();
      }, () => {
        if (action === "games" || action === "reports") {
          document.getElementById("game-cards")?.scrollIntoView({ behavior: "auto", block: "start" });
        } else {
          window.scrollTo({ top: 0, behavior: "auto" });
          document.getElementById("spotlight-search")?.focus();
        }
      });
    }
  }, [goCompatibility, goHome, runPageCrossfade]);

  useEffect(() => {
    const videos = Array.from(document.querySelectorAll("video"));

    if (isLocked) {
      setLockTime(formatLockTime());
      setLockDate(formatLockDate());
      videos.forEach((video) => video.pause());
      return;
    }

    videos.forEach((video) => {
      if (video.autoplay) {
        video.play().catch(() => undefined);
      }
    });
  }, [isLocked]);

  useEffect(() => {
    if (!isLocked) return;

    const interval = window.setInterval(() => {
      setLockTime(formatLockTime());
      setLockDate(formatLockDate());
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isLocked]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [wineFilter, setWineFilter] = useState("");
  const [macosFilter, setMacosFilter] = useState("");
  const [hwFilter, setHwFilter] = useState("");

  const [steamResults, setSteamResults] = useState<SteamCatalogItem[]>([]);
  const [steamLoading, setSteamLoading] = useState(false);
  const [addingSteamId, setAddingSteamId] = useState<string | null>(null);
  const [primaryHardware, setPrimaryHardware] = useState<UserHardware | null>(null);
  const [compatibilityVisibleSteamCount, setCompatibilityVisibleSteamCount] = useState(() => Math.max(INITIAL_COMPATIBILITY_CARD_COUNT, readSessionNumber(COMPATIBILITY_VISIBLE_COUNT_KEY, INITIAL_COMPATIBILITY_CARD_COUNT)));
  const compatibilityScrollTopRef = useRef(readSessionNumber(COMPATIBILITY_SCROLL_TOP_KEY, 0));
  const compatibilityScrollSaveTimer = useRef<number | null>(null);
  const compatibilityImagePreloadCache = useRef<Set<string>>(new Set());

  const rememberCompatibilityScrollTop = useCallback((scrollTop: number) => {
    compatibilityScrollTopRef.current = scrollTop;
    if (typeof window === "undefined") return;
    if (compatibilityScrollSaveTimer.current !== null) {
      window.clearTimeout(compatibilityScrollSaveTimer.current);
    }
    compatibilityScrollSaveTimer.current = window.setTimeout(() => {
      writeSessionNumber(COMPATIBILITY_SCROLL_TOP_KEY, compatibilityScrollTopRef.current);
      compatibilityScrollSaveTimer.current = null;
    }, 180);
  }, []);

  useEffect(() => {
    writeSessionNumber(COMPATIBILITY_VISIBLE_COUNT_KEY, compatibilityVisibleSteamCount);
  }, [compatibilityVisibleSteamCount]);

  useEffect(() => {
    return () => {
      if (compatibilityScrollSaveTimer.current !== null) {
        window.clearTimeout(compatibilityScrollSaveTimer.current);
      }
      writeSessionNumber(COMPATIBILITY_SCROLL_TOP_KEY, compatibilityScrollTopRef.current);
    };
  }, []);

  const filterKey = [statusFilter, wineFilter, macosFilter, hwFilter];
  const gamesSessionKey = `macready:compatibility:games:${filterKey.join("|")}`;
  const { data: games, isLoading } = useQuery({
    queryKey: ["gamedb", "games", ...filterKey],
    queryFn: () =>
      listGames({
        status: statusFilter || undefined,
        wine_version: wineFilter || undefined,
        macos_version: macosFilter || undefined,
        hardware: hwFilter || undefined,
      }),
    enabled: mainView === "compatibility" || detailId !== null,
    staleTime: 10 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    initialData: () => readSessionJSON<Game[]>(gamesSessionKey, 60 * 60_000),
    initialDataUpdatedAt: 0,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!games || isStaticDataMode) return;
    writeSessionJSON(gamesSessionKey, games);
  }, [games, gamesSessionKey]);
  const { data: macNews, isLoading: isMacNewsLoading } = useQuery({
    queryKey: ["gamedb", "mac-news", "structured-release-notes"],
    queryFn: getMacNews,
    staleTime: 5 * 60_000,
  });
  
  useEffect(() => {
    if (isStaticDataMode) return;
    getMe().then((data: any) => {
      if (data) {
        setUser(data.user);
        setPrimaryHardware(data.hardware?.find((item: UserHardware) => item.is_primary) || data.hardware?.[0] || null);
      }
    });
  }, []);

  const { data: trendingSteam = [], isLoading: isTrendingSteamLoading } = useQuery({
    queryKey: ["gamedb", "steam", "trending"],
    queryFn: async () => {
      const items = await getSteamTrending();
      return items.filter((item: SteamCatalogItem) => hasSteamCover(item) && !isAdultSteamItem(item) && !isNonGameSteamItem(item));
    },
    enabled: mainView === "compatibility",
    staleTime: 30 * 60_000,
    gcTime: 2 * 60 * 60_000,
    refetchOnWindowFocus: false,
    initialData: () => readSessionJSON<SteamCatalogItem[]>("macready:compatibility:steam-trending", 2 * 60 * 60_000),
    initialDataUpdatedAt: 0,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (trendingSteam.length === 0 || isStaticDataMode) return;
    writeSessionJSON("macready:compatibility:steam-trending", trendingSteam);
  }, [trendingSteam]);

  useEffect(() => {
    if (mainView !== "compatibility" || trendingSteam.length === 0) return;
    const urls = trendingSteam
      .map((item) => item.steam_app_id ? steamHeaderImageUrl(item.steam_app_id) : item.cover_art_url)
      .filter((url): url is string => Boolean(url))
      .slice(0, 24);

    urls.forEach((url) => {
      if (compatibilityImagePreloadCache.current.has(url)) return;
      compatibilityImagePreloadCache.current.add(url);
      const image = new Image();
      image.decoding = "async";
      image.src = url;
    });
  }, [mainView, trendingSteam]);

  useEffect(() => {
    if (!search.trim()) { setSteamResults([]); return; }
    const timer = setTimeout(() => {
      setSteamLoading(true);
      searchSteamCatalog({ q: search, status: statusFilter || undefined })
        .then(items => { setSteamResults(items.filter((item: SteamCatalogItem) => hasSteamCover(item) && !isAdultSteamItem(item) && !isNonGameSteamItem(item))); setSteamLoading(false); })
        .catch(err => { console.error("Failed to fetch search:", err); setSteamLoading(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [search, statusFilter]);

  const handleAddSteamGame = async (item: SteamCatalogItem) => {
    if (isStaticDataMode) {
      runPageCrossfade(() => setDetailId(Number(item.steam_app_id)), () => goGameDetail(Number(item.steam_app_id)));
      return;
    }
    setAddingSteamId(item.steam_app_id);
    try {
      const res = await createGame({
        name: item.name,
        steam_app_id: item.steam_app_id,
        cover_art_url: item.cover_art_url,
        genre: item.genres?.slice(0, 3).join(", "),
        platform: item.mac_native ? "Steam, Mac" : "Steam",
        store_url: `https://store.steampowered.com/app/${item.steam_app_id}`,
      });
      qc.invalidateQueries({ queryKey: ["gamedb"] });
      runPageCrossfade(() => setDetailId(res.id), () => goGameDetail(res.id));
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) {
        const existing = (games || []).find(g => g.steam_app_id === item.steam_app_id || g.name === item.name);
        if (existing) runPageCrossfade(() => setDetailId(existing.id), () => goGameDetail(existing.id));
      } else {
        alert(e.message);
      }
    }
    setAddingSteamId(null);
  };

  const enableCompatibilityData = mainView === "compatibility";
  const { data: distinctWine } = useQuery({ queryKey: ["gamedb", "distinct", "wine_version"], queryFn: () => getDistinctValues("wine_version"), staleTime: 30 * 60_000, gcTime: 2 * 60 * 60_000, refetchOnWindowFocus: false, enabled: enableCompatibilityData });
  const { data: distinctMacos } = useQuery({ queryKey: ["gamedb", "distinct", "macos_version"], queryFn: () => getDistinctValues("macos_version"), staleTime: 30 * 60_000, gcTime: 2 * 60 * 60_000, refetchOnWindowFocus: false, enabled: enableCompatibilityData });
  const { data: distinctHw } = useQuery({ queryKey: ["gamedb", "distinct", "hardware"], queryFn: () => getDistinctValues("hardware"), staleTime: 30 * 60_000, gcTime: 2 * 60 * 60_000, refetchOnWindowFocus: false, enabled: enableCompatibilityData });

  const pageViewKey = [pageTransitionKey, showAccountPage ? "account" : detailId !== null ? `game-${detailId}` : mainView].join(":");

  return (
    <div className="min-h-screen bg-black text-white relative">
      <style>{`
        .macready-site-paused * {
          animation-play-state: paused !important;
        }
      `}</style>
      <div className="pointer-events-none fixed inset-0 z-[9999] mix-blend-overlay opacity-[0.12]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      <div className={isLocked ? "macready-site-paused" : undefined}>
        <div className="mac-menu-bar fixed inset-x-0 top-0 z-30">
          <TopNavbar user={user} onAccountClick={handleAccountClick} onNavigate={handleNavAction} />
        </div>

        <div className="relative min-h-screen">
        <AnimatePresence initial={false} mode="sync">
          <motion.main
            key={pageViewKey}
            className="mac-page-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
      <div className="relative w-full h-[35vh] min-h-[245px] max-h-[350px] overflow-hidden">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-contain" src={`${import.meta.env.BASE_URL}media/hero.webm`} />
        <div className="absolute inset-y-0 left-0 w-[30%] bg-gradient-to-r from-black via-black/90 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-[30%] bg-gradient-to-l from-black via-black/90 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-black via-black/80 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black pointer-events-none z-10" />
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
              <h1 className="text-[32px] font-bold tracking-tight text-white drop-shadow-lg" style={{ fontFamily: 'Aeonik, sans-serif' }}>MacReady</h1>
              <p className="text-[14px] text-white/50 mt-1" style={{ fontFamily: 'Aeonik, sans-serif' }}>A clearer way to judge Mac game support</p>
        </div>
        
        {showAccount && (
          <AuthModal 
            user={user}
            onClose={() => setShowAccount(false)} 
            onLoggedIn={(u) => { setUser(u); setShowAccount(false); }}
          />
        )}
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-4 sm:px-6 pb-12">
            {showAccountPage ? (
              <AccountPage
                onBack={() => runPageCrossfade(() => setShowAccountPage(false), goHome)}
                onLogout={() => {
                  setUser(null);
                  runPageCrossfade(() => setShowAccountPage(false), goHome);
                }}
              />
            ) : detailId !== null ? (
              <GameDetailView gameId={detailId} primaryHardware={primaryHardware} onBack={() => runPageCrossfade(() => setDetailId(null), goCompatibility)} onAddTest={() => qc.invalidateQueries({ queryKey: ["gamedb", "game", detailId] })} />
            ) : mainView === "home" ? (
              <HomeEditorialPage
                newsItems={macNews ?? []}
                isLoading={isMacNewsLoading}
                onOpenCompatibility={() => runPageCrossfade(() => {
                  setDetailId(null);
                  setShowAccountPage(false);
                  setMainView("compatibility");
                }, () => {
                  goCompatibility();
                  window.scrollTo({ top: 0, behavior: "auto" });
                })}
              />
            ) : (
              <GameListView
                games={games ?? []}
                isLoading={isLoading}
                search={search}
                setSearch={setSearch}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                distinctWine={distinctWine ?? []}
                distinctMacos={distinctMacos ?? []}
                distinctHw={distinctHw ?? []}
                wineFilter={wineFilter}
                setWineFilter={setWineFilter}
                macosFilter={macosFilter}
                setMacosFilter={setMacosFilter}
                hwFilter={hwFilter}
                setHwFilter={setHwFilter}
                onOpenDetail={(id) => runPageCrossfade(() => setDetailId(id), () => goGameDetail(id))}
                steamResults={steamResults}
                steamLoading={steamLoading}
                addingSteamId={addingSteamId}
                onAddSteamGame={handleAddSteamGame}
                trendingSteam={trendingSteam}
                isTrendingSteamLoading={isTrendingSteamLoading}
                visibleSteamCount={compatibilityVisibleSteamCount}
                setVisibleSteamCount={setCompatibilityVisibleSteamCount}
                initialSteamScrollTop={compatibilityScrollTopRef.current}
                onSteamScrollTopChange={rememberCompatibilityScrollTop}
                primaryHardware={primaryHardware}
              />
            )}
      </div>

      <FlickeringFooter />
          </motion.main>
        </AnimatePresence>
      </div>
      <FloatingAgentChat mode="gamedb" onFileChange={() => qc.invalidateQueries({ queryKey: ["gamedb", "games"] })} />
      </div>
      {isLocked && (
        <button
          type="button"
          aria-label="Move pointer to unlock MacReady"
          className="fixed inset-0 z-[10000] cursor-default overflow-hidden bg-black/36 text-white backdrop-blur-2xl"
          onPointerMove={() => {
            if (Date.now() - lockedAtRef.current < 300) return;
            setIsLocked(false);
          }}
          onFocus={() => undefined}
        >
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(230,242,255,0.2),transparent_22%),radial-gradient(circle_at_50%_58%,rgba(150,184,210,0.12),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.56))]" />
          <span className="pointer-events-none absolute inset-x-0 top-[7vh] flex flex-col items-center px-6 text-center sm:top-[6vh]">
            <span className="mb-[-12px] text-[18px] font-semibold tracking-[-0.02em] text-white/64 [text-shadow:0_1px_16px_rgba(255,255,255,0.22),0_2px_14px_rgba(0,0,0,0.42)] sm:mb-[-18px] sm:text-[22px]">
              {lockDate}
            </span>
            <svg
              viewBox="0 0 760 220"
              className="h-[142px] w-[min(760px,calc(100vw-24px))] overflow-visible sm:h-[198px]"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="tahoe-clock-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgba(235,245,250,0.34)" />
                  <stop offset="42%" stopColor="rgba(190,214,228,0.2)" />
                  <stop offset="100%" stopColor="rgba(245,250,252,0.28)" />
                </linearGradient>
                <filter id="tahoe-clock-depth" x="-8%" y="-10%" width="116%" height="120%">
                  <feDropShadow dx="0" dy="1.4" stdDeviation="0.8" floodColor="rgba(0,0,0,0.28)" />
                </filter>
              </defs>
              <text
                x="380"
                y="158"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="Aeonik, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
                fontSize="148"
                fontWeight="700"
                letterSpacing="0"
                fill="url(#tahoe-clock-fill)"
                filter="url(#tahoe-clock-depth)"
              >
                {lockTime}
              </text>
              <text
                x="380"
                y="158"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="Aeonik, -apple-system, BlinkMacSystemFont, system-ui, sans-serif"
                fontSize="148"
                fontWeight="700"
                letterSpacing="0"
                fill="rgba(255,255,255,0.08)"
              >
                {lockTime}
              </text>
            </svg>
          </span>
          <span className="pointer-events-none absolute inset-x-0 bottom-[12vh] flex flex-col items-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.16] bg-white/[0.12] text-white/82 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="5.5" y="10" width="13" height="10" rx="2.8" stroke="currentColor" strokeWidth="1.75" />
                <path d="M8.4 10V7.4C8.4 5.3 10 3.8 12 3.8s3.6 1.5 3.6 3.6V10" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
            </span>
            <span className="text-[13px] font-semibold text-white/72">MacReady</span>
            <span className="mt-1 text-[11px] font-medium text-white/48">Move pointer to wake</span>
          </span>
        </button>
      )}
    </div>
  );
}

function GameListView({
  games, isLoading, search, setSearch, statusFilter, setStatusFilter,
  distinctWine,
  wineFilter, setWineFilter, macosFilter, setMacosFilter, hwFilter, setHwFilter,
  onOpenDetail, steamResults, steamLoading, addingSteamId, onAddSteamGame, trendingSteam, isTrendingSteamLoading,
  visibleSteamCount, setVisibleSteamCount, initialSteamScrollTop, onSteamScrollTopChange,
  primaryHardware
}: {
  games: Game[]; isLoading: boolean; search: string; setSearch: (s: string) => void;
  statusFilter: string; setStatusFilter: (s: string) => void;
  distinctWine: string[]; distinctMacos: string[]; distinctHw: string[];
  wineFilter: string; setWineFilter: (s: string) => void;
  macosFilter: string; setMacosFilter: (s: string) => void;
  hwFilter: string; setHwFilter: (s: string) => void;
  onOpenDetail: (id: number) => void;
  steamResults: any[]; steamLoading: boolean; addingSteamId: string | null; onAddSteamGame: (item: any) => void;
  trendingSteam: any[];
  isTrendingSteamLoading: boolean;
  visibleSteamCount: number;
  setVisibleSteamCount: Dispatch<SetStateAction<number>>;
  initialSteamScrollTop: number;
  onSteamScrollTopChange: (scrollTop: number) => void;
  primaryHardware?: UserHardware | null;
}) {
  const [hoveredFilter, setHoveredFilter] = useState<string | null>(null);
  const [openFilterMenu, setOpenFilterMenu] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const steamScrollerRef = useRef<HTMLDivElement>(null);
  const restoredSteamScrollRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "f")) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!openFilterMenu) return;
    const close = () => setOpenFilterMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openFilterMenu]);

  const filtered = useMemo(() => {
    let list = games;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          (g.platform ?? "").toLowerCase().includes(q) ||
          (g.genre ?? "").toLowerCase().includes(q) ||
          g.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    return list;
  }, [games, search]);

  const hasActiveFilters = statusFilter || wineFilter || macosFilter || hwFilter;

  const filterButtons = [
    { id: 'status', label: 'Status', current: statusFilter, set: setStatusFilter, options: NEW_TIERS, labels: Object.fromEntries(NEW_TIERS.map(t => [t, getTierConfig(t).label])),
      icon: <svg viewBox="0 0 24 24" fill="none" className="filter-minimal-icon filter-check-outline" aria-hidden="true"><path d="M6.7 12.4 10.3 16 17.5 8.2"/></svg> },
    { id: 'wine', label: 'Wine', current: wineFilter, set: setWineFilter, options: (distinctWine || []), labels: {} as Record<string, string>,
      icon: <svg viewBox="0 0 24 24" fill="none" className="filter-minimal-icon filter-wine-outline" aria-hidden="true"><path d="M8.4 3.6c-.5 1.6-.8 3.4-.8 5.1 0 3.9 1.8 6.3 4.4 6.3s4.4-2.4 4.4-6.3c0-1.7-.3-3.5-.8-5.1H8.4Z"/><path d="M8 8.5c2.1 1 5.9 1 8 0"/><path d="M12 15v5"/><path d="M8.7 20h6.6"/></svg> },
    { id: 'macos', label: 'macOS', current: macosFilter, set: setMacosFilter, options: MACOS_VERSIONS, labels: {} as Record<string, string>,
      icon: <svg viewBox="0 0 24 24" fill="none" className="filter-minimal-icon filter-apple-outline" aria-hidden="true"><path d="M15.4 7.1c-1.2-.1-2.2.7-2.8.7-.7 0-1.6-.7-2.7-.7-1.4 0-2.7.8-3.4 2.1-1.5 2.6-.4 6.4 1 8.5.7 1 1.5 2.1 2.6 2.1 1 0 1.4-.7 2.7-.7 1.2 0 1.6.7 2.7.7 1.1 0 1.8-1 2.5-2 .8-1.1 1.1-2.2 1.1-2.3-.1 0-2.2-.9-2.2-3.4 0-2.1 1.7-3.1 1.8-3.1-.9-1.4-2.3-1.8-3.3-1.9Z"/><path d="M14.7 5.6c.6-.7 1-1.7.9-2.7-.8 0-1.8.6-2.4 1.3-.5.6-1 1.6-.9 2.5.9.1 1.8-.4 2.4-1.1Z"/></svg> },
    { id: 'chip', label: 'Mac', current: hwFilter, set: setHwFilter, options: APPLE_SILICON_CHIPS, labels: {} as Record<string, string>,
      icon: <svg viewBox="0 0 24 24" fill="none" className="filter-minimal-icon" aria-hidden="true"><rect x="6.7" y="6.7" width="10.6" height="10.6" rx="2"/><rect x="10" y="10" width="4" height="4" rx="0.7"/><path d="M9 4v2M12 4v2M15 4v2M9 18v2M12 18v2M15 18v2M4 9h2M4 12h2M4 15h2M18 9h2M18 12h2M18 15h2"/></svg> },
  ];

  const localGameIndexes = useMemo(() => {
    const bySteamId = new Map<string, Game>();
    const byName = new Map<string, Game>();
    for (const game of games) {
      if (game.steam_app_id) bySteamId.set(game.steam_app_id, game);
      byName.set(game.name.toLowerCase(), game);
    }
    return { bySteamId, byName };
  }, [games]);

  const steamGamesWithLocalData = useMemo(() => {
    return trendingSteam.map(steamGame => {
      const localGame = localGameIndexes.bySteamId.get(steamGame.steam_app_id) || localGameIndexes.byName.get(steamGame.name.toLowerCase());
      if (localGame) {
        return {
          ...steamGame,
          isLocal: true,
          id: localGame.id,
          aggregate_tier: localGame.aggregate_tier,
          latest_test: localGame.latest_test,
          benchmark_summary: localGame.benchmark_summary,
        };
      }
      return { ...steamGame, isLocal: false };
    });
  }, [trendingSteam, localGameIndexes]);

  const carouselGames = useMemo(() => {
    const picked = new Map<string, SteamCatalogItem>();
    const orderedGames = [
      ...steamGamesWithLocalData.filter((steamGame) => steamGame.feed === "new_releases"),
      ...steamGamesWithLocalData.filter((steamGame) => steamGame.feed === "featured"),
      ...steamGamesWithLocalData.filter((steamGame) => steamGame.feed === "top_sellers"),
    ].filter((steamGame) => steamGame.steam_app_id && hasSteamCover(steamGame));

    orderedGames.forEach((steamGame) => {
      if (picked.size < 16 && !picked.has(steamGame.steam_app_id)) {
        picked.set(steamGame.steam_app_id, {
          ...steamGame,
          cover_art_url: steamHeaderImageUrl(steamGame.steam_app_id),
        });
      }
    });

    return Array.from(picked.values());
  }, [steamGamesWithLocalData]);

  const exploreGames = useMemo(() => {
    return steamGamesWithLocalData.filter(steamGame =>
      steamGame.feed !== "featured" &&
      !isLowQualityMainFeedItem(steamGame)
    );
  }, [steamGamesWithLocalData]);

  const compatibilityCriteriaKey = [search, statusFilter, wineFilter, macosFilter, hwFilter].join("\u0001");
  const previousCompatibilityCriteriaKey = useRef(compatibilityCriteriaKey);

  useEffect(() => {
    if (previousCompatibilityCriteriaKey.current === compatibilityCriteriaKey) return;
    previousCompatibilityCriteriaKey.current = compatibilityCriteriaKey;
    setVisibleSteamCount(INITIAL_COMPATIBILITY_CARD_COUNT);
    onSteamScrollTopChange(0);
    if (steamScrollerRef.current) {
      steamScrollerRef.current.scrollTop = 0;
    }
  }, [compatibilityCriteriaKey, onSteamScrollTopChange, setVisibleSteamCount]);

  useEffect(() => {
    if (restoredSteamScrollRef.current || search !== "" || hasActiveFilters) return;
    const node = steamScrollerRef.current;
    if (!node || initialSteamScrollTop <= 0) return;
    restoredSteamScrollRef.current = true;
    requestAnimationFrame(() => {
      node.scrollTop = initialSteamScrollTop;
    });
  }, [hasActiveFilters, initialSteamScrollTop, search]);

  useEffect(() => {
    if (search !== "" || hasActiveFilters) return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleSteamCount((count) => Math.min(count + COMPATIBILITY_CARD_LOAD_STEP, exploreGames.length));
        }
      },
      { rootMargin: "420px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [exploreGames.length, hasActiveFilters, search]);

  const topSellerGames = exploreGames.filter((game) => game.feed === "top_sellers");
  const newReleaseGames = exploreGames.filter((game) => game.feed === "new_releases");
  const visibleCompatibilityCount = Math.max(INITIAL_COMPATIBILITY_CARD_COUNT, visibleSteamCount);
  const visibleTopSellerGames = topSellerGames.slice(0, visibleCompatibilityCount);
  const visibleNewReleaseGames = newReleaseGames.slice(0, Math.max(0, visibleCompatibilityCount - visibleTopSellerGames.length));
  const filteredSteamCatalog = useMemo(() => {
    if (!statusFilter) return [];
    return steamGamesWithLocalData
      .filter((steamGame) => statusFilter === "native_arm" ? steamGame.mac_native : steamGame.compatibility_tier === statusFilter)
      .slice(0, 20);
  }, [statusFilter, steamGamesWithLocalData]);

  return (
    <div className="animate-in">
      <div className="relative z-30 mb-6 flex justify-center px-3 sm:mb-8 sm:px-4">
        <div className="group relative flex w-full max-w-lg flex-wrap items-center justify-center gap-2 sm:h-11 sm:flex-nowrap sm:gap-3">
          <div className="relative isolate h-11 min-w-0 w-full flex-1 overflow-hidden rounded-full transition-all duration-300 sm:w-auto">
            <div
              className="pointer-events-none absolute inset-[0.5px] z-[2] rounded-full"
              style={{
                boxShadow:
                  "0 0 0 0.75px rgba(255,255,255,0.30), inset 0 1px 0 rgba(255,255,255,0.20), inset 0 -1px 0 rgba(255,255,255,0.10)",
                transform: "translateZ(0)",
              }}
            />
            <div
              className="pointer-events-none absolute inset-[3px] z-[1] rounded-full"
              style={{
                background:
                  "linear-gradient(110deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015) 36%, rgba(255,255,255,0.035) 70%, rgba(255,255,255,0.012)), rgba(255,255,255,0.012)",
              }}
            />
            <div className="absolute inset-y-0 left-4 z-20 flex items-center pointer-events-none text-white/90">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.55"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ shapeRendering: "geometricPrecision", transform: "translateZ(0)" }}
              >
                <circle cx="11" cy="11" r="7.25" vectorEffect="non-scaling-stroke" />
                <path d="m16.25 16.25 4.25 4.25" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <input
              ref={searchRef}
              id="spotlight-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={hoveredFilter || "Search games..."}
              className="relative z-10 h-11 w-full rounded-full bg-transparent pl-10 pr-4 text-[13px] text-white placeholder:text-white/30 focus:outline-none"
              autoComplete="off"
            />
            {!search && (
              <div className="absolute left-10 top-[14.5px] z-20 h-[15px] w-[1.5px] animate-pulse rounded-full bg-white pointer-events-none" />
            )}
          </div>

          <div className={`flex w-full items-center justify-center gap-0.5 transition-all duration-300 sm:flex-none sm:justify-start ${
            openFilterMenu 
              ? 'opacity-100 translate-x-0 pointer-events-auto sm:w-[166px]' 
              : 'opacity-100 translate-x-0 pointer-events-auto sm:w-0 sm:translate-x-4 sm:opacity-0 sm:pointer-events-none sm:group-hover:w-[166px] sm:group-hover:translate-x-0 sm:group-hover:opacity-100 sm:group-hover:pointer-events-auto'
          }`}>
            {filterButtons.map((btn) => (
              <div key={btn.id} className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onMouseEnter={() => setHoveredFilter(btn.label)}
                  onMouseLeave={() => setHoveredFilter(null)}
                  onClick={() => setOpenFilterMenu(openFilterMenu === btn.id ? null : btn.id)}
                  className={`w-10 h-10 flex-none rounded-full transition-all active:scale-95 text-white/78 hover:text-white/95 ${btn.current ? 'opacity-100' : 'opacity-80 hover:opacity-100'}`}
                >
                  <LiquidGlass
                    cornerRadius={999}
                    elasticity={0.18}
                    aberrationIntensity={0.7}
                    className="rounded-full bg-black/75"
                  >
                    <div className="pointer-events-none absolute inset-0 rounded-full border border-white/[0.16] shadow-[inset_0_0.5px_0_rgba(255,255,255,0.30),inset_0_-0.5px_0_rgba(255,255,255,0.08),0_8px_18px_rgba(0,0,0,0.38)]" />
                    <div className="pointer-events-none absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_32%_18%,rgba(255,255,255,0.10),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.005)_55%,rgba(255,255,255,0.025))]" />
                    <div className="relative z-10 flex h-full w-full items-center justify-center [&_.filter-minimal-icon]:h-[18px] [&_.filter-minimal-icon]:w-[18px] [&_.filter-minimal-icon]:stroke-white/78 [&_.filter-minimal-icon]:stroke-[1.35] [&_.filter-minimal-icon_path]:stroke-current [&_.filter-minimal-icon_rect]:stroke-current [&_.filter-apple-outline]:h-[19px] [&_.filter-apple-outline]:w-[19px] [&_.filter-check-outline]:h-[20px] [&_.filter-check-outline]:w-[20px] [&_.filter-check-outline]:stroke-[1.65] [&_.filter-wine-outline]:h-[21px] [&_.filter-wine-outline]:w-[21px]">
                      {btn.icon}
                    </div>
                  </LiquidGlass>
                </button>
                {openFilterMenu === btn.id && (
                  <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 p-1 rounded-lg bg-[#111] border border-[#2a2a2a] shadow-2xl z-[100] max-h-[220px] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {btn.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => { btn.set(opt); setOpenFilterMenu(null); }}
                        className={`w-full px-2 py-1.5 text-left text-[11px] rounded-md hover:bg-white/10 transition-colors text-white ${btn.current === opt ? 'font-medium' : 'opacity-90'}`}
                      >
                        {opt === "" ? btn.label : (btn.labels[opt] || opt)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2 px-4">
          <span className="text-[10px] text-white/20 uppercase tracking-wider">Filters:</span>
          {statusFilter && <FilterChip label={getTierConfig(statusFilter).label} onClear={() => setStatusFilter("")} />}
          {wineFilter && <FilterChip label={`Wine ${wineFilter}`} onClear={() => setWineFilter("")} />}
          {macosFilter && <FilterChip label={`macOS ${macosFilter}`} onClear={() => setMacosFilter("")} />}
          {hwFilter && <FilterChip label={hwFilter} onClear={() => setHwFilter("")} />}
          <button onClick={() => { setStatusFilter(""); setWineFilter(""); setMacosFilter(""); setHwFilter(""); }} className="text-[10px] text-white/15 hover:text-white/40 transition-colors ml-1">Clear all</button>
        </div>
      )}

      {isLoading ? (
        <LoadingCards />
      ) : !hasActiveFilters && search === "" ? (
        <div className="mt-8 pb-16">
          <div className={`transition-all duration-300 ${openFilterMenu ? 'blur-[1px]' : ''}`}>
            <HeroCarousel 
              games={carouselGames} 
              addingSteamId={addingSteamId}
              onSelect={onAddSteamGame} 
              onOpenDetail={onOpenDetail}
            />
          </div>
          
          <CardSilkField id="game-cards" className="left-1/2 w-screen -translate-x-1/2 rounded-none border-x-0 border-y-0 px-3 py-8 sm:px-6 sm:py-10">
            <div className="relative z-10 mx-auto max-w-[1600px]">
              <ScrollShadow
                ref={steamScrollerRef}
                hideScrollBar
                className="relative max-h-[min(620px,calc(100svh-190px))] overflow-y-auto overscroll-contain pr-1 sm:max-h-[min(620px,calc(100vh-220px))]"
                onScroll={(event) => {
                  const node = event.currentTarget;
                  onSteamScrollTopChange(node.scrollTop);
                  if (node.scrollTop + node.clientHeight >= node.scrollHeight - 420) {
                    setVisibleSteamCount((count) => Math.min(count + COMPATIBILITY_CARD_LOAD_STEP, exploreGames.length));
                  }
                }}
              >
                <div className="space-y-10 pb-24">
                  {visibleTopSellerGames.length > 0 && (
                    <section className="space-y-4">
                      <h2 className="px-1 text-[12px] uppercase tracking-[0.28em] text-white/35">Top sellers</h2>
                      <SteamGameGrid
                        games={visibleTopSellerGames}
                        addingSteamId={addingSteamId}
                        onSelect={onAddSteamGame}
                        onOpenDetail={onOpenDetail}
                        hardware={primaryHardware}
                        eagerCount={INITIAL_COMPATIBILITY_CARD_COUNT}
                        virtualScrollRef={steamScrollerRef}
                      />
                    </section>
                  )}
                  {visibleNewReleaseGames.length > 0 && (
                    <section className="space-y-4">
                      <h2 className="px-1 text-[12px] uppercase tracking-[0.28em] text-white/35">New releases</h2>
                      <SteamGameGrid
                        games={visibleNewReleaseGames}
                        addingSteamId={addingSteamId}
                        onSelect={onAddSteamGame}
                        onOpenDetail={onOpenDetail}
                        hardware={primaryHardware}
                        virtualScrollRef={steamScrollerRef}
                      />
                    </section>
                  )}
                  <div ref={loadMoreRef} className="h-8" />
                </div>
              </ScrollShadow>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-black via-black/80 to-transparent" />
            </div>
            {filtered.length === 0 && trendingSteam.length === 0 && isTrendingSteamLoading && (
              <div className="relative z-10 mx-auto max-w-[1600px] py-24 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin mx-auto mb-4" />
                <p className="text-[14px] text-white/40">Loading trending games...</p>
              </div>
            )}
          </CardSilkField>
        </div>
      ) : (
        <div className="space-y-8 mt-6">
          {filtered.length > 0 && (
            <div>
              <h3 className="text-[15px] font-semibold text-white tracking-tight mb-4 px-1">From Database</h3>
              <CardSilkField>
                <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filtered.map((g) => (
                    <GameCard key={g.id} game={g} hardware={primaryHardware} onClick={() => onOpenDetail(g.id)} />
                  ))}
                </div>
              </CardSilkField>
            </div>
          )}

          {search !== "" && steamResults.length > 0 && (
            <div>
              <h3 className="text-[15px] font-semibold text-white tracking-tight mb-4 px-1">Steam Catalog</h3>
              <SearchResultsPanel>
                <SteamGameGrid
                  games={steamResults}
                  addingSteamId={addingSteamId}
                  onSelect={onAddSteamGame}
                  onOpenDetail={onOpenDetail}
                  hardware={primaryHardware}
                />
              </SearchResultsPanel>
            </div>
          )}

          {search === "" && filteredSteamCatalog.length > 0 && (
            <div>
              <h3 className="text-[15px] font-semibold text-white tracking-tight mb-4 px-1">
                {statusFilter === "native_arm" ? "Steam Native Mac" : getTierConfig(statusFilter).label}
              </h3>
              <SearchResultsPanel>
                <SteamGameGrid
                  games={filteredSteamCatalog}
                  addingSteamId={addingSteamId}
                  onSelect={onAddSteamGame}
                  onOpenDetail={onOpenDetail}
                  hardware={primaryHardware}
                />
              </SearchResultsPanel>
            </div>
          )}

          {search !== "" && steamLoading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            </div>
          )}

          {search !== "" && !steamLoading && steamResults.length === 0 && filtered.length === 0 && (
             <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
               <p className="text-[14px] text-white/40 mb-1">No matches found</p>
               <p className="text-[12px] text-white/20">Try adjusting your search or filters.</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border border-[#2a2a2a] text-white/40">
      {label}
      <button type="button" aria-label="Clear filter" onClick={onClear} className="text-white/20 hover:text-white ml-0.5 transition-colors">×</button>
    </span>
  );
}

function SearchResultsPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[20px] border border-white/[0.055] bg-black/[0.34] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_20px_70px_rgba(0,0,0,0.32)] sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 rounded-[20px] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0)_22%)]" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

const NEWS_CATEGORIES: MacNewsCategory[] = ["News", "Reviews", "CrossOver", "App Store", "Performance", "Top Lists"];
const NEWS_CATEGORY_LABELS: Record<MacNewsCategory, string> = {
  News: "News",
  Reviews: "Reviews",
  CrossOver: "Crossover",
  "App Store": "AppStore",
  Performance: "MacOS Updates",
  "Top Lists": "Trending",
};
const NEWS_CATEGORY_ICONS: Partial<Record<MacNewsCategory, LucideIcon>> = {
  News: ScrollText,
  Reviews: Star,
  CrossOver: Gamepad2,
  "App Store": ShoppingBag,
  Performance: Apple,
  "Top Lists": ListOrdered,
};

function HomeEditorialPage({ newsItems, isLoading, onOpenCompatibility }: { newsItems: MacNewsItem[]; isLoading: boolean; onOpenCompatibility: () => void }) {
  const [activeCategory, setActiveCategory] = useState<MacNewsCategory>("News");
  const [selectedArticle, setSelectedArticle] = useState<MacNewsItem | null>(null);
  const [visibleArticleCount, setVisibleArticleCount] = useState(6);

  const categoryCounts = useMemo(() => {
    return NEWS_CATEGORIES.reduce<Record<MacNewsCategory, number>>((counts, category) => {
      counts[category] = newsItems.filter((item) => item.category === category).length;
      return counts;
    }, {
      News: 0,
      Reviews: 0,
      CrossOver: 0,
      "App Store": 0,
      Performance: 0,
      "Top Lists": 0,
    });
  }, [newsItems]);

  const activeArticles = useMemo(
    () => newsItems.filter((item) => item.category === activeCategory),
    [activeCategory, newsItems],
  );
  const leadArticle = activeArticles[0];
  const topStories = activeArticles.slice(1, 4);
  const articlePool = activeArticles.slice(4);
  const articleList = articlePool.slice(0, visibleArticleCount);
  const latestAcrossSources = newsItems.slice(0, 8);

  const formatDate = (value?: string) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(value));
  };

  const changeNewsView = (change: () => void) => {
    change();
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const openArticle = (article: MacNewsItem) => {
    changeNewsView(() => setSelectedArticle(article));
  };

  const selectCategory = (category: MacNewsCategory) => {
    changeNewsView(() => {
      setActiveCategory(category);
      setSelectedArticle(null);
      setVisibleArticleCount(6);
    });
  };

  const closeArticle = () => {
    changeNewsView(() => setSelectedArticle(null));
  };

  return (
    <main id="macready-news" className="animate-in min-h-[1580px] pb-16">
      <div className="mx-auto max-w-[1420px] px-4 sm:px-6">
        <header className="flex justify-center pt-2 pb-7">
          <nav
            className="flex w-full max-w-[900px] flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[14px] sm:gap-x-8"
            aria-label="MacReady news categories"
          >
            {NEWS_CATEGORIES.map((category) => {
              const active = category === activeCategory;
              const label = NEWS_CATEGORY_LABELS[category];
              return (
                <span key={category} className="contents">
                <button
                  type="button"
                  onClick={() => selectCategory(category)}
                  title={label}
                  aria-label={`${label}, ${categoryCounts[category]} articles`}
                  className={[
                    "group relative inline-flex h-8 items-center whitespace-nowrap pb-1 transition-colors duration-200",
                    active
                      ? "text-white"
                      : "text-white/50 hover:text-white/80",
                  ].join(" ")}
                >
                  <span>{label}</span>
                  <span
                    className={[
                      "absolute bottom-0 left-0 h-px bg-white transition-all duration-200",
                      active ? "w-full opacity-95" : "w-0 opacity-0 group-hover:w-full group-hover:opacity-32",
                    ].join(" ")}
                  />
                </button>
                {category === "CrossOver" && (
                  <button
                    type="button"
                    onClick={onOpenCompatibility}
                    title="Compatibility"
                    aria-label="Compatibility"
                    className="group relative inline-flex h-8 items-center whitespace-nowrap pb-1 text-white/50 transition-colors duration-200 hover:text-white/80"
                  >
                    <span>Compatibility</span>
                    <span className="absolute bottom-0 left-0 h-px w-0 bg-white opacity-0 transition-all duration-200 group-hover:w-full group-hover:opacity-32" />
                  </button>
                )}
                </span>
              );
            })}
          </nav>
        </header>

        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={`${activeCategory}-${selectedArticle?.id ?? "list"}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
        {selectedArticle ? (
          <ArticleReader article={selectedArticle} onBack={closeArticle} formatDate={formatDate} />
        ) : newsItems.length === 0 ? (
          <section className="flex min-h-[260px] items-center justify-center rounded-[18px] bg-white/[0.025] text-center">
            <div>
              <p className="text-[18px] font-semibold text-white/86">{isLoading ? "Loading Mac news" : "No Mac news returned yet"}</p>
              <p className="mt-2 text-[13px] text-white/42">Articles from Apple-focused sources appear here.</p>
            </div>
          </section>
        ) : activeArticles.length === 0 ? (
          <section className="flex min-h-[260px] items-center justify-center rounded-[18px] bg-white/[0.025] text-center">
            <div>
              <p className="text-[18px] font-semibold text-white/86">No {NEWS_CATEGORY_LABELS[activeCategory].toLowerCase()} articles right now</p>
              <p className="mt-2 text-[13px] text-white/42">Choose another category for the latest Mac coverage.</p>
            </div>
          </section>
        ) : activeCategory === "App Store" ? (
          <AppStoreFeed
            articles={activeArticles}
            onOpenArticle={openArticle}
            formatDate={formatDate}
          />
        ) : activeCategory === "Performance" && activeArticles.some((article) => article.source === "Apple Developer" && article.metadata?.releaseNotesSections?.length) ? (
          <MacOSUpdatesFeed
            articles={activeArticles}
            onOpenArticle={openArticle}
            formatDate={formatDate}
          />
        ) : activeCategory === "CrossOver" && activeArticles.some((article) => article.source === "CodeWeavers Changelog") ? (
          <CrossoverUpdatesFeed
            articles={activeArticles}
            onOpenArticle={openArticle}
            formatDate={formatDate}
          />
        ) : (
          <>
            <section className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
              {leadArticle && (
                <button
                  type="button"
                  onClick={() => openArticle(leadArticle)}
                  className="group grid min-w-0 items-start gap-7 text-left lg:grid-cols-[minmax(300px,0.78fr)_minmax(360px,1fr)]"
                >
                  {leadArticle.image_url && (
                    <img
                      src={getSizedImageUrl(leadArticle.image_url, 800)}
                      srcSet={getImageSrcSet(leadArticle.image_url, [480, 640, 800, 1200])}
                      sizes="(max-width: 1023px) calc(100vw - 32px), 44vw"
                      alt=""
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      className="aspect-[16/9] max-h-[310px] w-full rounded-[16px] object-cover opacity-[0.88] transition-opacity duration-300 group-hover:opacity-100"
                    />
                  )}
                  <div className="pt-0.5">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-white/55">
                      {NEWS_CATEGORY_LABELS[leadArticle.category]} · {leadArticle.source} {formatDate(leadArticle.published_at) && `· ${formatDate(leadArticle.published_at)}`}
                    </p>
                    <h2 className="mt-3 max-w-[680px] text-[27px] font-semibold leading-[1.08] tracking-tight text-white sm:text-[31px] md:text-[42px]">
                      {leadArticle.title}
                    </h2>
                    {leadArticle.summary && (
                      <p className="mt-4 line-clamp-3 max-w-[66ch] text-[15px] leading-7 text-white/70">{leadArticle.summary}</p>
                    )}
                    <span className="mt-4 inline-flex h-7 w-fit items-center rounded-full bg-white/[0.055] px-3.5 text-[12px] font-medium text-white/62 ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition-colors group-hover:bg-white/[0.09] group-hover:text-white/86">
                      Read more
                    </span>
                  </div>
                </button>
              )}

              <aside className="pt-1">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/55">Top stories</p>
                </div>
                <div className="grid gap-3.5">
                  {topStories.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => openArticle(article)}
                      className="group grid grid-cols-[96px_minmax(0,1fr)] items-start gap-3.5 text-left"
                    >
                      {article.image_url && (
                        <img
                          src={getSizedImageUrl(article.image_url, 160)}
                          srcSet={getImageSrcSet(article.image_url, [128, 160, 240])}
                          sizes="96px"
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="aspect-[16/10] h-[60px] w-full rounded-[10px] object-cover opacity-[0.76] transition-opacity duration-300 group-hover:opacity-100"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="text-[9px] uppercase tracking-[0.2em] text-white/58">{article.source}</p>
                        <h3 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug text-white/90 group-hover:text-white">{article.category === "App Store" ? getAppStoreName(article) : article.title}</h3>
                        {article.summary && <p className="mt-1 line-clamp-1 text-[12px] leading-5 text-white/66">{article.summary}</p>}
                        <span className="mt-2 inline-flex h-6 items-center rounded-full bg-white/[0.045] px-2.5 text-[11px] font-medium text-white/60 ring-1 ring-white/[0.045] transition-colors group-hover:bg-white/[0.08] group-hover:text-white/76">
                          Read more
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>
            </section>

            <section className={["content-visibility-auto mt-12 grid gap-12", activeCategory === "News" ? "xl:grid-cols-[minmax(0,1fr)_330px]" : ""].join(" ")}>
              <div>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-[22px] font-semibold tracking-tight text-white">{NEWS_CATEGORY_LABELS[activeCategory]}</h2>
                </div>
                <div className="relative">
                  <ScrollShadow
                    hideScrollBar
                    className="max-h-[min(980px,calc(100vh-130px))] overflow-y-auto pr-1"
                    onScroll={(event) => {
                      const node = event.currentTarget;
                      if (node.scrollTop + node.clientHeight >= node.scrollHeight - 360) {
                        setVisibleArticleCount((count) => Math.min(count + 6, articlePool.length));
                      }
                    }}
                  >
                    <div className="grid gap-x-7 gap-y-9 pb-24 md:grid-cols-2 2xl:grid-cols-3">
                      {articleList.map((article) => (
                        <button
                          key={article.id}
                          type="button"
                          onClick={() => openArticle(article)}
                          className="group animate-in text-left"
                        >
                          {article.image_url && (
                            <img
                              src={getSizedImageUrl(article.image_url, 640)}
                              srcSet={getImageSrcSet(article.image_url, [360, 480, 640, 800])}
                              sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1535px) calc((100vw - 120px) / 2), 33vw"
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="aspect-[16/9] h-auto max-h-[255px] w-full rounded-[14px] object-cover opacity-[0.78] transition-opacity duration-300 group-hover:opacity-100"
                            />
                          )}
                          <div className="min-w-0 pt-4">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-white/38">
                              {article.source} {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
                            </p>
                            <h3 className="mt-2 line-clamp-2 text-[21px] font-semibold leading-tight text-white/94 group-hover:text-white">{article.title}</h3>
                            {article.summary && <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-white/64">{article.summary}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollShadow>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-28 bg-gradient-to-t from-black via-black/80 to-transparent" />
                </div>
              </div>

              {activeCategory === "News" && (
                <aside className="space-y-7 pt-9 xl:pt-[48px]">
                  <section>
                    <h2 className="text-[15px] font-semibold text-white/92">Latest</h2>
                    <div className="mt-4 space-y-4">
                      {latestAcrossSources.map((article) => {
                        const Icon = NEWS_CATEGORY_ICONS[article.category];
                        return (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => openArticle(article)}
                            className="group grid grid-cols-[42px_minmax(0,1fr)] items-start gap-3 text-left"
                          >
                            <span className="flex size-[42px] items-center justify-center overflow-hidden rounded-[10px] bg-white/[0.045] text-white/46 ring-1 ring-white/[0.055]">
                              {article.image_url ? (
                                <img src={getSizedImageUrl(article.image_url, 64)} srcSet={getImageSrcSet(article.image_url, [64, 96, 128])} sizes="42px" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
                              ) : Icon ? (
                                <Icon className="size-4" strokeWidth={1.75} />
                              ) : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[9px] uppercase tracking-[0.2em] text-white/36">
                                {NEWS_CATEGORY_LABELS[article.category]} · {article.source}
                              </span>
                              <span className="mt-1 block text-[14px] leading-snug text-white/82 transition-colors group-hover:text-white">
                                {article.category === "App Store" ? getAppStoreName(article) : article.title}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button type="button" onClick={() => selectCategory("App Store")} className="mt-5 text-[13px] font-medium text-white/70 transition-colors hover:text-white">
                      More
                    </button>
                  </section>
                </aside>
              )}
            </section>
          </>
        )}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function getAppStoreName(article: MacNewsItem) {
  return article.title.replace(/^\d+\.\s*/, "");
}

function getAppStoreRank(article: MacNewsItem) {
  return article.title.match(/^(\d+)\./)?.[1] ?? "";
}

function getAppStoreChart(article: MacNewsItem) {
  const text = `${article.summary ?? ""} ${article.content ?? ""}`.toLowerCase();
  if (text.includes("top paid")) return "Top Paid";
  if (text.includes("top free")) return "Top Free";
  return "App Store";
}

function formatAppFileSize(value?: string) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatAppRating(value?: number, count?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  const countText = typeof count === "number" && count > 0 ? ` from ${count.toLocaleString()} ratings` : "";
  return `${value.toFixed(1)} / 5${countText}`;
}

function MacOSUpdatesFeed({
  articles,
  onOpenArticle,
  formatDate,
}: {
  articles: MacNewsItem[];
  onOpenArticle: (article: MacNewsItem) => void;
  formatDate: (value?: string) => string;
}) {
  const releaseNotesArticle = articles.find((article) => article.source === "Apple Developer" && article.metadata?.releaseNotesSections?.length);
  const relatedUpdates = articles.filter((article) => article.id !== releaseNotesArticle?.id).slice(0, 5);

  if (!releaseNotesArticle) return null;

  return (
    <section className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_330px]">
      <MacOSReleaseNotesPanel article={releaseNotesArticle} formatDate={formatDate} />

      <aside className="pt-1">
        <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-white/55">Tahoe updates</p>
        <div className="grid gap-4">
          {relatedUpdates.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => onOpenArticle(article)}
              className="group text-left"
            >
              {article.image_url && (
                <img
                  src={getSizedImageUrl(article.image_url, 640)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="mb-3 aspect-[16/9] w-full rounded-[12px] object-cover opacity-[0.76] transition-opacity duration-300 group-hover:opacity-100"
                />
              )}
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/52">
                {article.source} {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
              </p>
              <h3 className="mt-1.5 text-[16px] font-medium leading-snug text-white/88 transition-colors group-hover:text-white">
                {article.title}
              </h3>
              {article.summary && (
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-white/60">
                  {article.summary}
                </p>
              )}
            </button>
          ))}
        </div>
      </aside>
    </section>
  );
}

function CrossoverUpdatesFeed({
  articles,
  onOpenArticle,
  formatDate,
}: {
  articles: MacNewsItem[];
  onOpenArticle: (article: MacNewsItem) => void;
  formatDate: (value?: string) => string;
}) {
  const changelogArticles = articles.filter((article) => article.source === "CodeWeavers Changelog");
  const mainChangelog = changelogArticles[0];
  const blogPosts = articles.filter((article) => article.source === "CodeWeavers").slice(0, 6);
  const recentChangelog = changelogArticles.slice(1, 5);

  if (!mainChangelog) return null;

  return (
    <section className="grid gap-8">
      <CrossoverChangelogPanel article={mainChangelog} formatDate={formatDate} />

      <section>
        <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-white/55">Latest blog posts</p>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {blogPosts.map((article) => {
            const imageUrl = article.image_url || `${import.meta.env.BASE_URL}imgs/crossover-icon.webp`;
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => onOpenArticle(article)}
                className="group grid grid-cols-[120px_minmax(0,1fr)] gap-4 text-left sm:grid-cols-[150px_minmax(0,1fr)] xl:block"
              >
                <img
                  src={imageUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="aspect-[16/10] h-full min-h-[92px] w-full rounded-[12px] object-cover opacity-[0.76] transition-opacity duration-300 group-hover:opacity-100 xl:mb-3 xl:h-auto xl:min-h-0"
                />
                <span className="min-w-0">
                  <span className="block text-[9px] uppercase tracking-[0.2em] text-white/52">
                    CodeWeavers {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
                  </span>
                  <span className="mt-1.5 line-clamp-2 block text-[16px] font-medium leading-snug text-white/88 transition-colors group-hover:text-white">
                    {article.title}
                  </span>
                  {article.summary && (
                    <span className="mt-2 line-clamp-2 block text-[12px] leading-5 text-white/60">
                      {article.summary}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {recentChangelog.length > 0 && (
        <section>
          <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-white/55">Earlier changelog</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {recentChangelog.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => onOpenArticle(article)}
                className="group rounded-[14px] bg-white/[0.025] px-4 py-3 text-left ring-1 ring-white/[0.045] transition-colors hover:bg-white/[0.045]"
              >
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/46">
                  {formatDate(article.published_at)}
                </p>
                <h3 className="mt-1 text-[14px] font-medium leading-snug text-white/82 transition-colors group-hover:text-white">
                  {article.title}
                </h3>
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function AppStoreFeed({
  articles,
  onOpenArticle,
  formatDate,
}: {
  articles: MacNewsItem[];
  onOpenArticle: (article: MacNewsItem) => void;
  formatDate: (value?: string) => string;
}) {
  const [appSearch, setAppSearch] = useState("");
  const appSearchQuery = appSearch.trim();
  const { data: searchedApps = [], isFetching: isSearchingApps } = useQuery({
    queryKey: ["gamedb", "appstore-search", appSearchQuery],
    queryFn: () => searchAppStore({ q: appSearchQuery }),
    enabled: appSearchQuery.length > 0,
    staleTime: 10 * 60_000,
  });

  const getMaker = (article: MacNewsItem) => {
    return typeof article.metadata?.maker === "string" ? article.metadata.maker : "";
  };

  const getMetaLine = (article: MacNewsItem) => {
    const rank = getAppStoreRank(article);
    const date = formatDate(article.published_at);
    return [rank ? `#${rank}` : "", getAppStoreChart(article), date].filter(Boolean).join(" · ");
  };

  const filteredApps = appSearchQuery ? searchedApps : articles;
  const leadApps = filteredApps.slice(0, 6);
  const remainingApps = filteredApps.slice(6, 18);

  return (
    <section className="grid gap-10">
      <div>
        <div className="mx-auto mb-7 mt-6 w-full max-w-[360px]">
          <label className="relative block">
            <span className="absolute inset-y-0 left-4 z-10 flex items-center text-white/88">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.55"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ shapeRendering: "geometricPrecision", transform: "translateZ(0)" }}
              >
                <circle cx="11" cy="11" r="7.25" vectorEffect="non-scaling-stroke" />
                <path d="m16.25 16.25 4.25 4.25" vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
            <input
              id="appstore-search"
              name="appstore-search"
              value={appSearch}
              onChange={(event) => setAppSearch(event.target.value)}
              placeholder="Search apps"
              className="h-11 w-full rounded-full bg-white/[0.055] pl-10 pr-4 text-[13px] text-white ring-1 ring-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_40px_rgba(0,0,0,0.22)] transition-colors placeholder:text-white/32 focus:bg-white/[0.075] focus:outline-none focus:ring-white/[0.22]"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/28">Apple App Store</p>
            <h2 className="mt-2 text-[25px] font-semibold tracking-tight text-white">Top Apps</h2>
          </div>
        </div>

        {appSearchQuery && isSearchingApps ? (
          <div className="rounded-[18px] bg-white/[0.025] px-5 py-8 text-center ring-1 ring-white/[0.045]">
            <p className="text-[15px] font-medium text-white/72">Searching Mac App Store</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="rounded-[18px] bg-white/[0.025] px-5 py-8 text-center ring-1 ring-white/[0.045]">
            <p className="text-[15px] font-medium text-white/72">No apps found</p>
            <p className="mt-2 text-[13px] text-white/38">Try another app name or developer.</p>
          </div>
        ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leadApps.map((article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => onOpenArticle(article)}
              className="group grid grid-cols-[58px_minmax(0,1fr)] items-center gap-3 rounded-[18px] bg-white/[0.018] px-3 py-3 text-left ring-1 ring-white/[0.045] transition-colors hover:bg-white/[0.035]"
            >
              {article.image_url && (
                <img
                  src={getSizedImageUrl(article.image_url, 128)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={128}
                  height={128}
                  className="size-[58px] rounded-[14px] object-cover shadow-[0_10px_26px_rgba(0,0,0,0.34)]"
                />
              )}
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/28">
                  {getAppStoreRank(article) && <span>#{getAppStoreRank(article)}</span>}
                  <span>{getAppStoreChart(article)}</span>
                </span>
                <span className="mt-1 block truncate text-[16px] font-medium text-white/84 group-hover:text-white">
                  {getAppStoreName(article)}
                </span>
                <span className="mt-1 block truncate text-[12px] text-white/38">
                  {article.summary}
                </span>
              </span>
            </button>
          ))}
        </div>
        )}

        {remainingApps.length > 0 && !isSearchingApps && (
          <div className="content-visibility-auto mt-10">
            <p className="mb-5 text-[10px] uppercase tracking-[0.24em] text-white/24">{appSearchQuery ? "More results" : "More from the charts"}</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-x-4 gap-y-7 xl:grid-cols-6">
              {remainingApps.map((article) => {
                const maker = getMaker(article);

                return (
                  <button
                    key={article.id}
                    type="button"
                    onClick={() => onOpenArticle(article)}
                    className="group min-w-0 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {article.image_url && (
                        <img
                          src={getSizedImageUrl(article.image_url, 96)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-11 rounded-[11px] object-cover opacity-90 shadow-[0_10px_20px_rgba(0,0,0,0.28)] transition-[opacity,transform] duration-200 ease-out group-hover:scale-[1.03] group-hover:opacity-100 xl:size-12 xl:rounded-[12px]"
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium leading-tight text-white/78 transition-colors group-hover:text-white">
                          {getAppStoreName(article)}
                        </span>
                        <span className="mt-1.5 block truncate text-[10px] uppercase tracking-[0.18em] text-white/25">
                          {getMetaLine(article)}
                        </span>
                        {maker && (
                          <span className="mt-1 hidden truncate text-[11px] text-white/32 2xl:block">
                            {maker}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ArticleReader({
  article,
  onBack,
  formatDate,
}: {
  article: MacNewsItem;
  onBack: () => void;
  formatDate: (value?: string) => string;
}) {
  const body = article.content ?? "";
  const paragraphs = formatArticleParagraphs(body);
  const categoryLabel = NEWS_CATEGORY_LABELS[article.category];

  if (article.category === "App Store" && article.source === "Apple App Store") {
    return (
      <AppStoreArticleReader article={article} onBack={onBack} formatDate={formatDate} />
    );
  }

  if (article.category === "Performance" && article.source === "Apple Developer" && article.metadata?.releaseNotesSections?.length) {
    return (
      <MacOSReleaseNotesReader article={article} onBack={onBack} formatDate={formatDate} />
    );
  }

  if (article.category === "CrossOver" && article.source === "CodeWeavers Changelog") {
    return (
      <CrossoverChangelogReader article={article} onBack={onBack} formatDate={formatDate} />
    );
  }

  if (article.category === "CrossOver" && article.source === "CodeWeavers") {
    return (
      <CrossoverBlogArticleReader article={article} onBack={onBack} formatDate={formatDate} />
    );
  }

  return (
    <article className="mx-auto max-w-[1120px] pb-14">
      <button type="button" onClick={onBack} className="mb-6 text-[13px] text-white/44 transition-colors hover:text-white">
        ← Back to {categoryLabel}
      </button>

      <section className="grid items-start gap-7 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
        {article.image_url && (
          <img
            src={article.image_url}
            alt=""
            className="aspect-[16/10] w-full rounded-[22px] object-cover opacity-[0.86] md:sticky md:top-16"
          />
        )}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">
            {categoryLabel} · {article.source} {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.04] tracking-tight text-white md:text-[48px]">
            {article.title}
          </h1>
          {paragraphs.length > 0 && <ArticleBodyScroll paragraphs={paragraphs} />}
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-8 items-center rounded-full bg-white/[0.055] px-4 text-[13px] font-medium text-white/66 ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition-colors hover:bg-white/[0.09] hover:text-white"
          >
            Read original at {article.source}
          </a>
        </div>
      </section>
    </article>
  );
}

function ArticleBodyScroll({ paragraphs, compact = false }: { paragraphs: string[]; compact?: boolean }) {
  return (
    <div className={compact ? "relative mt-4" : "relative mt-6"}>
      <div
        className={compact
          ? "release-notes-scroll max-h-[180px] overflow-y-auto rounded-[20px] bg-black/[0.34] px-5 py-4 md:px-7 md:py-5"
          : "release-notes-scroll max-h-[min(620px,calc(100vh-180px))] overflow-y-auto rounded-[24px] bg-black/[0.34] px-5 py-6 md:px-8 md:py-8"}
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          scrollbarGutter: "stable",
        }}
      >
        <div className={compact ? "space-y-3" : "space-y-5"}>
          {paragraphs.map((paragraph, index) => (
            <p
              key={`${paragraph.slice(0, 28)}-${index}`}
              className={compact
                ? "relative pl-5 text-[15px] leading-7 text-white/76 before:absolute before:left-0 before:top-[0.72em] before:size-1.5 before:rounded-full before:bg-white/78"
                : "text-[16px] leading-8 text-white/76"}
            >
              {paragraph}
            </p>
          ))}
        </div>
      </div>
      {!compact && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-14 rounded-t-[24px] bg-gradient-to-b from-[#030303] via-[#030303]/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 rounded-b-[24px] bg-gradient-to-t from-[#030303] via-[#030303]/70 to-transparent" />
        </>
      )}
    </div>
  );
}

function CrossoverBlogArticleReader({
  article,
  onBack,
  formatDate,
}: {
  article: MacNewsItem;
  onBack: () => void;
  formatDate: (value?: string) => string;
}) {
  const body = article.content || article.summary || "";
  const paragraphs = formatArticleParagraphs(body);
  const heroImage = article.image_url || `${import.meta.env.BASE_URL}imgs/crossover-icon.webp`;

  return (
    <article className="mx-auto max-w-[1120px] pb-14">
      <button type="button" onClick={onBack} className="mb-6 text-[13px] text-white/44 transition-colors hover:text-white">
        ← Back to CrossOver
      </button>

      <section className="grid items-start gap-7 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
        <img
          src={heroImage}
          alt=""
          className="aspect-[16/10] w-full rounded-[22px] object-cover opacity-[0.86] md:sticky md:top-16"
        />
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">
            CrossOver · CodeWeavers {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.04] tracking-tight text-white md:text-[48px]">
            {article.title}
          </h1>
          {paragraphs.length > 0 && <ArticleBodyScroll paragraphs={paragraphs} />}
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-8 items-center rounded-full bg-white/[0.055] px-4 text-[13px] font-medium text-white/66 ring-1 ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition-colors hover:bg-white/[0.09] hover:text-white"
          >
            Read original at CodeWeavers
          </a>
        </div>
      </section>
    </article>
  );
}

function MacOSReleaseNotesPanel({
  article,
  formatDate,
}: {
  article: MacNewsItem;
  formatDate: (value?: string) => string;
}) {
  const sections = article.metadata?.releaseNotesSections ?? [];
  const version = article.metadata?.version ?? "";
  const osName = article.metadata?.osName ?? "macOS Tahoe";

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#030303] ring-1 ring-white/[0.055]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_26%),linear-gradient(90deg,rgba(255,255,255,0.035),transparent_34%)]" />

      <div className="relative grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="px-7 py-8 md:px-9 lg:sticky lg:top-14 lg:h-[calc(100vh-92px)] lg:py-10">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/48">
            MacOS Updates · Apple Developer {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-tight text-white md:text-[46px]">
            {article.title}
          </h1>
          {article.summary && (
            <p className="mt-5 text-[15px] leading-7 text-white/68">
              {article.summary}
            </p>
          )}
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 text-[12px]">
            <div>
              <dt className="text-white/48">System</dt>
              <dd className="mt-1 font-medium text-white/86">{osName}</dd>
            </div>
            <div>
              <dt className="text-white/48">Version</dt>
              <dd className="mt-1 font-medium text-white/86">{version}</dd>
            </div>
          </dl>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-8 items-center rounded-full bg-white/[0.055] px-4 text-[13px] font-medium text-white/62 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.09] hover:text-white"
          >
            Apple Developer source
          </a>
        </aside>

        <div className="relative min-w-0 px-4 pb-5 md:px-6 lg:px-0 lg:py-6 lg:pr-6">
          <div
            className="release-notes-scroll max-h-[72vh] overflow-y-auto rounded-[24px] bg-black/[0.34] px-5 py-6 md:px-8 md:py-8 lg:max-h-[calc(100vh-116px)]"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              scrollbarGutter: "stable",
            }}
          >
            <div className="relative">
              <div className="space-y-10">
                {sections.map((section, sectionIndex) => (
                  <section
                    key={`${section.title}-${sectionIndex}`}
                    className="relative pl-5 before:absolute before:left-0 before:top-2 before:h-[calc(100%-8px)] before:w-px before:bg-white/[0.08]"
                  >
                    <h2 className="text-[22px] font-semibold tracking-tight text-white">
                      {section.title}
                    </h2>
                    <div className="mt-5 space-y-4">
                      {section.items.map((item, itemIndex) => {
                        if (item.kind === "heading") {
                          return (
                            <h3 key={`${item.text}-${itemIndex}`} className="pt-3 text-[14px] font-semibold uppercase tracking-[0.16em] text-white/46">
                              {item.text}
                            </h3>
                          );
                        }
                        if (item.kind === "listItem") {
                          return (
                            <p key={`${item.text}-${itemIndex}`} className="relative pl-5 text-[15px] leading-7 text-white/62 before:absolute before:left-0 before:top-[0.72em] before:size-1.5 before:rounded-full before:bg-white/34">
                              {item.text}
                            </p>
                          );
                        }
                        return (
                          <p key={`${item.text}-${itemIndex}`} className="text-[15px] leading-7 text-white/62">
                            {item.text}
                          </p>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-4 top-0 h-20 rounded-t-[24px] bg-gradient-to-b from-[#030303] via-[#030303]/70 to-transparent md:inset-x-6 lg:left-0 lg:right-6 lg:top-6" />
          <div className="pointer-events-none absolute inset-x-4 bottom-5 h-20 rounded-b-[24px] bg-gradient-to-t from-[#030303] via-[#030303]/70 to-transparent md:inset-x-6 lg:left-0 lg:right-6 lg:bottom-6" />
        </div>
      </div>
    </section>
  );
}

function MacOSReleaseNotesReader({
  article,
  onBack,
  formatDate,
}: {
  article: MacNewsItem;
  onBack: () => void;
  formatDate: (value?: string) => string;
}) {
  return (
    <article className="mx-auto max-w-[1180px] pb-14">
      <button type="button" onClick={onBack} className="mb-6 text-[13px] text-white/44 transition-colors hover:text-white">
        ← Back to MacOS Updates
      </button>
      <MacOSReleaseNotesPanel article={article} formatDate={formatDate} />
    </article>
  );
}

function CrossoverChangelogPanel({
  article,
  formatDate,
}: {
  article: MacNewsItem;
  formatDate: (value?: string) => string;
}) {
  const sections = article.metadata?.changelogSections?.length
    ? article.metadata.changelogSections
    : [{ title: "Changes", items: article.content ? [{ kind: "paragraph" as const, text: article.content }] : [] }];
  const version = article.metadata?.version ?? article.title.match(/\b\d+(?:\.\d+)+\b/)?.[0] ?? "";
  const product = article.metadata?.product ?? "CrossOver";

  return (
    <section className="relative overflow-hidden rounded-[28px] bg-[#030303] ring-1 ring-white/[0.055]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),transparent_26%),linear-gradient(90deg,rgba(255,255,255,0.035),transparent_34%)]" />

      <div className="relative grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="px-7 py-8 md:px-9 lg:py-10">
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/48">
            Crossover · CodeWeavers Changelog {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
          </p>
          <h1 className="mt-4 text-[34px] font-semibold leading-[1.02] tracking-tight text-white md:text-[46px]">
            {article.title}
          </h1>
          <p className="mt-5 text-[15px] leading-7 text-white/68">
            CrossOver lets Mac users run Windows games and apps without installing Windows, using CodeWeavers' Wine-based compatibility layer tuned for macOS.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 text-[12px]">
            <div>
              <dt className="text-white/48">Details</dt>
              <dd className="mt-1 font-medium text-white/86">{product}</dd>
            </div>
            <div>
              <dt className="text-white/48">Version</dt>
              <dd className="mt-1 font-medium text-white/86">{version}</dd>
            </div>
          </dl>
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-8 items-center rounded-full bg-white/[0.055] px-4 text-[13px] font-medium text-white/62 ring-1 ring-white/[0.06] transition-colors hover:bg-white/[0.09] hover:text-white"
          >
            CodeWeavers source
          </a>
        </aside>

        <div className="relative min-w-0 px-4 pb-5 md:px-6 lg:px-0 lg:py-6 lg:pr-6">
          <div
            className="release-notes-scroll relative z-10 max-h-[72vh] overflow-y-auto rounded-[24px] bg-black/[0.34] px-5 py-6 md:px-8 md:py-8 lg:max-h-[calc(100vh-116px)]"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              scrollbarGutter: "stable",
            }}
          >
            <div className="space-y-10">
              {sections.map((section, sectionIndex) => (
                <section
                  key={`${section.title}-${sectionIndex}`}
                  className="relative pl-5 before:absolute before:left-0 before:top-2 before:h-[calc(100%-8px)] before:w-px before:bg-white/[0.08]"
                >
                  <h2 className="text-[22px] font-semibold tracking-tight text-white">
                    {section.title}
                  </h2>
                  <div className="mt-5 space-y-4">
                    {section.items.map((item, itemIndex) => {
                      if (item.kind === "heading") {
                        return (
                          <h3 key={`${item.text}-${itemIndex}`} className="pt-3 text-[14px] font-semibold uppercase tracking-[0.16em] text-white/60">
                            {item.text}
                          </h3>
                        );
                      }
                      if (item.kind === "listItem") {
                        return (
                          <p key={`${item.text}-${itemIndex}`} className="relative pl-5 text-[15px] leading-7 text-white/76 before:absolute before:left-0 before:top-[0.72em] before:size-1.5 before:rounded-full before:bg-white/62">
                            {item.text}
                          </p>
                        );
                      }
                      return (
                        <p key={`${item.text}-${itemIndex}`} className="text-[15px] leading-7 text-white/76">
                          {item.text}
                        </p>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-x-4 top-0 h-20 rounded-t-[24px] bg-gradient-to-b from-[#030303] via-[#030303]/70 to-transparent md:inset-x-6 lg:left-0 lg:right-6 lg:top-6" />
          <div className="pointer-events-none absolute inset-x-4 bottom-5 h-20 rounded-b-[24px] bg-gradient-to-t from-[#030303] via-[#030303]/70 to-transparent md:inset-x-6 lg:left-0 lg:right-6 lg:bottom-6" />
        </div>
      </div>
    </section>
  );
}

function CrossoverChangelogReader({
  article,
  onBack,
  formatDate,
}: {
  article: MacNewsItem;
  onBack: () => void;
  formatDate: (value?: string) => string;
}) {
  return (
    <article className="mx-auto max-w-[1180px] pb-14">
      <button type="button" onClick={onBack} className="mb-6 text-[13px] text-white/44 transition-colors hover:text-white">
        ← Back to Crossover
      </button>
      <CrossoverChangelogPanel article={article} formatDate={formatDate} />
    </article>
  );
}

function AppStoreArticleReader({
  article,
  onBack,
  formatDate,
}: {
  article: MacNewsItem;
  onBack: () => void;
  formatDate: (value?: string) => string;
}) {
  const appName = getAppStoreName(article);
  const baseMetadata = article.metadata ?? {};
  const appId = typeof baseMetadata.appId === "string" ? baseMetadata.appId : "";
  const { data: appleDetails, isLoading: isLoadingAppleDetails } = useQuery({
    queryKey: ["gamedb", "appstore-details", appId],
    queryFn: () => getAppStoreDetails(appId),
    enabled: Boolean(appId),
    staleTime: 60 * 60_000,
  });

  const metadata = { ...baseMetadata, ...(appleDetails?.metadata ?? {}) };
  const body = typeof appleDetails?.metadata?.description === "string" ? appleDetails.metadata.description.trim() : "";
  const rank = getAppStoreRank(article);
  const chart = getAppStoreChart(article);
  const genres = Array.isArray(metadata.genres) ? metadata.genres : [];
  const maker = typeof metadata.maker === "string" ? metadata.maker : "";
  const sellerName = typeof metadata.sellerName === "string" ? metadata.sellerName : "";
  const advisory = typeof metadata.trackContentRating === "string" && metadata.trackContentRating ? metadata.trackContentRating : typeof metadata.advisory === "string" ? metadata.advisory : "";
  const kind = typeof metadata.kind === "string" ? metadata.kind : "";
  const releaseDate = typeof metadata.releaseDate === "string" && metadata.releaseDate ? formatDate(metadata.releaseDate) : "";
  const updatedDate = typeof metadata.currentVersionReleaseDate === "string" && metadata.currentVersionReleaseDate ? formatDate(metadata.currentVersionReleaseDate) : "";
  const version = typeof metadata.version === "string" ? metadata.version : "";
  const minimumOsVersion = typeof metadata.minimumOsVersion === "string" ? metadata.minimumOsVersion : "";
  const formattedPrice = typeof metadata.formattedPrice === "string" && metadata.formattedPrice ? metadata.formattedPrice : typeof metadata.price === "number" && metadata.price === 0 ? "Free" : "";
  const rating = formatAppRating(metadata.averageUserRating, metadata.userRatingCount);
  const appSize = formatAppFileSize(metadata.fileSizeBytes);
  const languages = Array.isArray(metadata.languageCodesISO2A) ? metadata.languageCodesISO2A : [];
  const supportedDevices = Array.isArray(metadata.supportedDevices) ? metadata.supportedDevices : [];
  const advisories = Array.isArray(metadata.advisories) ? metadata.advisories : [];
  const screenshots = [
    ...(Array.isArray(metadata.screenshotUrls) ? metadata.screenshotUrls : []),
    ...(Array.isArray(metadata.ipadScreenshotUrls) ? metadata.ipadScreenshotUrls : []),
  ].slice(0, 6);
  const heroImage = appleDetails?.image_url || article.image_url;
  const releaseNotes = typeof metadata.releaseNotes === "string" ? metadata.releaseNotes : "";
  const bodyParagraphs = formatArticleParagraphs(body);
  const releaseNoteParagraphs = formatArticleParagraphs(releaseNotes);
  const hasBriefReleaseNotes = releaseNoteParagraphs.length === 1 && releaseNoteParagraphs[0].length < 180;
  const screenshotTrackRef = useRef<HTMLDivElement>(null);
  const screenshotDragRef = useRef({ active: false, startX: 0, scrollLeft: 0 });
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);
  const [isScreenshotDragging, setIsScreenshotDragging] = useState(false);
  const goToScreenshot = useCallback((index: number) => {
    const nextIndex = Math.max(0, Math.min(index, screenshots.length - 1));
    const track = screenshotTrackRef.current;
    const slide = track?.children[nextIndex] as HTMLElement | undefined;

    setActiveScreenshotIndex(nextIndex);
    slide?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [screenshots.length]);
  const handleScreenshotScroll = useCallback(() => {
    const track = screenshotTrackRef.current;

    if (!track) {
      return;
    }

    const targetCenter = track.scrollLeft + track.clientWidth / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, index) => {
      const slide = child as HTMLElement;
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - targetCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    setActiveScreenshotIndex((currentIndex) => currentIndex === closestIndex ? currentIndex : closestIndex);
  }, []);
  const handleScreenshotPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const track = screenshotTrackRef.current;

    if (!track || event.button !== 0) {
      return;
    }

    screenshotDragRef.current = {
      active: true,
      startX: event.clientX,
      scrollLeft: track.scrollLeft,
    };
    setIsScreenshotDragging(true);
    track.setPointerCapture(event.pointerId);
  }, []);
  const handleScreenshotPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const track = screenshotTrackRef.current;
    const drag = screenshotDragRef.current;

    if (!track || !drag.active) {
      return;
    }

    event.preventDefault();
    track.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
  }, []);
  const endScreenshotDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const track = screenshotTrackRef.current;

    if (!screenshotDragRef.current.active) {
      return;
    }

    screenshotDragRef.current.active = false;
    setIsScreenshotDragging(false);

    if (track?.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }

    requestAnimationFrame(handleScreenshotScroll);
  }, [handleScreenshotScroll]);

  const summaryRows = [
    formattedPrice ? ["Price", formattedPrice] : null,
    rating ? ["Rating", rating] : null,
    version ? ["Version", version] : null,
    minimumOsVersion ? ["Minimum OS", minimumOsVersion] : null,
  ].filter(Boolean) as [string, string][];

  const detailRows = [
    maker ? ["Developer", maker] : null,
    sellerName && sellerName !== maker ? ["Seller", sellerName] : null,
    kind ? ["Type", titleCaseDetailValue(kind)] : null,
    advisory ? ["Age rating", advisory] : null,
    releaseDate ? ["Released", releaseDate] : null,
    updatedDate ? ["Updated", updatedDate] : null,
    appSize ? ["Size", appSize] : null,
    languages.length > 0 ? ["Languages", `${languages.slice(0, 8).join(", ")}${languages.length > 8 ? ` +${languages.length - 8}` : ""}`] : null,
    supportedDevices.length > 0 ? ["Devices", `${supportedDevices.length.toLocaleString()} supported`] : null,
    appId ? ["App ID", appId] : null,
  ].filter(Boolean) as [string, string][];

  return (
    <article className="mx-auto max-w-[1080px] pb-14">
      <button type="button" onClick={onBack} className="mb-6 text-[13px] text-white/44 transition-colors hover:text-white">
        ← Back to AppStore
      </button>

      <section className="relative overflow-hidden rounded-[26px] bg-[#030303] px-7 py-10 ring-1 ring-white/[0.045] md:px-10 md:py-12">
        {heroImage && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] items-center justify-center overflow-hidden md:flex">
            <div className="absolute inset-0 bg-gradient-to-r from-[#030303] via-[#030303]/55 to-transparent" />
            <img
              src={heroImage}
              alt=""
              className="relative h-[78%] max-h-[300px] w-[78%] max-w-[300px] rounded-[42px] object-contain opacity-[0.16] blur-[0.3px]"
            />
          </div>
        )}
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            {heroImage && (
              <img
                src={heroImage}
                alt=""
                className="size-[78px] rounded-[18px] object-cover shadow-[0_18px_50px_rgba(0,0,0,0.48)] ring-1 ring-white/[0.07]"
              />
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">
                {chart} {rank && `· #${rank}`} {formatDate(article.published_at) && `· ${formatDate(article.published_at)}`}
              </p>
              <h1 className="mt-2 max-w-[720px] text-[34px] font-semibold leading-[1.04] tracking-tight text-white md:text-[48px]">
                {appName}
              </h1>
              {maker && <p className="mt-2 text-[14px] text-white/60">{maker}</p>}
            </div>
          </div>

          {article.summary && (
            <p className="mt-8 max-w-[760px] text-[16px] leading-8 text-white/74">
              {article.summary}
            </p>
          )}

          {genres.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {genres.slice(0, 8).map((genre) => (
                <span key={genre} className="rounded-full border border-white/[0.08] px-3 py-1 text-[12px] text-white/68">
                  {genre}
                </span>
              ))}
            </div>
          )}

          <a
            href={appleDetails?.url || article.url}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-flex h-9 w-fit items-center rounded-full bg-white/[0.08] px-4 text-[13px] font-medium text-white/76 ring-1 ring-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            Open in App Store on Mac
          </a>
        </div>
      </section>

      {(body || detailRows.length > 0 || releaseNotes || screenshots.length > 0 || advisories.length > 0 || isLoadingAppleDetails) && (
        <section className="content-visibility-auto pt-7">
          <div className="grid gap-9 pt-6 md:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              {(body || detailRows.length > 0 || releaseNotes || screenshots.length > 0 || isLoadingAppleDetails) && (
                <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">App details</p>
              )}
              {isLoadingAppleDetails && <p className="mt-5 text-[14px] text-white/38">Loading Apple details...</p>}
              {bodyParagraphs.length > 0 && <ArticleBodyScroll paragraphs={bodyParagraphs} />}
              {detailRows.length > 0 && (
                <dl className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                  {detailRows.map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</dt>
                      <dd className="mt-1 break-words text-[14px] leading-6 text-white/76">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {releaseNoteParagraphs.length > 0 && (
                <div className="mt-8 border-t border-white/[0.055] pt-6">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">Latest version notes</p>
                  <ArticleBodyScroll paragraphs={releaseNoteParagraphs} compact={hasBriefReleaseNotes} />
                </div>
              )}
              {screenshots.length > 0 && (
                <div className="mt-9 pt-6">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-white/44">Screenshots</p>
                  <div
                    ref={screenshotTrackRef}
                    onScroll={handleScreenshotScroll}
                    onPointerDown={handleScreenshotPointerDown}
                    onPointerMove={handleScreenshotPointerMove}
                    onPointerUp={endScreenshotDrag}
                    onPointerCancel={endScreenshotDrag}
                    className={[
                      "-mx-2 mt-4 flex gap-4 overflow-x-auto px-2 pb-4 [scrollbar-width:none] [touch-action:pan-y] [&::-webkit-scrollbar]:hidden",
                      isScreenshotDragging ? "cursor-grabbing snap-none select-none" : "cursor-grab snap-x snap-mandatory",
                    ].join(" ")}
                  >
                    {screenshots.map((src) => (
                      <div
                        key={src}
                        className="min-w-[82%] snap-center overflow-hidden rounded-[24px] bg-white/[0.025] ring-1 ring-white/[0.07] sm:min-w-[68%] lg:min-w-[58%]"
                      >
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          className="aspect-[16/10] w-full object-cover opacity-90"
                        />
                      </div>
                    ))}
                  </div>
                  {screenshots.length > 1 && (
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex gap-1.5">
                        {screenshots.map((src, index) => (
                          <button
                            key={`${src}-dot`}
                            type="button"
                            aria-label={`Show screenshot ${index + 1}`}
                            onClick={() => goToScreenshot(index)}
                            className={`h-1.5 rounded-full transition-all ${activeScreenshotIndex === index ? "w-5 bg-white/72" : "w-1.5 bg-white/22 hover:bg-white/42"}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          aria-label="Previous screenshot"
                          onClick={() => goToScreenshot(activeScreenshotIndex - 1)}
                          disabled={activeScreenshotIndex === 0}
                          className="inline-flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-white/72 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/[0.07] disabled:hover:text-white/72"
                        >
                          <ChevronLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Next screenshot"
                          onClick={() => goToScreenshot(activeScreenshotIndex + 1)}
                          disabled={activeScreenshotIndex === screenshots.length - 1}
                          className="inline-flex size-8 items-center justify-center rounded-full bg-white/[0.07] text-white/72 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.12] hover:text-white disabled:cursor-default disabled:opacity-30 disabled:hover:bg-white/[0.07] disabled:hover:text-white/72"
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
          </div>
          <aside className="space-y-7">
            {summaryRows.length > 0 && (
              <dl className="grid content-start gap-5 text-[14px] sm:grid-cols-2 md:grid-cols-1">
                {summaryRows.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-[10px] uppercase tracking-[0.22em] text-white/40">{label}</dt>
                    <dd className="mt-1 text-white/82">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {advisories.length > 0 && (
              <div className="border-t border-white/[0.055] pt-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/40">Advisories</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {advisories.map((advisoryText) => (
                    <span key={advisoryText} className="rounded-full border border-white/[0.07] px-3 py-1 text-[12px] text-white/64">
                      {advisoryText}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </aside>
          </div>
        </section>
      )}
    </article>
  );
}

function CardSilkField({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let time = 0;
    const speed = 0.018;
    const scale = 2.4;
    const noiseIntensity = 0.62;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width / 3));
      canvas.height = Math.max(1, Math.floor(rect.height / 3));
    };

    const noise = (x: number, y: number) => {
      const g = 2.71828;
      const rx = g * Math.sin(g * x);
      const ry = g * Math.sin(g * y);
      return (rx * ry * (1 + x)) % 1;
    };

    const animate = () => {
      const { width, height } = canvas;
      if (width === 0 || height === 0) {
        frameRef.current = requestAnimationFrame(animate);
        return;
      }

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#111015");
      gradient.addColorStop(0.45, "#3a3444");
      gradient.addColorStop(1, "#111015");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      for (let x = 0; x < width; x += 2) {
        for (let y = 0; y < height; y += 2) {
          const u = (x / width) * scale;
          const v = (y / height) * scale;
          const tOffset = speed * time;
          const texX = u;
          const texY = v + 0.03 * Math.sin(8.0 * texX - tOffset);
          const pattern = 0.6 + 0.4 * Math.sin(
            5.0 * (
              texX + texY +
              Math.cos(3.0 * texX + 5.0 * texY) +
              0.02 * tOffset
            ) +
            Math.sin(20.0 * (texX + texY - 0.1 * tOffset))
          );
          const crossThread = 0.85 + 0.15 * Math.sin((x + y) * 0.9);
          const intensity = Math.max(0, pattern * crossThread - noise(x, y) / 15.0 * noiseIntensity);
          const index = (y * width + x) * 4;
          data[index] = Math.floor(150 * intensity);
          data[index + 1] = Math.floor(140 * intensity);
          data[index + 2] = Math.floor(166 * intensity);
          data[index + 3] = 245;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const overlay = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) / 2);
      overlay.addColorStop(0, "rgba(255, 255, 255, 0.08)");
      overlay.addColorStop(0.5, "rgba(0, 0, 0, 0)");
      overlay.addColorStop(1, "rgba(0, 0, 0, 0.4)");
      ctx.fillStyle = overlay;
      ctx.fillRect(0, 0, width, height);

      time += 1;
      frameRef.current = requestAnimationFrame(animate);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <div
      {...props}
      className={`relative isolate overflow-hidden rounded-[20px] border border-white/[0.035] bg-[radial-gradient(circle_at_50%_22%,rgba(134,124,150,0.34)_0%,rgba(52,47,61,0.28)_34%,rgba(10,10,12,0.96)_76%,#000_100%)] px-4 py-4 sm:px-6 sm:py-6 ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full opacity-[0.95] blur-[0.5px]"
      />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.065)_0%,rgba(0,0,0,0)_44%,rgba(0,0,0,0.46)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:4px_4px] opacity-42" />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(90deg,#000_0%,rgba(0,0,0,0.1)_10%,rgba(0,0,0,0.1)_90%,#000_100%),linear-gradient(180deg,rgba(0,0,0,0.22)_0%,transparent_10%,transparent_82%,#000_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-32 bg-[linear-gradient(180deg,#000_0%,rgba(0,0,0,0.96)_22%,rgba(0,0,0,0.7)_48%,rgba(0,0,0,0)_100%)]" />
      {children}
    </div>
  );
}

// ── Steam Hero Carousel Component ────────────────────────────────────
function EdgeLightWrapper({ children, className = "", radius = "0.75rem", ...props }: any) {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  return (
    <button
      {...props}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative overflow-hidden ${className}`}
      style={{ borderRadius: radius }}
    >
      <div className="absolute inset-0 pointer-events-none z-40 border border-white/5" style={{ borderRadius: radius }} />
      <div 
        className="absolute inset-0 z-50 pointer-events-none transition-opacity duration-300"
        style={{
           opacity: isHovered ? 1 : 0,
           background: `radial-gradient(350px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.7), transparent 40%)`,
           WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
           WebkitMaskComposite: "xor",
           maskComposite: "exclude",
           padding: "1.5px",
           borderRadius: radius
        }}
      />
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </button>
  );
}

function HeroCarousel({ games, addingSteamId, onSelect, onOpenDetail }: { games: any[]; addingSteamId: string | null; onSelect: (g: any) => void; onOpenDetail: (id: number) => void }) {
  const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setBrokenImageIds(new Set());
  }, [games]);

  const visibleGames = useMemo(() => {
    return games.filter((game) => !brokenImageIds.has(game.steam_app_id)).slice(0, 5);
  }, [games, brokenImageIds]);

  if (visibleGames.length === 0) return null;
  
  return (
    <div className="-mx-4 sm:mx-0">
      <style>{`
        @keyframes heroCarouselDrift {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-24px, 0, 0); }
        }

        .hero-carousel-track {
          animation: heroCarouselDrift 26s ease-in-out infinite alternate;
          will-change: transform;
        }

        .hero-carousel-card-distant img {
          opacity: 0.72;
          transform: scale(1.01);
        }

        .hero-carousel-card-distant:hover img,
        .hero-carousel-card-distant:focus-visible img {
          opacity: 0.95;
        }
      `}</style>
      <div className="pb-6 px-4 sm:px-0">
        <div className="hero-carousel-track mx-auto flex w-full max-w-[1500px] justify-center gap-4">
        {visibleGames.map((r, index) => {
          const isLocal = r.isLocal;
          const tier = isLocal ? (r.aggregate_tier || r.latest_test?.status) : null;
          const distantClass = index >= 3 ? "hero-carousel-card-distant" : "";
          return (
            <EdgeLightWrapper
              key={r.steam_app_id}
              aria-label={r.name}
              data-steam-card="true"
              onClick={() => isLocal ? onOpenDetail(r.id) : onSelect(r)} 
              disabled={!isLocal && addingSteamId === r.steam_app_id}
              className={`flex-none w-[280px] sm:w-[300px] text-left liquid-glass transition-colors duration-300 focus:outline-none shadow-xl ${distantClass}`}
              radius="0.75rem"
            >
              <div className="relative w-full aspect-[460/215] bg-[#111] overflow-hidden">
                {!isLocal && addingSteamId === r.steam_app_id && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                    <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  </div>
                )}
                <img
                  src={r.cover_art_url}
                  loading={index < 2 ? "eager" : "lazy"}
                  decoding="async"
                  width={460}
                  height={215}
                  fetchPriority={index < 2 ? "high" : "auto"}
                  className="w-full h-full object-cover opacity-90 hover:opacity-100 transition-[filter,opacity,transform] duration-700 ease-out"
                  alt={r.name}
                  onError={() => {
                    setBrokenImageIds((previous) => {
                      const next = new Set(previous);
                      next.add(r.steam_app_id);
                      return next;
                    });
                  }}
                />
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
                  {isLocal && tier && (
                    <TierBadge tier={tier} size="md" />
                  )}
                </div>
              </div>
            </EdgeLightWrapper>
          );
        })}
        </div>
      </div>
    </div>
  );
}

// ── Steam Grid Component ────────────────────────────────────
function steamCardEstimate(game: any, hardware?: UserHardware | null) {
  const chip = hardware?.chip?.trim();
  if (game.latest_test && chip && game.latest_test.hardware?.toLowerCase().includes(chip.toLowerCase())) {
    return `${chip}: ${getTierConfig(game.latest_test.status).label}${game.latest_test.fps ? ` · ${game.latest_test.fps} FPS` : ""}`;
  }
  if (game.mac_native || game.compatibility_tier === "native_arm") {
    return chip ? `${chip}: Native Mac build` : "Native Mac build";
  }
  if (game.latest_test) {
    return [chip || "Reports", getTierConfig(game.latest_test.status).label, game.latest_test.fps ? `${game.latest_test.fps} FPS` : ""].filter(Boolean).join(" · ");
  }
  return chip ? `${chip}: No Mac reports` : "No Mac reports";
}

function SteamGameCard({
  game,
  index,
  addingSteamId,
  onSelect,
  onOpenDetail,
  hardware,
  eagerCount,
}: {
  game: any;
  index: number;
  addingSteamId: string | null;
  onSelect: (g: any) => void;
  onOpenDetail: (id: number) => void;
  hardware?: UserHardware | null;
  eagerCount: number;
}) {
  const isLocal = game.isLocal;
  const tier = isLocal ? (game.aggregate_tier || game.latest_test?.status) : null;
  const loadImmediately = index < eagerCount;
  return (
    <EdgeLightWrapper
      key={game.steam_app_id}
      aria-label={game.name}
      data-steam-card="true"
      onClick={() => isLocal ? onOpenDetail(game.id) : onSelect(game)}
      disabled={!isLocal && addingSteamId === game.steam_app_id}
      className="group w-full text-left liquid-glass transition-colors duration-300 focus:outline-none shadow-xl"
      radius="1rem"
    >
      <div className="relative w-full aspect-[460/215] bg-transparent overflow-hidden rounded-2xl">
        {!isLocal && addingSteamId === game.steam_app_id && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-20">
            <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </div>
        )}
        <img
          src={game.cover_art_url}
          loading={loadImmediately ? "eager" : "lazy"}
          decoding="async"
          width={460}
          height={215}
          className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
          alt={game.name}
          onError={(event) => {
            const card = event.currentTarget.closest('[data-steam-card]') as HTMLElement | null;
            if (card) card.style.display = "none";
          }}
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300 z-10" />

        <div className="absolute bottom-0 left-0 right-0 p-3 z-10">
          <div className="flex items-end justify-between gap-2">
            <h3 className="min-w-0 truncate pr-2 text-[13px] font-medium text-white drop-shadow-md">{game.name}</h3>
            {isLocal && tier && (
              <div className="flex-none scale-90 origin-bottom-right">
                <TierBadge tier={tier} size="sm" />
              </div>
            )}
          </div>
          <p className="mt-1 truncate text-[10px] text-white/42">{steamCardEstimate(game, hardware)}</p>
        </div>
      </div>
    </EdgeLightWrapper>
  );
}

function SteamGameGrid({ games, addingSteamId, onSelect, onOpenDetail, hardware, eagerCount = 0, virtualScrollRef }: { games: any[]; addingSteamId: string | null; onSelect: (g: any) => void; onOpenDetail: (id: number) => void; hardware?: UserHardware | null; eagerCount?: number; virtualScrollRef?: RefObject<HTMLDivElement | null> }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridWidth, setGridWidth] = useState(0);

  useEffect(() => {
    const node = gridRef.current;
    if (!node) return;
    const updateWidth = () => setGridWidth(node.getBoundingClientRect().width);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const shouldVirtualize = Boolean(virtualScrollRef) && games.length > INITIAL_COMPATIBILITY_CARD_COUNT;
  const columnCount = gridWidth >= 1280 ? 5 : gridWidth >= 1024 ? 4 : gridWidth >= 640 ? 3 : gridWidth >= 430 ? 2 : 1;
  const gap = 16;
  const cardWidth = gridWidth > 0 ? (gridWidth - gap * (columnCount - 1)) / columnCount : 320;
  const rowHeight = Math.max(112, Math.round(cardWidth * (215 / 460) + gap));
  const rowCount = Math.ceil(games.length / columnCount);
  const scrollMargin = shouldVirtualize ? gridRef.current?.offsetTop ?? 0 : 0;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    getScrollElement: () => virtualScrollRef?.current ?? null,
    estimateSize: () => rowHeight,
    scrollMargin,
    overscan: 3,
  });

  if (games.length === 0) return null;

  if (shouldVirtualize) {
    const virtualRows = rowVirtualizer.getVirtualItems();
    return (
      <div ref={gridRef} className="relative w-full" style={{ height: rowVirtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const start = virtualRow.index * columnCount;
          const rowGames = games.slice(start, start + columnCount);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 grid w-full grid-cols-1 gap-4 min-[430px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
            >
              {rowGames.map((game, rowIndex) => (
                <SteamGameCard
                  key={game.steam_app_id}
                  game={game}
                  index={start + rowIndex}
                  addingSteamId={addingSteamId}
                  onSelect={onSelect}
                  onOpenDetail={onOpenDetail}
                  hardware={hardware}
                  eagerCount={eagerCount}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={gridRef} className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {games.map((game, index) => (
        <SteamGameCard
          key={game.steam_app_id}
          game={game}
          index={index}
          addingSteamId={addingSteamId}
          onSelect={onSelect}
          onOpenDetail={onOpenDetail}
          hardware={hardware}
          eagerCount={eagerCount}
        />
      ))}
    </div>
  );
}

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  maxOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number | string;
}

function colorWithOpacity(color: string, opacity: number) {
  const clean = color.replace("#", "");
  const hex = clean.length === 3
    ? clean.split("").map((part) => part + part).join("")
    : clean;
  const value = Number.parseInt(hex, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function FlickeringGrid({
  squareSize = 3,
  gridGap = 3,
  flickerChance = 0.2,
  color = "#B4B4B4",
  width,
  height,
  className = "",
  maxOpacity = 0.15,
  text = "",
  fontSize = 140,
  fontWeight = 600,
  ...props
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const drawGrid = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvasWidth: number,
      canvasHeight: number,
      cols: number,
      rows: number,
      squares: Float32Array,
      dpr: number,
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvasWidth;
      maskCanvas.height = canvasHeight;
      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!maskCtx) return;

      if (text) {
        maskCtx.save();
        maskCtx.scale(dpr, dpr);
        maskCtx.fillStyle = "white";
        maskCtx.font = `${fontWeight} ${fontSize}px "Geist Variable", "Aeonik", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        maskCtx.textAlign = "center";
        maskCtx.textBaseline = "middle";
        maskCtx.fillText(text, canvasWidth / (2 * dpr), canvasHeight / (2 * dpr));
        maskCtx.restore();
      }

      const step = (squareSize + gridGap) * dpr;
      const squareWidth = Math.max(1, Math.floor(squareSize * dpr));
      const squareHeight = Math.max(1, Math.floor(squareSize * dpr));

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = Math.floor(i * step);
          const y = Math.floor(j * step);
          const maskData = maskCtx.getImageData(x, y, squareWidth, squareHeight).data;
          const hasText = maskData.some((value, index) => index % 4 === 0 && value > 0);
          const opacity = squares[i * rows + j];
          const finalOpacity = hasText ? Math.min(1, opacity * 3 + 0.4) : opacity;

          ctx.fillStyle = colorWithOpacity(color, finalOpacity);
          ctx.fillRect(x, y, squareWidth, squareHeight);
        }
      }
    },
    [color, squareSize, gridGap, text, fontSize, fontWeight],
  );

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, nextWidth: number, nextHeight: number) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(nextWidth * dpr);
      canvas.height = Math.floor(nextHeight * dpr);
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;

      const cols = Math.ceil(nextWidth / (squareSize + gridGap));
      const rows = Math.ceil(nextHeight / (squareSize + gridGap));
      const squares = new Float32Array(cols * rows);

      for (let i = 0; i < squares.length; i++) {
        squares[i] = Math.random() * maxOpacity;
      }

      return { cols, rows, squares, dpr };
    },
    [squareSize, gridGap, maxOpacity],
  );

  const updateSquares = useCallback(
    (squares: Float32Array, deltaTime: number) => {
      for (let i = 0; i < squares.length; i++) {
        if (Math.random() < flickerChance * deltaTime) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId = 0;
    let gridParams: ReturnType<typeof setupCanvas>;

    const updateCanvasSize = () => {
      const nextWidth = width || container.clientWidth;
      const nextHeight = height || container.clientHeight;
      setCanvasSize({ width: nextWidth, height: nextHeight });
      gridParams = setupCanvas(canvas, nextWidth, nextHeight);
    };

    updateCanvasSize();

    let lastTime = 0;
    const animate = (time: number) => {
      if (!isInView) return;

      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;

      updateSquares(gridParams.squares, deltaTime);
      drawGrid(
        ctx,
        canvas.width,
        canvas.height,
        gridParams.cols,
        gridParams.rows,
        gridParams.squares,
        gridParams.dpr,
      );
      animationFrameId = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    if (isInView) {
      animationFrameId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [setupCanvas, updateSquares, drawGrid, width, height, isInView]);

  return (
    <div ref={containerRef} className={`h-full w-full ${className}`} {...props}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ width: canvasSize.width, height: canvasSize.height }}
      />
    </div>
  );
}

function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const checkQuery = () => {
      setValue(window.matchMedia(query).matches);
    };

    checkQuery();
    window.addEventListener("resize", checkQuery);
    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener("change", checkQuery);

    return () => {
      window.removeEventListener("resize", checkQuery);
      mediaQuery.removeEventListener("change", checkQuery);
    };
  }, [query]);

  return value;
}

function FooterLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="size-8 text-white"
      aria-hidden="true"
    >
      <path
        d="M17.057 10.45c-.015-2.484 2.03-3.677 2.118-3.73a3.782 3.782 0 0 0-2.955-1.597c-1.25-.126-2.43.74-3.064.74-.633 0-1.6-.724-2.642-.703a3.94 3.94 0 0 0-3.308 2.006c-1.393 2.417-.356 5.992 1.008 7.958.667.962 1.462 2.038 2.5 1.998 1.003-.04 1.38-.646 2.593-.646s1.55.646 2.61.625c1.08-.02 1.776-.974 2.44-1.942.766-1.119 1.083-2.203 1.101-2.261-.024-.01-2.13-.815-2.152-3.253zM14.93 4.298a3.616 3.616 0 0 0 .843-2.528 3.67 3.67 0 0 0-2.393 1.238 3.483 3.483 0 0 0-.877 2.442 3.1 3.1 0 0 0 2.427-1.152z"
        fill="currentColor"
      />
    </svg>
  );
}

function FooterChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlickeringFooter() {
  const tablet = useMediaQuery("(max-width: 1024px)");
  const footerLinks = [
    { title: "Company", links: ["Home", "News", "Community", "Discord"] },
    { title: "Database", links: ["Compatibility", "Reports", "Games", "Hardware"] },
    { title: "Resources", links: ["Submit Report", "Steam", "Crossover", "Support"] },
  ];

  return (
    <footer id="footer" className="safe-inline safe-bottom-pad relative z-10 w-full bg-black">
      <div className="mx-auto flex max-w-[1600px] flex-col p-10 md:flex-row md:items-center md:justify-between">
        <div className="mx-0 flex max-w-xs flex-col items-start justify-start gap-y-5">
          <a href="#" className="flex items-center gap-2">
            <FooterLogo />
            <p className="text-xl font-semibold text-white/80">MacReady</p>
          </a>
          <p className="text-[15px] font-medium leading-6 tracking-tight text-white/45">
            A clearer way to judge Mac game support.
          </p>
        </div>

        <div className="pt-5 md:w-1/2">
          <div className="flex flex-col items-start justify-start gap-y-5 md:flex-row md:items-start md:justify-between lg:pl-10">
            {footerLinks.map((column) => (
              <ul key={column.title} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-white/75">
                  {column.title}
                </li>
                {column.links.map((link) => (
                  <li
                    key={link}
                    className="group inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-white/42"
                  >
                    <a href="#" className="transition-colors group-hover:text-white/70">{link}</a>
                    <div className="flex size-4 translate-x-0 items-center justify-center rounded border border-white/10 opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100">
                      <FooterChevron />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-0 mt-24 h-48 w-full md:h-64">
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-transparent from-40% to-black" />
        <div className="absolute inset-0 mx-6">
          <FlickeringGrid
            text="MacReady"
            fontSize={tablet ? 70 : 90}
            className="h-full w-full"
            squareSize={2}
            gridGap={tablet ? 2 : 3}
            color="#6B7280"
            maxOpacity={0.3}
            flickerChance={0.1}
          />
        </div>
      </div>
    </footer>
  );
}
