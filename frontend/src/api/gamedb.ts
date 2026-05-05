import type { Game, GameDetail, CreateGameRequest, AddTestRequest, IngestResult, User, UserHardware, SteamReviewSummary, MacNewsItem } from "../types/gamedb";

const BASE = "/api/v1/gamedb";

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

// ── Games ───────────────────────────────────────────────────────────
export async function listGames(params?: {
  search?: string;
  status?: string;
  wine_version?: string;
  macos_version?: string;
  hardware?: string;
}): Promise<Game[]> {
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
  return fetchJSON<GameDetail>(`${BASE}/games/${id}`);
}

export async function getSteamReviews(appId: string): Promise<SteamReviewSummary> {
  const data = await fetchJSON<{ reviews: SteamReviewSummary }>(`${BASE}/steam/reviews?app_id=${encodeURIComponent(appId)}`);
  return data.reviews;
}

export async function getMacNews(): Promise<MacNewsItem[]> {
  const data = await fetchJSON<{ items: MacNewsItem[] }>(`${BASE}/news`);
  return data.items;
}

export async function getAppStoreDetails(appId: string): Promise<Partial<MacNewsItem>> {
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
