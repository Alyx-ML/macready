import type { Game, GameDetail, CreateGameRequest, AddTestRequest, IngestResult, User, UserHardware, SteamReviewSummary, MacNewsItem, SteamMetadata } from "../types/gamedb";

const BASE = "/api/v1/gamedb";
const STATIC_DATA_BASE = `${import.meta.env.BASE_URL}data`;
const USE_STATIC_DATA = import.meta.env.VITE_GITHUB_PAGES_DATA === "true";
export const isStaticDataMode = USE_STATIC_DATA;
const staticJSONCache = new Map<string, Promise<unknown>>();

export type SteamCatalogItem = {
  name: string;
  steam_app_id: string;
  cover_art_url: string;
  description?: string;
  genres?: string[];
  mac_native?: boolean;
  crossover_playable?: boolean;
  compatibility_tier?: string;
  compatibility_label?: string;
  compatibility_reasons?: string[];
  feed?: "featured" | "top_sellers" | "new_releases";
  feed_rank?: number;
  steam?: SteamMetadata | null;
  reviews?: SteamReviewSummary | null;
};

function getToken(): string | null {
  return localStorage.getItem("macgamedb_token");
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> || {}),
    ...authHeaders(),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchStaticJSON<T>(fileName: string): Promise<T> {
  const cached = staticJSONCache.get(fileName);
  if (cached) return cached as Promise<T>;
  const res = await fetch(`${STATIC_DATA_BASE}/${fileName}`);
  if (!res.ok) {
    throw new Error(`Static data error ${res.status}: ${fileName}`);
  }
  const promise = res.json() as Promise<T>;
  staticJSONCache.set(fileName, promise);
  return promise;
}

function steamItemToGame(item: SteamCatalogItem, index: number): Game {
  return {
    id: Number(item.steam_app_id) || index + 1,
    name: item.name,
    platform: item.mac_native ? "Steam, Mac" : "Steam",
    genre: item.genres?.slice(0, 3).join(", "),
    store_url: `https://store.steampowered.com/app/${item.steam_app_id}`,
    steam_app_id: item.steam_app_id,
    cover_art_url: item.cover_art_url,
    created_at: "2026-05-05T00:00:00.000Z",
    aggregate_tier: item.compatibility_tier as Game["aggregate_tier"],
  };
}

function itemMatchesStatus(item: SteamCatalogItem, status?: string): boolean {
  return !status || item.compatibility_tier === status;
}

