type WinkFactory = typeof import("wink-nlp").default;
type WinkInstance = ReturnType<WinkFactory>;

let _nlpPromise: Promise<WinkInstance> | null = null;
function getNLP(): Promise<WinkInstance> {
  if (!_nlpPromise) {
    _nlpPromise = Promise.all([
      import("wink-nlp"),
      import("wink-eng-lite-web-model"),
    ]).then(([winkModule, modelModule]) => winkModule.default(modelModule.default));
  }
  return _nlpPromise;
}

export type Intent =
  | "add_game"
  | "list_games"
  | "search_games"
  | "update_game"
  | "delete_game"
  | "add_test"
  | "get_game"
  | "get_stats"
  | "filter_by_tier"
  | "help"
  | "unknown";

export interface Entity {
  type: string;
  value: string;
}

export interface ParsedCommand {
  intent: Intent;
  gameName: string;
  entities: Entity[];
  raw: string;
}

// ── Mac-specific compatibility tiers ────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  // New Mac-specific tiers
  "native": "native_arm",
  "native arm": "native_arm",
  "apple silicon": "native_arm",
  "arm native": "native_arm",
  "universal": "native_arm",
  "runs natively": "native_arm",

  "rosetta": "rosetta2",
  "rosetta 2": "rosetta2",
  "rosetta2": "rosetta2",
  "intel binary": "rosetta2",
  "x86": "rosetta2",

  "crossover": "crossover_wine",
  "wine": "crossover_wine",
  "proton": "crossover_wine",
  "crossover wine": "crossover_wine",

  "gptk": "gptk",
  "game porting toolkit": "gptk",
  "porting toolkit": "gptk",
  "d3dmetal": "gptk",

  "playable": "playable",
  "works": "playable",
  "working": "playable",
  "perfectly": "playable",
  "flawless": "playable",
  "runs great": "playable",
  "runs well": "playable",
  "smooth": "playable",

  "issues": "issues",
  "partial": "issues",
  "partially": "issues",
  "with issues": "issues",
  "some issues": "issues",
  "stutters": "issues",
  "laggy": "issues",
  "glitchy": "issues",

  "unsupported": "unsupported",
  "broken": "unsupported",
  "doesn't run": "unsupported",
  "does not run": "unsupported",
  "crashes": "unsupported",
  "unplayable": "unsupported",
  "won't launch": "unsupported",
  "black screen": "unsupported",
};

const PLATFORMS = ["steam", "epic", "gog", "battlenet", "origin", "ubisoft", "itch", "humble", "app store", "setapp"];
const GENRES = ["rpg", "fps", "action", "adventure", "strategy", "simulation", "puzzle", "sports", "racing", "mmo", "moba", "rts", "survival", "horror", "platformer", "indie"];

const HARDWARE_PATTERNS = [
  // Ordered longest-first for greedy matching
  "m1 ultra", "m1 max", "m1 pro", "m1",
  "m2 ultra", "m2 max", "m2 pro", "m2",
  "m3 ultra", "m3 max", "m3 pro", "m3",
  "m4 ultra", "m4 max", "m4 pro", "m4",
  "m5 ultra", "m5 max", "m5 pro", "m5",
  "macbook pro", "macbook air", "macbook",
  "imac", "mac mini", "mac pro", "mac studio",
];

const MAC_MODELS = [
  "macbook pro 14", "macbook pro 16", "macbook pro 13",
  "macbook air 15", "macbook air 13",
  "mac mini", "mac studio", "mac pro", "imac 24",
];

function normalize(str: string): string {
  return str.toLowerCase().trim().replace(/['']/g, "'").replace(/\s+/g, " ");
}

