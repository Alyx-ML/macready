import type { Game, GameDetail, CreateGameRequest, AddTestRequest, IngestResult, User, UserHardware, SteamReviewSummary, MacNewsItem } from "../types/gamedb";

const BASE = "/api/v1/gamedb";
const STATIC_DATA_BASE = `${import.meta.env.BASE_URL}data`;
const USE_STATIC_DATA = import.meta.env.VITE_GITHUB_PAGES_DATA === "true";
export const isStaticDataMode = USE_STATIC_DATA;

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
  const res = await fetch(`${STATIC_DATA_BASE}/${fileName}`);
  if (!res.ok) {
    throw new Error(`Static data error ${res.status}: ${fileName}`);
  }
  return res.json();
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
    const itemIndex = data.items.findIndex((candidate) => Number(candidate.steam_app_id) === id);
    const item = data.items[itemIndex];
    if (!item) {
      throw new Error(`Static game not found: ${id}`);
    }
    const tier = item.compatibility_tier as Game["aggregate_tier"] || "unsupported";
    const game = steamItemToGame(item, itemIndex);
    return {
      game,
      steam: {
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
      },
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
    return data.items.filter((item) => itemMatchesSearch(item, params.q) && itemMatchesStatus(item, params.status));
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