function itemMatchesSearch(item: SteamCatalogItem, search?: string): boolean {
  if (!search) return true;
  const query = search.toLowerCase();
  return [
    item.name,
    item.description,
    item.genres?.join(" "),
    item.compatibility_label,
    item.compatibility_reasons?.join(" "),
  ].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function mergeSteamItems(primary: SteamCatalogItem[], secondary: SteamCatalogItem[]): SteamCatalogItem[] {
  const byId = new Map<string, SteamCatalogItem>();
  for (const item of secondary) byId.set(item.steam_app_id, item);
  for (const item of primary) byId.set(item.steam_app_id, { ...byId.get(item.steam_app_id), ...item });
  return Array.from(byId.values());
}

function parseAppleAppResult(app: any, index: number, searchTerm: string): MacNewsItem | null {
  const appId = String(app.trackId || "");
  const name = String(app.trackName || "");
  const url = String(app.trackViewUrl || "");
  if (!appId || !name || !url) return null;

  const maker = String(app.artistName || "");
  const genres = Array.isArray(app.genres) ? app.genres.filter(Boolean).map(String) : [];
  const genreText = genres.length > 0 ? ` It is listed under ${genres.slice(0, 3).join(", ")}.` : "";
  const summary = maker
    ? `${name} by ${maker} matched "${searchTerm}" on the Mac App Store.${genreText}`
    : `${name} matched "${searchTerm}" on the Mac App Store.${genreText}`;

  return {
    id: `Apple App Store Search:${appId}:${index}`,
    title: name,
    url,
    source: "Apple App Store",
    category: "App Store",
    published_at: String(app.currentVersionReleaseDate || app.releaseDate || new Date().toISOString()),
    summary,
    content: summary,
    image_url: String(app.artworkUrl512 || app.artworkUrl100 || ""),
    metadata: {
      maker,
      sellerName: String(app.sellerName || ""),
      description: String(app.description || ""),
      releaseNotes: String(app.releaseNotes || ""),
      formattedPrice: String(app.formattedPrice || ""),
      price: typeof app.price === "number" ? app.price : undefined,
      currency: String(app.currency || ""),
      averageUserRating: typeof app.averageUserRating === "number" ? app.averageUserRating : undefined,
      userRatingCount: typeof app.userRatingCount === "number" ? app.userRatingCount : undefined,
      trackContentRating: String(app.trackContentRating || ""),
      advisory: String(app.trackContentRating || ""),
      minimumOsVersion: String(app.minimumOsVersion || ""),
      version: String(app.version || ""),
      currentVersionReleaseDate: String(app.currentVersionReleaseDate || ""),
      releaseDate: String(app.releaseDate || ""),
      fileSizeBytes: String(app.fileSizeBytes || ""),
      genres,
      kind: String(app.kind || ""),
      screenshotUrls: Array.isArray(app.screenshotUrls) ? app.screenshotUrls.filter(Boolean) : [],
      ipadScreenshotUrls: Array.isArray(app.ipadScreenshotUrls) ? app.ipadScreenshotUrls.filter(Boolean) : [],
      languageCodesISO2A: Array.isArray(app.languageCodesISO2A) ? app.languageCodesISO2A.filter(Boolean) : [],
      supportedDevices: Array.isArray(app.supportedDevices) ? app.supportedDevices.filter(Boolean) : [],
      advisories: Array.isArray(app.advisories) ? app.advisories.filter(Boolean) : [],
      artistUrl: String(app.artistViewUrl || ""),
      appId,
      chartTitle: "Mac App Store Search",
    },
  };
}

function fetchAppleSearchJsonp(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const callbackName = `macreadyAppStoreSearch_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const cleanup = () => {
      delete (window as any)[callbackName];
      script.remove();
    };

    (window as any)[callbackName] = (payload: any) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Apple search failed"));
    };
    script.src = `${url}&callback=${encodeURIComponent(callbackName)}`;
    document.head.appendChild(script);
  });
}

// ── Games ───────────────────────────────────────────────────────────
export async function listGames(params?: {
  search?: string;
  status?: string;
  wine_version?: string;
  macos_version?: string;
  hardware?: string;
}): Promise<Game[]> {
  if (USE_STATIC_DATA) {
    return [];
  }
  const sp = new URLSearchParams();
  if (params?.search) sp.set("search", params.search);
  if (params?.status) sp.set("status", params.status);
  if (params?.wine_version) sp.set("wine_version", params.wine_version);
  if (params?.macos_version) sp.set("macos_version", params.macos_version);
  if (params?.hardware) sp.set("hardware", params.hardware);
  const data = await fetchJSON<{ games: Game[] }>(`${BASE}/games?${sp.toString()}`);
  return data.games;
}

export async function createGame(req: CreateGameRequest): Promise<{ id: number }> {
  return fetchJSON<{ id: number }>(`${BASE}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function getGame(id: number): Promise<GameDetail> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-trending.json");
    const searchData = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-search-index.json");
    const allItems = mergeSteamItems(data.items, searchData.items);
    const itemIndex = allItems.findIndex((candidate) => Number(candidate.steam_app_id) === id);
    const item = allItems[itemIndex];
    if (!item) {
      throw new Error(`Static game not found: ${id}`);
    }
    const tier = item.compatibility_tier as Game["aggregate_tier"] || "unsupported";
    const game = steamItemToGame(item, itemIndex);
    const steam = item.steam ? {
      ...item.steam,
      header_image: item.steam.header_image || item.cover_art_url,
      capsule_image: item.steam.capsule_image || item.cover_art_url,
      store_url: item.steam.store_url || game.store_url,
    } : {
      steam_app_id: item.steam_app_id,
      description: item.description,
      genres: item.genres,
      store_url: game.store_url,
      header_image: item.cover_art_url,
      capsule_image: item.cover_art_url,
      mac_native: Boolean(item.mac_native),
      crossover_playable: Boolean(item.crossover_playable),
      compatibility_tier: tier,
      compatibility_label: item.compatibility_label,
      compatibility_reasons: item.compatibility_reasons,
      platforms: {
        windows: true,
        mac: Boolean(item.mac_native),
        linux: false,
      },
    };
    return {
      game,
      steam,
      tests: [],
      aggregate: {
        tier,
        total_reports: 0,
        breakdown: {} as GameDetail["aggregate"]["breakdown"],
      },
      hardware_matrix: [],
    };
  }
  return fetchJSON<GameDetail>(`${BASE}/games/${id}`);
}

export async function getSteamReviews(appId: string): Promise<SteamReviewSummary> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-trending.json");
    const item = data.items.find((candidate) => candidate.steam_app_id === appId);
    if (!item?.reviews) {
      throw new Error(`Static Steam reviews not found: ${appId}`);
    }
    return item.reviews;
  }
  const data = await fetchJSON<{ reviews: SteamReviewSummary }>(`${BASE}/steam/reviews?app_id=${encodeURIComponent(appId)}`);
  return data.reviews;
}

export async function getMacNews(): Promise<MacNewsItem[]> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: MacNewsItem[] }>("news.json");
    return data.items;
  }
  const data = await fetchJSON<{ items: MacNewsItem[] }>(`${BASE}/news`);
  return data.items;
}

export async function getSteamTrending(): Promise<SteamCatalogItem[]> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-trending.json");
    return data.items;
  }
  const data = await fetchJSON<{ items: SteamCatalogItem[] }>(`${BASE}/steam/trending`);
  return data.items;
}