// ── Intent Detection ────────────────────────────────────────────────
function findIntent(raw: string): Intent {
  const text = normalize(raw);
  
  // Stats / overview
  if (text.match(/\b(how many|count|stats?|numbers?|overview|summary)\b/)) return "get_stats";
  
  // Help
  if (text.match(/\b(help|what can you do|commands?|options?)\b/)) return "help";
  
  // Delete
  if (text.match(/\b(delete|remove|drop)\b/) && !text.match(/\b(test)\b/)) return "delete_game";
  
  // Update / edit
  if (text.match(/\b(update|change|set|mark|edit|modify)\b/)) return "update_game";
  
  // Filter by tier
  if (text.match(/\b(filter|show only|only show)\b.*\b(native|rosetta|gptk|playable|broken|unsupported|issues|crossover)\b/)) return "filter_by_tier";
  
  // Test report (most common)
  if (text.match(/\b(test|tested|ran|played|run|runs|works|working|crashes|broken|playable|doesn't run|gptk|rosetta|native|crossover)\b/)) return "add_test";
  
  // Search (dedicated)
  if (text.match(/\b(search|find|look for|looking for)\b/)) return "search_games";
  
  // List / browse
  if (text.match(/\b(list|show|display|browse|give me|all games)\b/)) return "list_games";
  
  // Game info
  if (text.match(/\b(about|info|detail|look up|tell me about|what is|how does .+ run)\b/)) return "get_game";
  
  // Add new game
  if (text.match(/\b(add|create|new|insert|submit)\b/)) return "add_game";

  return "unknown";
}

// ── Game Name Extraction ────────────────────────────────────────────
function extractGameName(raw: string): string {
  // Quoted names take priority
  const quoted = raw.match(/"([^"]+)"/);
  if (quoted) return quoted[1].trim();

  let text = raw;
  const lower = text.toLowerCase();

  // Strip leading intent verbs
  const intentVerbs = [
    "tell me about", "look up", "how does", "search for", "look for", "looking for", "find",
    "add", "create", "new", "insert", "submit",
    "update", "change", "set", "mark", "edit", "modify", "fix", "make",
    "delete", "remove", "drop", "erase", "clear",
    "test", "tested", "ran", "played", "tried", "launch", "run", "runs",
    "works", "working", "doesn't run", "does not run", "doesnt run",
    "crashes", "broken", "unplayable"
  ];

  for (const verb of intentVerbs) {
    if (lower.startsWith(verb + " ")) {
      text = text.substring(verb.length + 1);
      break;
    }
  }

  // Strip leading articles
  const articles = ["a ", "an ", "the ", "game ", "test for ", "report for "];
  for (const art of articles) {
    if (text.toLowerCase().startsWith(art)) {
      text = text.substring(art.length);
      break;
    }
  }

  // Stop at context words
  const stopWords = [
    " runs ", " run ", " works ", " doesn't run ", " does not run ", " doesnt run ",
    " crashes ", " is broken ", " broken ", " is playable ", " is native ",
    " on ", " in ", " to ", " as ", " for ", " with ", " at ", " via ",
    " using ", " through ", " and ", " or ", " but ", " that ",
    " this ", " these ", " those ", " please ", " into ", " onto ",
    " natively ", " under rosetta ", " under gptk ", " under crossover ",
    " status ", " rating ", " compatibility ",
  ];

  for (const stop of stopWords) {
    const idx = text.toLowerCase().indexOf(stop);
    if (idx !== -1) {
      text = text.substring(0, idx);
    }
  }

  return text.trim();
}

// ── Entity Extraction ───────────────────────────────────────────────
async function extractEntities(raw: string): Promise<Entity[]> {
  const entities: Entity[] = [];
  const text = normalize(raw);

  // Status / Tier — check longest patterns first
  const sortedStatusKeys = Object.keys(STATUS_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedStatusKeys) {
    if (text.includes(key)) {
      entities.push({ type: "status", value: STATUS_MAP[key] });
      break;
    }
  }

  // Platform
  for (const p of PLATFORMS) {
    if (text.includes(p)) {
      entities.push({ type: "platform", value: p });
      break;
    }
  }

  // Genre
  for (const g of GENRES) {
    if (new RegExp(`\\b${g}\\b`).test(text)) {
      entities.push({ type: "genre", value: g });
      break;
    }
  }

  // Hardware — match longest first (e.g. "m3 max" before "m3")
  for (const h of HARDWARE_PATTERNS) {
    if (text.includes(h)) {
      entities.push({ type: "hardware", value: h });
      break;
    }
  }

  // Mac model
  for (const m of MAC_MODELS) {
    if (text.includes(m)) {
      entities.push({ type: "mac_model", value: m });
      break;
    }
  }

  // RAM
  const ramMatch = raw.match(/(\d+)\s*(?:gb|gig)/i);
  if (ramMatch) {
    entities.push({ type: "ram_gb", value: ramMatch[1] });
  }

  // Resolution
  const resolutions = ["1080p", "1440p", "4k", "720p", "2160p", "5k", "6k", "8k"];
  for (const r of resolutions) {
    if (text.includes(r)) {
      entities.push({ type: "resolution", value: r });
      break;
    }
  }

  // FPS
  const fpsMatch = raw.match(/(\d+)\s*fps/i);
  if (fpsMatch) {
    entities.push({ type: "fps", value: fpsMatch[1] });
  }

  // Wine version
  const wineMatch = raw.match(/wine\s+([\d.]+)/i);
  if (wineMatch) {
    entities.push({ type: "wine_version", value: wineMatch[1] });
  }

  // CrossOver version
  const cxMatch = raw.match(/cross\s*over\s+([\d.]+)/i);
  if (cxMatch) {
    entities.push({ type: "crossover_version", value: cxMatch[1] });
  }

  // GPTK version
  const gptkMatch = raw.match(/gptk\s+([\d.]+)/i) || raw.match(/game\s+porting\s+toolkit\s+([\d.]+)/i);
  if (gptkMatch) {
    entities.push({ type: "gptk_version", value: gptkMatch[1] });
  }

  // macOS version (number or name)
  const macosMatch = raw.match(/mac\s*os\s+([\d.]+)/i);
  if (macosMatch) {
    entities.push({ type: "macos_version", value: macosMatch[1] });
  } else {
    const macVersionNames: Record<string, string> = {
      "tahoe": "26.0",
      "sequoia": "15.0",
      "sonoma": "14.0",
      "ventura": "13.0",
      "monterey": "12.0",
      "big sur": "11.0",
      "catalina": "10.15",
    };
    for (const [name, ver] of Object.entries(macVersionNames)) {
      if (text.includes(name)) {
        entities.push({ type: "macos_version", value: ver });
        break;
      }
    }
  }

  const nlp = await getNLP();
  const doc = nlp.readDoc(raw);
  // @ts-ignore - wink-nlp its.pos is valid at runtime
  const tokens = doc.tokens().out(nlp.its.pos) as string[];
  const words = doc.tokens().out() as string[];
  const nounPhrases: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'PROPN' || tokens[i] === 'NOUN') {
      nounPhrases.push(words[i]);
    }
  }
  if (nounPhrases.length > 0 && extractGameName(raw) === "") {
    entities.push({ type: "game_name", value: nounPhrases.join(" ") });
  }

  return deduplicate(entities);
}

function deduplicate(entities: Entity[]): Entity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.type}:${e.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function parseCommand(raw: string): Promise<ParsedCommand> {
  const intent = findIntent(raw);
  const gameName = extractGameName(raw);
  const entities = await extractEntities(raw);

  return { intent, gameName, entities, raw };
}
