export type CompatTier = 
  | "native_arm" 
  | "rosetta2" 
  | "crossover_wine" 
  | "gptk" 
  | "playable" 
  | "issues" 
  | "unsupported"
  // Legacy values kept for backwards compat
  | "working" 
  | "partial" 
  | "broken" 
  | "needs-workaround";

export interface Game {
  id: number;
  name: string;
  platform?: string;
  genre?: string;
  store_url?: string;
  steam_app_id?: string;
  cover_art_url?: string;
  created_at: string;
  tags?: string[];
  latest_test?: Test;
  test_count?: number;
  aggregate_tier?: CompatTier;
  benchmark_summary?: BenchmarkSummary;
}

export interface BenchmarkSummary {
  total_reports: number;
  best_status?: CompatTier;
  method?: string;
  avg_fps?: string;
  hardware?: string;
}

export interface SteamMetadata {
  steam_app_id: string;
  description?: string;
  detailed_description?: string;
  genres?: string[];
  categories?: string[];
  developers?: string[];
  publishers?: string[];
  release_date?: string;
  website?: string;
  is_free?: boolean;
  price_overview?: {
    currency?: string;
    initial?: number;
    final?: number;
    discount_percent?: number;
    initial_formatted?: string;
    final_formatted?: string;
  } | null;
  store_url?: string;
  header_image?: string;
  capsule_image?: string;
  background?: string;
  movies?: {
    id: number;
    name: string;
    thumbnail?: string;
    webm?: string;
    mp4?: string;
  }[];
  screenshots?: {
    id: number;
    thumbnail?: string;
    full: string;
  }[];
  requirements?: {
    pc?: {
      minimum?: string;
      recommended?: string;
    };
    mac?: {
      minimum?: string;
      recommended?: string;
    };
  };
  platforms?: {
    windows?: boolean;
    mac?: boolean;
    linux?: boolean;
  };
  mac_native?: boolean;
  crossover_playable?: boolean;
  compatibility_tier?: CompatTier;
  compatibility_label?: string;
  compatibility_reasons?: string[];
}

export interface SteamReviewSummary {
  steam_app_id: string;
  review_score: number;
  review_score_desc: string;
  total_positive: number;
  total_negative: number;
  total_reviews: number;
}

export type MacNewsCategory = "News" | "Reviews" | "CrossOver" | "App Store" | "Performance" | "Top Lists";

export interface MacNewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: MacNewsCategory;
  published_at?: string;
  summary?: string;
  content?: string;
  image_url?: string;
  metadata?: {
    maker?: string;
    chartTitle?: string;
    chartRank?: number;
    genres?: string[];
    kind?: string;
    releaseDate?: string;
    advisory?: string;
    appId?: string;
    artistUrl?: string;
    description?: string;
    releaseNotes?: string;
    sellerName?: string;
    formattedPrice?: string;
    price?: number;
    currency?: string;
    averageUserRating?: number;
    userRatingCount?: number;
    trackContentRating?: string;
    minimumOsVersion?: string;
    version?: string;
    currentVersionReleaseDate?: string;
    fileSizeBytes?: string;
    screenshotUrls?: string[];
    ipadScreenshotUrls?: string[];
    languageCodesISO2A?: string[];
    supportedDevices?: string[];
    advisories?: string[];
    releaseNotesSections?: {
      title: string;
      level?: number;
      items: {
        kind?: "paragraph" | "listItem" | "heading";
        text: string;
        level?: number;
      }[];
    }[];
    releaseNotesUrl?: string;
    collectionUrl?: string;
    osName?: string;
    product?: string;
    changelogSections?: {
      title: string;
      items: {
        kind?: "paragraph" | "listItem" | "heading";
        text: string;
      }[];
    }[];
  };
}

export interface Test {
  id: number;
  game_id: number;
  user_id?: number;
  tested_at: string;
  macos_version?: string;
  hardware?: string;
  wine_version?: string;
  crossover_version?: string;
  gptk_version?: string;
  launcher?: string;
  play_method?: "Native" | "CrossOver" | "Parallels" | "GPTK";
  translation_layer?: "D3DMetal" | "DXVK" | "DXMT" | "None";
  graphics_preset?: string;
  resolution?: string;
  status: CompatTier;
  fps?: string;
  notes?: string;
  created_at: string;
  issues?: Issue[];
  user_display_name?: string;
}

export interface Issue {
  id: number;
  test_id: number;
  description: string;
  severity?: "minor" | "major" | "critical" | "cosmetic";
  workaround?: string;
  resolved_by_version?: string;
  resolved: boolean;
  created_at: string;
}

export interface GameDetail {
  game: Game;
  steam?: SteamMetadata | null;
  tests: Test[];
  aggregate: AggregateRating;
  hardware_matrix: HardwareEntry[];
}

export interface AggregateRating {
  tier: CompatTier;
  total_reports: number;
  breakdown: Record<CompatTier, number>;
}

export interface HardwareEntry {
  hardware: string;
  report_count: number;
  best_status: CompatTier;
  avg_fps?: string;
}

export interface User {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export interface UserHardware {
  id: number;
  user_id: number;
  mac_model?: string;
  chip?: string;
  ram_gb?: number;
  gpu_cores?: number;
  macos_version?: string;
  is_primary: boolean;
}

export interface CreateGameRequest {
  name: string;
  platform?: string;
  genre?: string;
  store_url?: string;
  steam_app_id?: string;
  cover_art_url?: string;
  tags?: string[];
}

export interface AddTestRequest {
  tested_at?: string;
  macos_version?: string;
  hardware?: string;
  wine_version?: string;
  crossover_version?: string;
  gptk_version?: string;
  launcher?: string;
  play_method?: "Native" | "CrossOver" | "Parallels" | "GPTK";
  translation_layer?: "D3DMetal" | "DXVK" | "DXMT" | "None";
  graphics_preset?: string;
  resolution?: string;
  status: CompatTier;
  fps?: string;
  notes?: string;
  issues?: {
    description: string;
    severity?: string;
    workaround?: string;
    resolved_by_version?: string;
    resolved?: boolean;
  }[];
}

export interface AuthRequest {
  email: string;
  password: string;
  display_name?: string;
}

export interface IngestRequest {
  text: string;
}

export interface IngestResult {
  game: Game;
  test: Test;
  issues?: Issue[];
}