export async function searchSteamCatalog(params: { q: string; status?: string }): Promise<SteamCatalogItem[]> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-trending.json");
    const searchData = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-search-index.json");
    return mergeSteamItems(data.items, searchData.items)
      .filter((item) => itemMatchesSearch(item, params.q) && itemMatchesStatus(item, params.status))
      .slice(0, 24);
  }
  const sp = new URLSearchParams({ q: params.q });
  if (params.status) sp.set("status", params.status);
  const data = await fetchJSON<{ items: SteamCatalogItem[] }>(`${BASE}/steam/search?${sp.toString()}`);
  return data.items;
}

export async function getAppStoreDetails(appId: string): Promise<Partial<MacNewsItem>> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: MacNewsItem[] }>("news.json");
    const item = data.items.find((candidate) => candidate.metadata?.appId === appId);
    if (!item) {
      throw new Error(`Static App Store item not found: ${appId}`);
    }
    return item;
  }
  const data = await fetchJSON<{ details: Partial<MacNewsItem> }>(`${BASE}/appstore/lookup?app_id=${encodeURIComponent(appId)}`);
  return data.details;
}

export async function searchAppStore(params: { q: string }): Promise<MacNewsItem[]> {
  const q = params.q.trim();
  if (!q) return [];

  if (USE_STATIC_DATA) {
    const apiUrl = new URL("https://itunes.apple.com/search");
    apiUrl.searchParams.set("term", q);
    apiUrl.searchParams.set("country", "us");
    apiUrl.searchParams.set("media", "software");
    apiUrl.searchParams.set("entity", "macSoftware");
    apiUrl.searchParams.set("limit", "24");
    const payload = await fetchAppleSearchJsonp(apiUrl.toString());
    return (Array.isArray(payload?.results) ? payload.results : [])
      .map((app: any, index: number) => parseAppleAppResult(app, index, q))
      .filter((item: MacNewsItem | null): item is MacNewsItem => Boolean(item));
  }

  const sp = new URLSearchParams({ q });
  const data = await fetchJSON<{ items: MacNewsItem[] }>(`${BASE}/appstore/search?${sp.toString()}`);
  return data.items;
}

export async function updateGame(id: number, req: CreateGameRequest): Promise<void> {
  await fetchJSON(`${BASE}/games/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function deleteGame(id: number): Promise<void> {
  await fetchJSON(`${BASE}/games/${id}`, { method: "DELETE" });
}

export async function addTest(gameId: number, req: AddTestRequest): Promise<{ id: number }> {
  return fetchJSON<{ id: number }>(`${BASE}/games/${gameId}/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

export async function getDistinctValues(column: string): Promise<string[]> {
  if (USE_STATIC_DATA) {
    const data = await fetchStaticJSON<{ items: SteamCatalogItem[] }>("steam-trending.json");
    const games = data.items.map(steamItemToGame);
    const values = games
      .map((game) => game[column as keyof Game])
      .filter((value): value is string => typeof value === "string" && value.length > 0);
    return Array.from(new Set(values)).sort();
  }
  const data = await fetchJSON<{ values: string[] }>(`${BASE}/distinct?column=${encodeURIComponent(column)}`);
  return data.values;
}

// ── Auth ────────────────────────────────────────────────────────────
export async function register(email: string, password: string, display_name: string): Promise<{ user: User; token: string }> {
  const data = await fetchJSON<{ user: User; token: string }>(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, display_name }),
  });
  localStorage.setItem("macgamedb_token", data.token);
  return data;
}

export async function login(email: string, password: string): Promise<{ user: User; token: string }> {
  const data = await fetchJSON<{ user: User; token: string }>(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("macgamedb_token", data.token);
  return data;
}

export async function logout(): Promise<void> {
  await fetchJSON(`${BASE}/auth/logout`, { method: "POST" });
  localStorage.removeItem("macgamedb_token");
}

export async function getMe(): Promise<{ user: User; hardware: UserHardware[] } | null> {
  try {
    return await fetchJSON<{ user: User; hardware: UserHardware[] }>(`${BASE}/auth/me`);
  } catch {
    return null;
  }
}

// ── User Hardware ───────────────────────────────────────────────────
export async function saveHardware(hw: Partial<UserHardware>): Promise<void> {
  await fetchJSON(`${BASE}/users/hardware`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(hw),
  });
}

export async function getHardware(): Promise<UserHardware[]> {
  const data = await fetchJSON<{ hardware: UserHardware[] }>(`${BASE}/users/hardware`);
  return data.hardware;
}

export async function deleteHardware(id: number): Promise<void> {
  await fetchJSON(`${BASE}/users/hardware/${id}`, { method: "DELETE" });
}

// ── Ingest ──────────────────────────────────────────────────────────
export async function ingestPreview(text: string): Promise<IngestResult> {
  const data = await fetchJSON<{ preview: IngestResult }>(`${BASE}/ingest/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return data.preview;
}

export async function ingestSave(result: IngestResult): Promise<{ game_id: number; test_id: number }> {
  return fetchJSON<{ game_id: number; test_id: number }>(`${BASE}/ingest/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
}
