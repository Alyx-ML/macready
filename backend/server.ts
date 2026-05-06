import { serve } from "bun";
import { getDB } from "./db.ts";
import { handleAgentCommand } from "./agent.ts";
import { join } from "path";
import { statSync, watch } from "fs";
import { createHash } from "crypto";

const PROJECT_DIR = process.argv[2] || process.cwd();
const BASE_PORT = parseInt(process.env.PORT || "8421");

const db = getDB(PROJECT_DIR);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, If-None-Match, If-Modified-Since",
};

const apiMemoryCache = new Map<string, { expiresAt: number; value: unknown }>();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

async function cacheValue<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const cached = apiMemoryCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as T;
  }
  const value = await load();
  apiMemoryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}

function jsonWithCache(req: Request, data: unknown, maxAgeSeconds = 300) {
  const body = JSON.stringify(data);
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  const lastModified = new Date().toUTCString();
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": `public, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds}`,
    "ETag": etag,
    "Last-Modified": lastModified,
    ...CORS,
  };
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { status: 200, headers });
}

const err = (msg: string, status = 400) => json({ success: false, message: msg }, status);

const REVIEW_LABELS: Record<number, string> = {
  0: "No user reviews",
  1: "Overwhelmingly Negative",
  2: "Very Negative",
  3: "Negative",
  4: "Mostly Negative",
  5: "Mixed",
  6: "Mostly Positive",
  7: "Positive",
  8: "Very Positive",
  9: "Overwhelmingly Positive",
};

type MacNewsCategory = "News" | "Reviews" | "CrossOver" | "App Store" | "Performance" | "Top Lists";

type MacNewsFeed = {
  source: string;
  url: string;
  category?: MacNewsCategory;
  include?: RegExp;
};

const MAC_NEWS_FEEDS: MacNewsFeed[] = [
  { source: "9to5Mac", url: "https://9to5mac.com/guides/mac/feed/" },
  { source: "MacRumors", url: "https://feeds.macrumors.com/MacRumors-All" },
  { source: "AppleInsider", url: "https://appleinsider.com/rss/news" },
  { source: "Apple Newsroom", url: "https://www.apple.com/newsroom/rss-feed.rss" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/apple" },
  { source: "The Verge", url: "https://www.theverge.com/rss/apple/index.xml" },
  { source: "CodeWeavers", url: "https://www.codeweavers.com/blog/?rss=1", category: "CrossOver" },
  { source: "Apple Developer", url: "https://developer.apple.com/news/releases/rss/releases.rss", category: "Performance", include: /\b(?:macOS\s+26|Tahoe)\b.{0,80}\b(beta|release candidate|RC|release notes|security update|released|available|update)\b/i },
];

const APP_STORE_CHARTS = [
  { source: "Apple App Store", url: "https://rss.applemarketingtools.com/api/v2/us/apps/top-free/12/apps.json", title: "Top Free Apps" },
  { source: "Apple App Store", url: "https://rss.applemarketingtools.com/api/v2/us/apps/top-paid/12/apps.json", title: "Top Paid Apps" },
];

const CROSSOVER_CHANGELOG_URL = "https://www.codeweavers.com/crossover/changelog?srsltid=AfmBOorPYli8YCpEdYHmbTEjgbAzDcmIfaeIXKkRoAY4iWSDz4jRQlo4";
const APPLE_DEVELOPER_BASE_URL = "https://developer.apple.com";
const MACOS_RELEASE_NOTES_COLLECTION_URL = `${APPLE_DEVELOPER_BASE_URL}/documentation/macos-release-notes`;
const MACOS_RELEASE_NOTES_COLLECTION_JSON_URL = `${APPLE_DEVELOPER_BASE_URL}/tutorials/data/documentation/macos-release-notes.json`;
const MACOS_RELEASE_NOTES_JSON_BASE_URL = `${APPLE_DEVELOPER_BASE_URL}/tutorials/data/documentation/macos-release-notes`;
const STEAM_SEARCH_INDEX_TERMS = [
  "half life", "portal", "counter strike", "left 4 dead", "team fortress",
  "baldur", "cyberpunk", "elden ring", "stardew", "terraria", "hades",
  "civilization", "total war", "resident evil", "final fantasy", "persona",
  "yakuza", "tekken", "street fighter", "monster hunter", "dark souls",
  "no mans sky", "subnautica", "rimworld", "factorio", "satisfactory",
  "cities skylines", "crusader kings", "hearts of iron", "stellaris",
  "disco elysium", "hollow knight", "celeste", "dead cells", "vampire survivors",
  "dave the diver", "palworld", "valheim", "warframe", "apex legends",
  "fallout", "doom", "quake", "bioshock", "tomb raider", "hitman",
  "witcher", "metro", "borderlands", "mass effect", "dragon age",
];

const MAC_NEWS_PATTERNS = [
  /\bmac\b/i,
  /\bmacos\b/i,
  /\bapple silicon\b/i,
  /\bmacbook\b/i,
  /\bimac\b/i,
  /\bmac mini\b/i,
  /\bmac studio\b/i,
  /\bcrossover\b/i,
  /\bcross over\b/i,
  /\bwine\b/i,
  /\bwhisky\b/i,
  /\bgame porting toolkit\b/i,
  /\bmetal\b/i,
  /\bsteam\b/i,
  /\bgaming\b/i,
  /\bgames?\b/i,
];

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripNewsHtml(value: string | undefined): string {
  if (!value) return "";
  return decodeXml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFeedTag(block: string, tag: string): string {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function extractFeedLink(block: string): string {
  const atomLink = block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/i);
  return extractFeedTag(block, "link") || (atomLink?.[1] ? decodeXml(atomLink[1]).trim() : "");
}

function extractFeedCategories(block: string): string[] {
  return Array.from(block.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi))
    .map((match) => decodeXml(match[1]).trim())
    .filter(Boolean);
}

function extractFeedImage(block: string): string {
  const mediaMatch = block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*\burl=["']([^"']+)["']/i);
  if (mediaMatch?.[1]) return decodeXml(mediaMatch[1]);
  const description = extractFeedTag(block, "description") || extractFeedTag(block, "summary") || extractFeedTag(block, "content:encoded") || extractFeedTag(block, "content");
  const imageMatch = description.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return imageMatch?.[1] ? decodeXml(imageMatch[1]) : "";
}

function categoryForNewsItem(title: string, summary: string, sourceCategories: string[]) {
  const text = `${title} ${summary} ${sourceCategories.join(" ")}`;
  const titleText = title.toLowerCase();
  if (
    /\bmacos\s+\d/.test(titleText) ||
    (/\bmacos\b/.test(titleText) && /\b(beta|public beta|developer beta|release candidate|rc|released|available|update|security update|release notes)\b/.test(titleText)) ||
    (/\btahoe\b/.test(titleText) && /\b(beta|public beta|developer beta|release candidate|rc|released|available|update)\b/.test(titleText))
  ) return "Performance";
  const normalizedText = text.toLowerCase();
  if (/\b(review|hands-on|tested|benchmarked)\b/.test(normalizedText)) return "Reviews";
  if (/\b(crossover|codeweavers|whisky|game porting toolkit)\b/.test(normalizedText) || /\bwine\b/.test(normalizedText)) return "CrossOver";
  if (/\b(top|best|roundup|list)\b/.test(normalizedText)) return "Top Lists";
  if (/\b(app store|apple arcade|store release|store update)\b/.test(normalizedText)) return "App Store";
  return "News";
}

function parseMacNewsFeed(xml: string, feed: MacNewsFeed) {
  const blocks = [
    ...Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).map((match) => match[0]),
    ...Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)).map((match) => match[0]),
  ];

  return blocks.map((block) => {
    const title = extractFeedTag(block, "title");
    const url = extractFeedLink(block) || extractFeedTag(block, "guid") || extractFeedTag(block, "id");
    const rawDescription = extractFeedTag(block, "description") || extractFeedTag(block, "summary") || extractFeedTag(block, "content:encoded") || extractFeedTag(block, "content");
    const rawContent = extractFeedTag(block, "content:encoded") || extractFeedTag(block, "content") || rawDescription;
    const summary = stripNewsHtml(rawDescription);
    const content = stripNewsHtml(rawContent);
    const categories = extractFeedCategories(block);
    const publishedAt = extractFeedTag(block, "pubDate") || extractFeedTag(block, "dc:date") || extractFeedTag(block, "published") || extractFeedTag(block, "updated");
    const imageUrl = extractFeedImage(block);
    const category = feed.category || categoryForNewsItem(title, summary, categories);
    const id = `${feed.source}:${url || title}`;

    return {
      id,
      title,
      url,
      source: feed.source,
      category,
      published_at: publishedAt ? new Date(publishedAt).toISOString() : "",
      summary: summary.length > 220 ? `${summary.slice(0, 217).trim()}...` : summary,
      content: content.length > 1800 ? `${content.slice(0, 1797).trim()}...` : content,
      image_url: imageUrl,
    };
  }).filter((item) => {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    const titleText = item.title.toLowerCase();
    if (!item.title || !item.url) return false;
    if (feed.include) return feed.include.test(text);
    if (feed.category) return true;
    if (/\b(iphones?|ipads?|airpods|apple watch|vision pro)\b/i.test(titleText)) return false;
    return MAC_NEWS_PATTERNS.some((pattern) => pattern.test(text));
  });
}

function parseAppleAppChart(payload: any, chartTitle: string) {
  const updated = payload?.feed?.updated ? new Date(payload.feed.updated).toISOString() : new Date().toISOString();
  return (payload?.feed?.results || []).map((app: any, index: number) => {
    const name = String(app.name || "").trim();
    const maker = String(app.artistName || "").trim();
    const url = String(app.url || "").trim();
    const chartRank = index + 1;
    const genres = Array.isArray(app.genres) ? app.genres.map((genre: any) => genre?.name).filter(Boolean) : [];
    const kind = String(app.kind || "").trim();
    const releaseDate = String(app.releaseDate || "").trim();
    const advisory = String(app.contentAdvisoryRating || "").trim();
    const appId = String(app.id || "").trim();
    const artistUrl = String(app.artistUrl || "").trim();
    const artwork = String(app.artworkUrl100 || "").replace(/\/100x100bb\.(png|jpg|jpeg)$/i, "/512x512bb.$1");
    const genreText = genres.length > 0 ? ` It is listed under ${genres.slice(0, 3).join(", ")}.` : "";
    const summary = maker
      ? `${name} by ${maker} is #${chartRank} on Apple's ${chartTitle.toLowerCase()} chart.${genreText}`
      : `${name} is #${chartRank} on Apple's ${chartTitle.toLowerCase()} chart.${genreText}`;

    return {
      id: `Apple App Store:${chartTitle}:${app.id || url || name}`,
      title: `${chartRank}. ${name}`,
      url,
      source: "Apple App Store",
      category: "App Store" as MacNewsCategory,
      published_at: updated,
      summary,
      content: summary,
      image_url: artwork,
      metadata: {
        maker,
        chartTitle,
        chartRank,
        genres,
        kind,
        releaseDate,
        advisory,
        appId,
        artistUrl,
      },
    };
  }).filter((item: any) => item.title && item.url);
}

function parseAppleAppLookup(payload: any) {
  const app = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!app) return null;

  const genres = Array.isArray(app.genres) ? app.genres.filter(Boolean) : [];
  const screenshotUrls = Array.isArray(app.screenshotUrls) ? app.screenshotUrls.filter(Boolean) : [];
  const ipadScreenshotUrls = Array.isArray(app.ipadScreenshotUrls) ? app.ipadScreenshotUrls.filter(Boolean) : [];
  const languageCodesISO2A = Array.isArray(app.languageCodesISO2A) ? app.languageCodesISO2A.filter(Boolean) : [];
  const supportedDevices = Array.isArray(app.supportedDevices) ? app.supportedDevices.filter(Boolean) : [];
  const advisories = Array.isArray(app.advisories) ? app.advisories.filter(Boolean) : [];

  return {
    appId: String(app.trackId || ""),
    title: String(app.trackName || ""),
    url: String(app.trackViewUrl || ""),
    image_url: String(app.artworkUrl512 || app.artworkUrl100 || ""),
    metadata: {
      maker: String(app.artistName || ""),
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
      screenshotUrls,
      ipadScreenshotUrls,
      languageCodesISO2A,
      supportedDevices,
      advisories,
      artistUrl: String(app.artistViewUrl || ""),
    },
  };
}

function parseAppleAppSearchResult(app: any, index: number, searchTerm: string) {
  const details = parseAppleAppLookup({ results: [app] });
  if (!details?.appId || !details.title || !details.url) return null;

  const maker = details.metadata.maker || "";
  const genres = details.metadata.genres || [];
  const genreText = genres.length > 0 ? ` It is listed under ${genres.slice(0, 3).join(", ")}.` : "";
  const summary = maker
    ? `${details.title} by ${maker} matched "${searchTerm}" on the Mac App Store.${genreText}`
    : `${details.title} matched "${searchTerm}" on the Mac App Store.${genreText}`;

  return {
    id: `Apple App Store Search:${details.appId}:${index}`,
    title: details.title,
    url: details.url,
    source: "Apple App Store",
    category: "App Store" as MacNewsCategory,
    published_at: details.metadata.currentVersionReleaseDate || details.metadata.releaseDate || new Date().toISOString(),
    summary,
    content: summary,
    image_url: details.image_url,
    metadata: {
      ...details.metadata,
      appId: details.appId,
      chartTitle: "Mac App Store Search",
    },
  };
}

function parseCodeWeaversChangelog(html: string) {
  const parseChangelogSections = (releaseHtml: string) => {
    const sections = Array.from(releaseHtml.matchAll(/<li>\s*<span[^>]*class=["']subtitle["'][^>]*>([^<]+)<\/span>\s*<ul>([\s\S]*?)<\/ul>\s*<\/li>/gi))
      .map((sectionMatch) => {
        const title = stripNewsHtml(sectionMatch[1]).replace(/:$/, "");
        const items = Array.from(sectionMatch[2].matchAll(/<li>([\s\S]*?)<\/li>/gi))
          .map((itemMatch) => stripNewsHtml(itemMatch[1]))
          .filter(Boolean)
          .map((text) => ({ kind: "listItem" as const, text }));
        return { title, items };
      })
      .filter((section) => section.title && section.items.length > 0);

    if (sections.length > 0) return sections;

    const items = Array.from(releaseHtml.matchAll(/<li>([\s\S]*?)<\/li>/gi))
      .map((itemMatch) => stripNewsHtml(itemMatch[1]))
      .filter(Boolean)
      .map((text) => ({ kind: "listItem" as const, text }));

    return items.length > 0 ? [{ title: "Changes", items }] : [];
  };

  const entries = Array.from(html.matchAll(/<a\s+name=["']([\d.]+)["']><\/a>\s*<span[^>]*>\s*<b>([\d.]+)<\/b>\s*CrossOver\s*-\s*([^<]+)<\/span>([\s\S]*?)(?=<a\s+name=["'][\d.]+["']><\/a>|$)/gi))
    .slice(0, 8)
    .map((releaseMatch) => {
      const version = releaseMatch[2].trim();
      const dateText = releaseMatch[3].trim();
      const releaseHtml = releaseMatch[4];
      const notes = stripNewsHtml(releaseHtml);
      const changelogSections = parseChangelogSections(releaseHtml);
      const title = `CrossOver ${version} - ${dateText}`;
      const published = new Date(dateText).toISOString();
      const summary = notes.length > 260 ? `${notes.slice(0, 257).trim()}...` : notes;

      return {
        id: `CodeWeavers Changelog:${title}`,
        title,
        url: CROSSOVER_CHANGELOG_URL,
        source: "CodeWeavers Changelog",
        category: "CrossOver" as MacNewsCategory,
        published_at: published,
        summary,
        content: notes.length > 1800 ? `${notes.slice(0, 1797).trim()}...` : notes,
        image_url: "https://media.codeweavers.com/pub/crossover/website/images/og-images/changelog_og_1200x630.png",
        metadata: {
          changelogSections,
          version,
          product: "CrossOver",
          releaseDate: dateText,
        },
      };
    });

  if (entries.length > 0) return entries;

  const text = stripNewsHtml(html);
  return Array.from(text.matchAll(/(\d+(?:\.\d+)+\s+CrossOver\s+-\s+[A-Za-z]+\s+\d{1,2},\s+\d{4})([\s\S]*?)(?=\d+(?:\.\d+)+\s+CrossOver\s+-\s+[A-Za-z]+\s+\d{1,2},\s+\d{4}|$)/gi))
    .slice(0, 8)
    .map((match) => {
      const rawTitle = match[1].trim();
      const content = match[2].replace(/\s+/g, " ").trim();
      const dateMatch = rawTitle.match(/([A-Za-z]+\s+\d{1,2},\s+\d{4})$/);
      const published = dateMatch ? new Date(dateMatch[1]).toISOString() : new Date().toISOString();
      const summary = content.length > 260 ? `${content.slice(0, 257).trim()}...` : content;

      return {
        id: `CodeWeavers Changelog:${rawTitle}`,
        title: rawTitle.replace(/^(\d+(?:\.\d+)+)\s+CrossOver/i, "Crossover $1"),
        url: CROSSOVER_CHANGELOG_URL,
        source: "CodeWeavers Changelog",
        category: "CrossOver" as MacNewsCategory,
        published_at: published,
        summary,
        content: content.length > 1800 ? `${content.slice(0, 1797).trim()}...` : content,
        image_url: "",
        metadata: {
          changelogSections: [{ title: "Changes", items: content ? [{ kind: "paragraph" as const, text: content }] : [] }],
          product: "CrossOver",
        },
      };
    });
}

function appleInlineText(inlineContent: any[] | undefined, references: Record<string, any>) {
  return (inlineContent || []).map((part) => {
    if (part?.type === "text") return String(part.text || "");
    if (part?.type === "codeVoice") return String(part.code || "");
    if (part?.type === "reference") {
      const reference = references?.[part.identifier];
      return String(reference?.title || reference?.titleInlineContent?.[0]?.text || "");
    }
    return "";
  }).join("").replace(/\s+/g, " ").trim();
}

function appleBlockText(block: any, references: Record<string, any>): string[] {
  if (!block) return [];
  if (block.type === "paragraph") {
    const text = appleInlineText(block.inlineContent, references);
    return text ? [text] : [];
  }
  if (block.type === "unorderedList") {
    return (block.items || []).flatMap((item: any) =>
      (item.content || []).flatMap((child: any) => appleBlockText(child, references))
    ).filter(Boolean);
  }
  return [];
}

function releaseNotesSlugFromIdentifier(identifier: string) {
  return identifier.split("/").pop() || "";
}

function releaseNotesUrlFromSlug(slug: string) {
  return `${APPLE_DEVELOPER_BASE_URL}/documentation/macos-release-notes/${slug}`;
}

function releaseNotesJsonUrlFromSlug(slug: string) {
  return `${MACOS_RELEASE_NOTES_JSON_BASE_URL}/${slug}.json`;
}

function releaseVersionSortValue(identifier: string) {
  const slug = releaseNotesSlugFromIdentifier(identifier);
  const match = slug.match(/macos-26(?:_(\d+))?-release-notes/i);
  return match ? Number(match[1] || 0) : -1;
}

function latestTahoeReleaseNote(collection: any) {
  const section = (collection?.topicSections || []).find((topic: any) =>
    topic?.title === "macOS 26" || topic?.anchor === "macOS-26"
  );
  const identifiers = Array.isArray(section?.identifiers) ? section.identifiers : [];
  return identifiers
    .filter((identifier: string) => /\/macos-26(?:_\d+)?-release-notes$/i.test(identifier))
    .sort((a: string, b: string) => releaseVersionSortValue(b) - releaseVersionSortValue(a))[0] || "";
}

function parseAppleMacOSReleaseNotes(doc: any, slug: string) {
  const references = doc?.references || {};
  const title = String(doc?.metadata?.title || "macOS Tahoe Release Notes").trim();
  const url = releaseNotesUrlFromSlug(slug);
  const abstract = appleInlineText(doc?.abstract, references);
  const contentBlocks = (doc?.primaryContentSections || []).flatMap((section: any) => section?.content || []);
  const sections: { title: string; level: number; items: { kind: "paragraph" | "listItem" | "heading"; text: string; level?: number }[] }[] = [];
  let currentSection: { title: string; level: number; items: { kind: "paragraph" | "listItem" | "heading"; text: string; level?: number }[] } | null = null;

  for (const block of contentBlocks) {
    if (block?.type === "heading") {
      const heading = String(block.text || "").trim();
      if (!heading) continue;
      if (block.level <= 3 || !currentSection) {
        currentSection = { title: heading, level: Number(block.level || 2), items: [] };
        sections.push(currentSection);
      } else {
        currentSection.items.push({ kind: "heading", text: heading, level: Number(block.level || 4) });
      }
      continue;
    }

    if (!currentSection) {
      currentSection = { title: "Overview", level: 2, items: [] };
      sections.push(currentSection);
    }

    if (block?.type === "paragraph") {
      const text = appleInlineText(block.inlineContent, references);
      if (text) currentSection.items.push({ kind: "paragraph", text });
      continue;
    }

    if (block?.type === "unorderedList") {
      const items = appleBlockText(block, references);
      for (const text of items) {
        currentSection.items.push({ kind: "listItem", text });
      }
    }
  }

  const releaseNotesSections = sections.filter((section) => section.items.length > 0);
  const content = releaseNotesSections.flatMap((section) => [
    section.title,
    ...section.items.map((item) => item.kind === "listItem" ? `- ${item.text}` : item.text)
  ]).join("\n\n");
  const summarySource = abstract || releaseNotesSections[0]?.items.find((item) => item.text)?.text || title;
  const version = title.match(/\b26(?:\.\d+)?\b/)?.[0] || "26";

  return [{
    id: `Apple Developer:${url}`,
    title,
    url,
    source: "Apple Developer",
    category: "Performance" as MacNewsCategory,
    published_at: new Date().toISOString(),
    summary: summarySource.length > 320 ? `${summarySource.slice(0, 317).trim()}...` : summarySource,
    content,
    image_url: "",
    metadata: {
      releaseNotesSections,
      releaseNotesUrl: url,
      collectionUrl: MACOS_RELEASE_NOTES_COLLECTION_URL,
      osName: "macOS Tahoe",
      version,
    },
  }];
}

// ── Tier ranking for aggregate computation ──────────────────────────
const TIER_RANK: Record<string, number> = {
  native_arm: 7,
  rosetta2: 6,
  playable: 5,
  gptk: 4,
  crossover_wine: 3,
  issues: 2,
  unsupported: 1,
  // Legacy
  working: 5,
  partial: 3,
  broken: 1,
  "needs-workaround": 2,
};

function computeAggregateTier(tests: any[]): { tier: string; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  for (const t of tests) {
    breakdown[t.status] = (breakdown[t.status] || 0) + 1;
  }
  if (tests.length === 0) return { tier: "unsupported", breakdown };

  // Weighted average of tier ranks
  let totalWeight = 0;
  let weightedSum = 0;
  for (const t of tests) {
    const rank = TIER_RANK[t.status] || 1;
    totalWeight += 1;
    weightedSum += rank;
  }
  const avg = weightedSum / totalWeight;

  // Map average back to closest tier
  if (avg >= 6.5) return { tier: "native_arm", breakdown };
  if (avg >= 5.5) return { tier: "rosetta2", breakdown };
  if (avg >= 4.5) return { tier: "playable", breakdown };
  if (avg >= 3.5) return { tier: "gptk", breakdown };
  if (avg >= 2.5) return { tier: "crossover_wine", breakdown };
  if (avg >= 1.5) return { tier: "issues", breakdown };
  return { tier: "unsupported", breakdown };
}

function buildBenchmarkSummary(gameId: number) {
  const rows = db.query(`
    SELECT status, fps, hardware, play_method, translation_layer, graphics_preset, resolution
    FROM tests
    WHERE game_id = ?
    ORDER BY tested_at DESC
  `).all(gameId) as any[];
  if (rows.length === 0) return null;

  const aggregate = computeAggregateTier(rows);
  const methodCounts = new Map<string, number>();
  const numericFps: number[] = [];

  for (const row of rows) {
    if (row.play_method) methodCounts.set(row.play_method, (methodCounts.get(row.play_method) || 0) + 1);
    const fps = String(row.fps || "").match(/\d+(?:\.\d+)?/)?.[0];
    if (fps) numericFps.push(Number(fps));
  }

  const method = Array.from(methodCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || rows[0]?.play_method || "";
  const avgFps = numericFps.length > 0
    ? `${Math.round(numericFps.reduce((sum, value) => sum + value, 0) / numericFps.length)} FPS`
    : rows.find((row) => row.fps)?.fps || "";

  return {
    total_reports: rows.length,
    best_status: aggregate.tier,
    method,
    avg_fps: avgFps,
    hardware: rows[0]?.hardware || "",
  };
}

// ── Auth helpers ────────────────────────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "macgamedb-salt-2024");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function getSessionUser(req: Request): any {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const session = db.query(`SELECT * FROM sessions WHERE id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))`).get(token) as any;
  if (!session) return null;
  return db.query(`SELECT id, email, display_name, created_at FROM users WHERE id = ?`).get(session.user_id);
}

// ── Steam cover art helper ──────────────────────────────────────────
function getSteamCoverUrl(steamAppId: string | null): string | null {
  if (!steamAppId) return null;
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`;
}

function stripSteamHtml(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSteamDescriptionVideos(value: string | undefined) {
  if (!value) return [];
  const videos: any[] = [];
  const videoBlocks = value.match(/<video[\s\S]*?<\/video>/gi) || [];
  for (let i = 0; i < videoBlocks.length; i += 1) {
    const block = videoBlocks[i];
    const poster = block.match(/poster="([^"]+)"/i)?.[1] || "";
    const webm = block.match(/<source[^>]+src="([^"]+)"[^>]+type="video\/webm[^"]*"/i)?.[1] || "";
    const mp4 = block.match(/<source[^>]+src="([^"]+)"[^>]+type="video\/mp4[^"]*"/i)?.[1] || "";
    if (webm || mp4) {
      videos.push({ id: i, name: "Gameplay", thumbnail: poster, webm, mp4 });
    }
  }
  return videos;
}

const CROSSOVER_PLAYABLE_STEAM_IDS = new Set([
  "1091500", // Cyberpunk 2077
]);

async function getSteamMetadata(steamAppId: string | null): Promise<any | null> {
  if (!steamAppId) return null;
  return cacheValue(`steam:metadata:${steamAppId}`, 6 * 60 * 60_000, async () => {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(steamAppId)}&l=english&cc=US`);
    if (!res.ok) return null;
    const payload = await res.json() as any;
    const entry = payload?.[steamAppId];
    if (!entry?.success || !entry.data) return null;
    const data = entry.data;
    const macNative = Boolean(data.platforms?.mac);
    const crossoverPlayable = CROSSOVER_PLAYABLE_STEAM_IDS.has(steamAppId);
    const compatibilityTier = macNative ? "native_arm" : crossoverPlayable ? "playable" : "unsupported";
    const compatibilityReasons = [
      macNative ? "Native Mac version listed on Steam" : null,
      crossoverPlayable ? "Known CrossOver playable title" : null,
    ].filter(Boolean);

    return {
      steam_app_id: steamAppId,
      description: data.short_description || "",
      detailed_description: data.detailed_description || "",
      genres: (data.genres || []).map((g: any) => g.description).filter(Boolean),
      categories: (data.categories || []).map((c: any) => c.description).filter(Boolean),
      developers: data.developers || [],
      publishers: data.publishers || [],
      release_date: data.release_date?.date || "",
      website: data.website || "",
      is_free: Boolean(data.is_free),
      price_overview: data.price_overview ? {
        currency: data.price_overview.currency || "",
        initial: data.price_overview.initial || 0,
        final: data.price_overview.final || 0,
        discount_percent: data.price_overview.discount_percent || 0,
        initial_formatted: data.price_overview.initial_formatted || "",
        final_formatted: data.price_overview.final_formatted || "",
      } : null,
      store_url: `https://store.steampowered.com/app/${steamAppId}`,
      header_image: data.header_image || getSteamCoverUrl(steamAppId),
      capsule_image: data.capsule_image || data.header_image || getSteamCoverUrl(steamAppId),
      background: data.background_raw || data.background || "",
      movies: [
        ...(data.movies || []).map((movie: any) => ({
        id: movie.id,
        name: movie.name,
        thumbnail: movie.thumbnail || "",
        webm: movie.webm?.max || movie.webm?.["480"] || "",
        mp4: movie.mp4?.max || movie.mp4?.["480"] || "",
        })),
        ...extractSteamDescriptionVideos(data.detailed_description),
      ].filter((movie: any, index: number, all: any[]) => (movie.mp4 || movie.webm) && all.findIndex((item) => item.mp4 === movie.mp4 && item.webm === movie.webm) === index),
      screenshots: (data.screenshots || []).map((shot: any) => ({
        id: shot.id,
        thumbnail: shot.path_thumbnail || "",
        full: shot.path_full || "",
      })).filter((shot: any) => shot.full),
      requirements: {
        pc: {
          minimum: stripSteamHtml(data.pc_requirements?.minimum),
          recommended: stripSteamHtml(data.pc_requirements?.recommended),
        },
        mac: {
          minimum: stripSteamHtml(data.mac_requirements?.minimum),
          recommended: stripSteamHtml(data.mac_requirements?.recommended),
        },
      },
      platforms: data.platforms || {},
      mac_native: macNative,
      crossover_playable: crossoverPlayable,
      compatibility_tier: compatibilityTier,
      compatibility_label: macNative || crossoverPlayable ? "Playable" : "Unrated",
      compatibility_reasons: compatibilityReasons,
    };
  });
}

async function getSteamReviewSummary(steamAppId: string | null): Promise<any | null> {
  if (!steamAppId) return null;
  return cacheValue(`steam:reviews:${steamAppId}`, 6 * 60 * 60_000, async () => {
    const res = await fetch(`https://store.steampowered.com/appreviews/${encodeURIComponent(steamAppId)}?json=1&language=all&purchase_type=all&filter=summary`);
    if (!res.ok) return null;
    const payload = await res.json() as any;
    const summary = payload?.query_summary;
    if (!summary) return null;
    const score = Number(summary.review_score) || 0;
    return {
      steam_app_id: steamAppId,
      review_score: score,
      review_score_desc: summary.review_score_desc || REVIEW_LABELS[score] || "No user reviews",
      total_positive: Number(summary.total_positive) || 0,
      total_negative: Number(summary.total_negative) || 0,
      total_reviews: Number(summary.total_reviews) || 0,
    };
  });
}

function statusMatches(requested: string, tier: string) {
  if (!requested) return true;
  if (requested === "playable") {
    return ["native_arm", "rosetta2", "playable", "crossover_wine", "gptk", "working"].includes(tier);
  }
  return requested === tier;
}

function normalizeSteamCatalogText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}

function shouldHideSteamCatalogName(name: string) {
  const haystack = normalizeSteamCatalogText(name);
  if (!haystack || haystack.length < 2) return true;
  const tokens = new Set(haystack.split(/\s+/).filter(Boolean));
  const blockedNames = new Set(["steam controller", "steam deck", "steam link"]);
  const blockedTerms = [
    "ahegao", "bdsm", "boobs", "breast", "brothel", "busty",
    "ecchi", "eroge", "erotic", "femboy", "futa", "futanari",
    "harem", "hentai", "incest", "lewd", "milf", "nsfw",
    "nude", "nudity", "porn", "pornographic", "seduce", "sex",
    "sexual", "sexy", "succubus", "tentacle", "waifu", "yuri",
    "soundtrack", "dedicated server", "playtest", "trailer", "demo",
  ];
  const blockedPhrases = [
    "steam deck", "steam controller", "docking station", "erotic visual novel",
    "sexual content", "adult only", "ai generated", "ai girlfriend",
  ];
  return blockedNames.has(haystack) || blockedTerms.some((term) => tokens.has(term)) || blockedPhrases.some((phrase) => haystack.includes(phrase));
}

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  // ── AUTH: Register ────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/auth/register") {
    const body = await req.json() as any;
    if (!body.email || !body.password || !body.display_name) return err("Email, password, and display name required");
    try {
      const hash = await hashPassword(body.password);
      db.query(`INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)`).run(body.email, hash, body.display_name);
      const user = db.query(`SELECT id, email, display_name, created_at FROM users WHERE id = last_insert_rowid()`).get() as any;
      const sessionId = crypto.randomUUID();
      db.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))`).run(sessionId, user.id);
      return json({ user, token: sessionId }, 201);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) return err("Email already registered", 409);
      return err(e.message, 500);
    }
  }

  // ── AUTH: Login ───────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/auth/login") {
    const body = await req.json() as any;
    if (!body.email || !body.password) return err("Email and password required");
    const hash = await hashPassword(body.password);
    const user = db.query(`SELECT id, email, display_name, created_at FROM users WHERE email = ? AND password_hash = ?`).get(body.email, hash) as any;
    if (!user) return err("Invalid credentials", 401);
    const sessionId = crypto.randomUUID();
    db.query(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))`).run(sessionId, user.id);
    return json({ user, token: sessionId });
  }

  // ── AUTH: Me ──────────────────────────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/auth/me") {
    const user = getSessionUser(req);
    if (!user) return err("Not authenticated", 401);
    const hardware = db.query(`SELECT * FROM user_hardware WHERE user_id = ? ORDER BY is_primary DESC`).all(user.id);
    return json({ user, hardware });
  }

  // ── AUTH: Logout ──────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/auth/logout") {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      db.query(`DELETE FROM sessions WHERE id = ?`).run(authHeader.slice(7));
    }
    return json({ success: true });
  }

  // ── User Hardware ─────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/users/hardware") {
    const user = getSessionUser(req);
    if (!user) return err("Not authenticated", 401);
    const body = await req.json() as any;
    // Set all existing as non-primary if this is primary
    if (body.is_primary) {
      db.query(`UPDATE user_hardware SET is_primary = 0 WHERE user_id = ?`).run(user.id);
    }
    db.query(`INSERT INTO user_hardware (user_id, mac_model, chip, ram_gb, gpu_cores, macos_version, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      user.id, body.mac_model || null, body.chip || null, body.ram_gb || null, body.gpu_cores || null, body.macos_version || null, body.is_primary ? 1 : 0
    );
    return json({ success: true }, 201);
  }

  if (method === "GET" && path === "/api/v1/gamedb/users/hardware") {
    const user = getSessionUser(req);
    if (!user) return err("Not authenticated", 401);
    const hardware = db.query(`SELECT * FROM user_hardware WHERE user_id = ? ORDER BY is_primary DESC`).all(user.id);
    return json({ hardware });
  }

  const hardwareMatch = path.match(/^\/api\/v1\/gamedb\/users\/hardware\/(\d+)$/);
  if (method === "DELETE" && hardwareMatch) {
    const user = getSessionUser(req);
    if (!user) return err("Not authenticated", 401);
    const hardwareId = parseInt(hardwareMatch[1]);
    db.query(`DELETE FROM user_hardware WHERE id = ? AND user_id = ?`).run(hardwareId, user.id);
    return json({ success: true });
  }

  // ── GET /api/v1/gamedb/games ──────────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/games") {
    const search = url.searchParams.get("search") || "";
    const status = url.searchParams.get("status") || "";
    const wine   = url.searchParams.get("wine_version") || "";
    const macos  = url.searchParams.get("macos_version") || "";
    const hw     = url.searchParams.get("hardware") || "";
    const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
    const requestedLimit = Number(url.searchParams.get("limit")) || 0;
    const limit = requestedLimit > 0 ? Math.min(requestedLimit, 100) : 0;

    let sql = `SELECT DISTINCT g.* FROM games g
               LEFT JOIN tests t ON t.game_id = g.id
               LEFT JOIN game_tags gt ON gt.game_id = g.id
               LEFT JOIN tags tg ON tg.id = gt.tag_id
               WHERE 1=1`;
    const args: any[] = [];

    if (search) { sql += ` AND (g.name LIKE ? OR g.genre LIKE ? OR g.platform LIKE ? OR tg.name LIKE ?)`; const s = `%${search}%`; args.push(s, s, s, s); }
    if (status) {
      if (status === "playable") {
        sql += ` AND t.status IN ('native_arm','rosetta2','playable','crossover_wine','gptk','working')`;
      } else if (status === "native_arm") {
        sql += ` AND (t.status = 'native_arm' OR g.platform LIKE '%Mac%')`;
      } else {
        sql += ` AND t.status = ?`;
        args.push(status);
      }
    }
    if (wine)   { sql += ` AND t.wine_version = ?`; args.push(wine); }
    if (macos)  { sql += ` AND t.macos_version = ?`; args.push(macos); }
    if (hw)     { sql += ` AND t.hardware LIKE ?`; args.push(`${hw}%`); }
    sql += ` ORDER BY g.name COLLATE NOCASE`;
    if (limit > 0) {
      sql += ` LIMIT ? OFFSET ?`;
      args.push(limit + 1, cursor);
    }

    try {
      const rows = db.query(sql).all(...args) as any[];
      const hasMore = limit > 0 && rows.length > limit;
      const games = hasMore ? rows.slice(0, limit) : rows;
      for (const g of games) {
        // Latest test
        const lt = db.query(`SELECT * FROM tests WHERE game_id = ? ORDER BY tested_at DESC LIMIT 1`).get(g.id) as any;
        if (lt) { lt.issues = db.query(`SELECT * FROM issues WHERE test_id = ?`).all(lt.id); g.latest_test = lt; }
        // Tags
        const tags = db.query(`SELECT t.name FROM tags t JOIN game_tags gt ON gt.tag_id = t.id WHERE gt.game_id = ?`).all(g.id) as any[];
        g.tags = tags.map((t: any) => t.name);
        // Test count
        const countRow = db.query(`SELECT COUNT(*) as n FROM tests WHERE game_id = ?`).get(g.id) as any;
        g.test_count = countRow?.n || 0;
        // Aggregate tier
        if (g.test_count > 0) {
          const allTests = db.query(`SELECT status FROM tests WHERE game_id = ?`).all(g.id) as any[];
          g.aggregate_tier = computeAggregateTier(allTests).tier;
        }
        g.benchmark_summary = buildBenchmarkSummary(g.id);
        // Cover art fallback
        if (!g.cover_art_url && g.steam_app_id) {
          g.cover_art_url = getSteamCoverUrl(g.steam_app_id);
        }
      }
      return jsonWithCache(req, { games, nextCursor: hasMore ? cursor + limit : null }, 300);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── POST /api/v1/gamedb/games ─────────────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/games") {
    const body = await req.json() as any;
    try {
      const steamMetadata = body.steam_app_id ? await getSteamMetadata(body.steam_app_id) : null;
      const coverUrl = body.cover_art_url || steamMetadata?.header_image || getSteamCoverUrl(body.steam_app_id) || null;
      db.query(`INSERT INTO games (name, platform, genre, store_url, steam_app_id, cover_art_url) VALUES (?, ?, ?, ?, ?, ?)`).run(
        body.name,
        body.platform || (steamMetadata?.mac_native ? "Steam, Mac" : "Steam") || null,
        body.genre || steamMetadata?.genres?.slice(0, 3).join(", ") || null,
        body.store_url || steamMetadata?.store_url || null,
        body.steam_app_id || null,
        coverUrl
      );
      const g = db.query(`SELECT * FROM games WHERE id = last_insert_rowid()`).get() as any;
      if (body.tags?.length) {
        for (const tag of body.tags) {
          db.query(`INSERT OR IGNORE INTO tags (name) VALUES (?)`).run(tag);
          const t = db.query(`SELECT id FROM tags WHERE name = ?`).get(tag) as any;
          db.query(`INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?, ?)`).run(g.id, t.id);
        }
      }
      return json({ id: g.id }, 201);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── /api/v1/gamedb/games/:id ──────────────────────────────────────
  const gameMatch = path.match(/^\/api\/v1\/gamedb\/games\/(\d+)$/);
  if (gameMatch) {
    const id = parseInt(gameMatch[1]);
    if (method === "GET") {
      const g = db.query(`SELECT * FROM games WHERE id = ?`).get(id) as any;
      if (!g) return err("Not found", 404);
      
      const tests = db.query(`
        SELECT t.*, u.display_name as user_display_name 
        FROM tests t 
        LEFT JOIN users u ON u.id = t.user_id
        WHERE t.game_id = ? 
        ORDER BY t.tested_at DESC
      `).all(id) as any[];
      
      for (const t of tests) t.issues = db.query(`SELECT * FROM issues WHERE test_id = ?`).all(t.id);
      
      const tags = db.query(`SELECT t.name FROM tags t JOIN game_tags gt ON gt.tag_id = t.id WHERE gt.game_id = ?`).all(id) as any[];
      g.tags = tags.map((t: any) => t.name);
      
      if (!g.cover_art_url && g.steam_app_id) {
        g.cover_art_url = getSteamCoverUrl(g.steam_app_id);
      }

      const steamMetadata = g.steam_app_id ? await getSteamMetadata(g.steam_app_id) : null;
      if (steamMetadata) {
        g.cover_art_url = g.cover_art_url || steamMetadata.header_image;
        g.genre = g.genre || steamMetadata.genres?.slice(0, 3).join(", ");
        g.store_url = g.store_url || steamMetadata.store_url;
      }

      // Aggregate rating
      const aggregate = computeAggregateTier(tests);
      
      // Hardware matrix
      const hwRows = db.query(`
        SELECT hardware, status, fps, COUNT(*) as cnt 
        FROM tests WHERE game_id = ? AND hardware IS NOT NULL AND hardware != ''
        GROUP BY hardware, status
        ORDER BY hardware
      `).all(id) as any[];
      
      const hwMap: Record<string, any> = {};
      for (const row of hwRows) {
        if (!hwMap[row.hardware]) {
          hwMap[row.hardware] = { hardware: row.hardware, report_count: 0, best_status: "unsupported", avg_fps: null };
        }
        hwMap[row.hardware].report_count += row.cnt;
        if ((TIER_RANK[row.status] || 0) > (TIER_RANK[hwMap[row.hardware].best_status] || 0)) {
          hwMap[row.hardware].best_status = row.status;
        }
        if (row.fps) hwMap[row.hardware].avg_fps = row.fps;
      }

      g.benchmark_summary = buildBenchmarkSummary(g.id);

      return json({ 
        game: g, 
        steam: steamMetadata,
        tests, 
        aggregate: { tier: aggregate.tier, total_reports: tests.length, breakdown: aggregate.breakdown },
        hardware_matrix: Object.values(hwMap)
      });
    }
    if (method === "PUT") {
      const body = await req.json() as any;
      const coverUrl = body.cover_art_url || getSteamCoverUrl(body.steam_app_id) || null;
      db.query(`UPDATE games SET name=?, platform=?, genre=?, store_url=?, steam_app_id=?, cover_art_url=? WHERE id=?`).run(
        body.name, body.platform || null, body.genre || null, body.store_url || null, body.steam_app_id || null, coverUrl, id
      );
      return json({ success: true });
    }
    if (method === "DELETE") {
      db.query(`DELETE FROM games WHERE id = ?`).run(id);
      return json({ success: true });
    }
  }

  // ── POST /api/v1/gamedb/games/:id/tests ──────────────────────────
  const testMatch = path.match(/^\/api\/v1\/gamedb\/games\/(\d+)\/tests$/);
  if (method === "POST" && testMatch) {
    const gameId = parseInt(testMatch[1]);
    const body = await req.json() as any;
    const user = getSessionUser(req);
    try {
      db.query(`INSERT INTO tests (game_id, user_id, tested_at, macos_version, hardware, wine_version, crossover_version, gptk_version, launcher, play_method, translation_layer, graphics_preset, resolution, status, fps, notes)
                VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        gameId, user?.id || null, body.tested_at || null, body.macos_version || null, body.hardware || null,
        body.wine_version || null, body.crossover_version || null, body.gptk_version || null,
        body.launcher || null, body.play_method || null, body.translation_layer || null, body.graphics_preset || null,
        body.resolution || null, body.status, body.fps || null, body.notes || null
      );
      const t = db.query(`SELECT * FROM tests WHERE id = last_insert_rowid()`).get() as any;
      if (body.issues?.length) {
        for (const issue of body.issues) {
          db.query(`INSERT INTO issues (test_id, description, severity, workaround, resolved_by_version, resolved) VALUES (?,?,?,?,?,?)`).run(
            t.id, issue.description, issue.severity || null, issue.workaround || null, issue.resolved_by_version || null, issue.resolved ? 1 : 0
          );
        }
      }
      return json({ id: t.id }, 201);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── GET /api/v1/gamedb/distinct ───────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/distinct") {
    const col = url.searchParams.get("column") || "";
    if (!["wine_version", "macos_version", "hardware", "status", "platform", "genre"].includes(col)) return err("Invalid column", 400);
    try {
      const rows = db.query(`SELECT DISTINCT ${col} FROM tests WHERE ${col} IS NOT NULL AND ${col} != '' ORDER BY ${col}`).all() as any[];
      return jsonWithCache(req, { values: rows.map((r) => r[col]) }, 1800);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── GET /api/v1/gamedb/stats ──────────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/stats") {
    const total = (db.query(`SELECT COUNT(*) as n FROM games`).get() as any).n;
    const totalReports = (db.query(`SELECT COUNT(*) as n FROM tests`).get() as any).n;
    const totalUsers = (db.query(`SELECT COUNT(*) as n FROM users`).get() as any).n;
    const byStatus = db.query(`SELECT status, COUNT(*) as count FROM tests GROUP BY status`).all();
    const byPlatform = db.query(`SELECT platform, COUNT(*) as count FROM games WHERE platform IS NOT NULL GROUP BY platform`).all();
    return json({ total, total_reports: totalReports, total_users: totalUsers, by_status: byStatus, by_platform: byPlatform });
  }

  // ── POST /api/v1/gamedb/ingest/preview ───────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/ingest/preview") {
    const body = await req.json() as any;
    return json({ preview: { game: { name: body.text?.trim() || "Unknown" }, test: { status: "playable" } } });
  }

  // ── POST /api/v1/gamedb/ingest/save ──────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/ingest/save") {
    const body = await req.json() as any;
    try {
      db.query(`INSERT OR IGNORE INTO games (name) VALUES (?)`).run(body.game.name);
      const g = db.query(`SELECT * FROM games WHERE name = ?`).get(body.game.name) as any;
      db.query(`INSERT INTO tests (game_id, status, notes) VALUES (?, ?, ?)`).run(g.id, body.test?.status || "playable", body.test?.notes || null);
      const t = db.query(`SELECT * FROM tests WHERE id = last_insert_rowid()`).get() as any;
      return json({ game_id: g.id, test_id: t.id }, 201);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── GET /api/v1/gamedb/appstore/lookup ───────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/appstore/lookup") {
    const appId = url.searchParams.get("app_id") || "";
    if (!appId) return err("App ID required", 400);
    try {
      const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(appId)}&country=us&entity=software`, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MacReady/1.0",
        },
      });
      if (!res.ok) throw new Error(`Apple lookup returned ${res.status}`);
      const details = parseAppleAppLookup(await res.json());
      if (!details) return err("App not found", 404);
      return json({ details });
    } catch (e: any) {
      return err(e.message || "Apple lookup failed", 502);
    }
  }

  // ── GET /api/v1/gamedb/appstore/search ───────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/appstore/search") {
    const q = url.searchParams.get("q") || "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 24, 50);
    if (!q.trim()) return json({ items: [] });
    try {
      const apiUrl = new URL("https://itunes.apple.com/search");
      apiUrl.searchParams.set("term", q);
      apiUrl.searchParams.set("country", "us");
      apiUrl.searchParams.set("media", "software");
      apiUrl.searchParams.set("entity", "software");
      apiUrl.searchParams.set("limit", String(limit));

      const res = await fetch(apiUrl.toString(), {
        headers: {
          "Accept": "application/json",
          "User-Agent": "MacReady/1.0",
        },
      });
      if (!res.ok) throw new Error(`Apple search returned ${res.status}`);
      const payload = await res.json();
      const items = (Array.isArray(payload?.results) ? payload.results : [])
        .map((app: any, index: number) => parseAppleAppSearchResult(app, index, q))
        .filter(Boolean);
      return json({ items });
    } catch (e: any) {
      return err(e.message || "Apple search failed", 502);
    }
  }

  // ── GET /api/v1/gamedb/news ──────────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/news") {
    try {
      const feedResults = await Promise.allSettled(MAC_NEWS_FEEDS.map(async (feed) => {
        const res = await fetch(feed.url, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "Accept": "application/rss+xml, application/xml, text/xml",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!res.ok) throw new Error(`${feed.source} returned ${res.status}`);
        return parseMacNewsFeed(await res.text(), feed);
      }));

      const appChartResults = await Promise.allSettled(APP_STORE_CHARTS.map(async (chart) => {
        const res = await fetch(chart.url, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "Accept": "application/json",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!res.ok) throw new Error(`${chart.title} returned ${res.status}`);
        return parseAppleAppChart(await res.json(), chart.title);
      }));

      const changelogResult = await Promise.allSettled([CROSSOVER_CHANGELOG_URL].map(async (changelogUrl) => {
        const res = await fetch(changelogUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "Accept": "text/html",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!res.ok) throw new Error(`CrossOver changelog returned ${res.status}`);
        return parseCodeWeaversChangelog(await res.text());
      }));

      const macOSReleaseNotesResult = await Promise.allSettled([MACOS_RELEASE_NOTES_COLLECTION_JSON_URL].map(async (collectionUrl) => {
        const collectionRes = await fetch(collectionUrl, {
          signal: AbortSignal.timeout(12000),
          headers: {
            "Accept": "application/json",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!collectionRes.ok) throw new Error(`macOS release notes returned ${collectionRes.status}`);
        const collection = await collectionRes.json();
        const slug = releaseNotesSlugFromIdentifier(latestTahoeReleaseNote(collection));
        if (!slug) return [];

        const releaseNotesRes = await fetch(releaseNotesJsonUrlFromSlug(slug), {
          signal: AbortSignal.timeout(12000),
          headers: {
            "Accept": "application/json",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!releaseNotesRes.ok) throw new Error(`macOS release notes returned ${releaseNotesRes.status}`);
        return parseAppleMacOSReleaseNotes(await releaseNotesRes.json(), slug);
      }));

      const items = feedResults
        .concat(appChartResults, changelogResult, macOSReleaseNotesResult)
        .flatMap((result) => result.status === "fulfilled" ? result.value : [])
        .filter((item) => item.category !== "Performance" || /\b(?:macOS\s+26|Tahoe)\b/i.test(`${item.title} ${item.summary}`))
        .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
        .sort((a, b) => {
          const aTime = a.published_at ? Date.parse(a.published_at) : 0;
          const bTime = b.published_at ? Date.parse(b.published_at) : 0;
          return bTime - aTime;
        })
        .slice(0, 240);

      return json({ items });
    } catch (e: any) {
      return err(e.message, 500);
    }
  }

  // ── GET /api/v1/gamedb/steam/search ────────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/steam/search") {
    const q = url.searchParams.get("q") || "";
    const status = url.searchParams.get("status") || "";
    if (!q) return err("Query required", 400);
    try {
      const items = await cacheValue(`steam:search:${q}:${status}`, 10 * 60_000, async () => {
        const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
        if (!res.ok) throw new Error("Steam API failed");
        const data = await res.json() as any;
        const enrichedItems = await Promise.all((data.items || []).slice(0, 8).map(async (item: any) => {
          const appId = item.id.toString();
          const metadata = await getSteamMetadata(appId);
          const tier = metadata?.compatibility_tier || "unsupported";
          return {
            name: item.name,
            steam_app_id: appId,
            cover_art_url: metadata?.header_image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`,
            description: metadata?.description || "",
            genres: metadata?.genres || [],
            mac_native: Boolean(metadata?.mac_native),
            crossover_playable: Boolean(metadata?.crossover_playable),
            compatibility_tier: tier,
            compatibility_label: metadata?.compatibility_label || "Unrated",
            compatibility_reasons: metadata?.compatibility_reasons || [],
          };
        }));
        return enrichedItems.filter((item: any) => statusMatches(status, item.compatibility_tier));
      });
      return jsonWithCache(req, { items }, 600);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── GET /api/v1/gamedb/steam/reviews ───────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/steam/reviews") {
    const appId = url.searchParams.get("app_id");
    if (!appId) return err("Steam app id required", 400);
    try {
      const reviews = await getSteamReviewSummary(appId);
      if (!reviews) return err("Steam review summary unavailable", 404);
      return jsonWithCache(req, { reviews }, 1800);
    } catch (e: any) {
      return err(e.message, 500);
    }
  }

  // ── GET /api/v1/gamedb/steam/search-index ─────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/steam/search-index") {
    try {
      const seen = new Set<string>();
      const searchResults = await Promise.all(STEAM_SEARCH_INDEX_TERMS.map(async (term) => {
        const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=US`, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!res.ok) return [];
        const payload = await res.json() as any;
        return payload.items || [];
      }));
      const items = [];
      for (const results of searchResults) {
        for (const app of results) {
          const id = String(app.id || "");
          const name = typeof app.name === "string" ? app.name.trim() : "";
          if (!id || !name || seen.has(id) || shouldHideSteamCatalogName(name)) continue;
          seen.add(id);
          items.push({
            name,
            steam_app_id: id,
            cover_art_url: app.tiny_image || getSteamCoverUrl(id),
            compatibility_tier: "unsupported",
            compatibility_label: "Unrated",
            compatibility_reasons: [],
          });
        }
      }
      return json({ items });
    } catch (e: any) {
      return err(e.message, 500);
    }
  }

  // ── GET /api/v1/gamedb/steam/trending ─────────────────────────────
  if (method === "GET" && path === "/api/v1/gamedb/steam/trending") {
    try {
      const cursor = Math.max(0, Number(url.searchParams.get("cursor")) || 0);
      const requestedCount = Number(url.searchParams.get("count")) || 0;
      const count = requestedCount > 0 ? Math.min(requestedCount, 80) : 200;
      const feeds = [
        {
          feed: "featured",
          url: "https://store.steampowered.com/search/results/?query&start=0&count=40&dynamic_data=&sort_by=_ASC&force_infinite=1&filter=popularnew&category1=998&ndl=1",
        },
        {
          feed: "top_sellers",
          url: "https://store.steampowered.com/search/results/?query&start=0&count=80&dynamic_data=&sort_by=_ASC&force_infinite=1&filter=topsellers&category1=998&ndl=1",
        },
        {
          feed: "new_releases",
          url: "https://store.steampowered.com/search/results/?query&start=0&count=80&dynamic_data=&sort_by=Released_DESC&force_infinite=1&filter=popularnew&category1=998&ndl=1",
        },
      ] as const;

      const blockedTerms = new Set([
        "ahegao", "bdsm", "boobs", "breast", "brothel", "busty",
        "ecchi", "eroge", "erotic", "femboy", "futa", "futanari",
        "harem", "hentai", "incest", "lewd", "milf", "nsfw",
        "nude", "nudity", "porn", "pornographic", "seduce", "sex",
        "sexual", "sexy", "succubus", "tentacle", "waifu", "yuri",
        "chatgpt", "shovelware", "assetflip"
      ]);
      const blockedPhrases = [
        "erotic visual novel", "sexual content", "adult only", "ai generated",
        "generated by ai", "made with ai", "ai art", "ai girlfriend",
        "ai companion", "asset flip", "low effort"
      ];
      const blockedNames = new Set(["steam controller", "steam deck", "steam link"]);
      const blockedStoreHardware = ["steam deck", "steam controller", "docking station"];
      const decodeHtml = (value: string) => value
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      const normalizeFeaturedText = (value: string) => value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
      const shouldHideFeaturedItem = (name: string) => {
        const haystack = normalizeFeaturedText(name);
        const tokens = new Set(haystack.split(/\s+/).filter(Boolean));
        return blockedNames.has(haystack) || blockedStoreHardware.some((phrase) => haystack.includes(phrase)) || Array.from(blockedTerms).some((term) => tokens.has(term)) || blockedPhrases.some((phrase) => haystack.includes(phrase));
      };
      const parseFeed = async (feed: typeof feeds[number]) => {
        const res = await fetch(feed.url, {
          headers: {
            "Accept": "text/html",
            "User-Agent": "MacReady/1.0",
          },
        });
        if (!res.ok) throw new Error(`Steam ${feed.feed} unavailable`);
        const html = await res.text();
        const seenInFeed = new Set<string>();
        return Array.from(html.matchAll(/<a[^>]*data-ds-appid="(\d+)"[\s\S]*?<span class="title">([\s\S]*?)<\/span>[\s\S]*?<\/a>/g)).map((match, index) => {
          const block = match[0];
          const id = match[1];
          const name = decodeHtml(match[2].replace(/<[^>]+>/g, "").trim());
          const imageMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
          const imageUrl = imageMatch?.[1] ? decodeHtml(imageMatch[1]) : "";
          return {
            name,
            steam_app_id: id,
            cover_art_url: imageUrl,
            compatibility_tier: "unsupported",
            compatibility_label: "Unrated",
            feed: feed.feed,
            feed_rank: index + 1,
          };
        }).filter((item) => {
          if (!item.steam_app_id || !item.name || !item.cover_art_url || shouldHideFeaturedItem(item.name)) return false;
          if (seenInFeed.has(item.steam_app_id)) return false;
          seenInFeed.add(item.steam_app_id);
          return true;
        });
      };

      const allItems = await cacheValue("steam:trending:basic", 10 * 60_000, async () => {
        return (await Promise.all(feeds.map(parseFeed))).flat().slice(0, 200);
      });
      const items = allItems.slice(cursor, cursor + count);
      const nextCursor = cursor + count < allItems.length ? cursor + count : null;
      if (url.searchParams.get("details") === "1") {
        const limit = Math.min(Number(url.searchParams.get("limit")) || 80, items.length);
        const detailedItems = await Promise.all(items.slice(0, limit).map(async (item) => {
          const [steam, reviews] = await Promise.all([
            getSteamMetadata(item.steam_app_id),
            getSteamReviewSummary(item.steam_app_id),
          ]);
          return {
            ...item,
            cover_art_url: steam?.header_image || item.cover_art_url,
            description: steam?.description || "",
            genres: steam?.genres || [],
            mac_native: Boolean(steam?.mac_native),
            crossover_playable: Boolean(steam?.crossover_playable),
            compatibility_tier: steam?.compatibility_tier,
            compatibility_label: steam?.compatibility_label || "Unrated",
            compatibility_reasons: steam?.compatibility_reasons || [],
            steam,
            reviews,
          };
        }));
        return jsonWithCache(req, { items: detailedItems, nextCursor }, 600);
      }

      return jsonWithCache(req, { items, nextCursor }, 600);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── POST /api/v1/gamedb/agent/command ────────────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/agent/command") {
    const cmd = await req.json() as any;
    try {
      const result = handleAgentCommand(db, { intent: cmd.intent, gameName: cmd.game_name, entities: cmd.entities || [], raw: cmd.raw || "" });
      return json(result);
    } catch (e: any) { return err(e.message, 500); }
  }

  // ── POST /api/v1/gamedb/agent/sessions (stub) ────────────────────
  if (method === "POST" && path === "/api/v1/gamedb/agent/sessions") {
    return json({ session_id: crypto.randomUUID() }, 201);
  }

  // ── Static files / SPA fallback ───────────────────────────────────
  let filePath = path === "/" ? "/index.html" : path;
  const staticPath = join(PROJECT_DIR, "frontend/dist", filePath);
  try {
    const s = statSync(staticPath);
    if (s.isFile()) {
      const file = Bun.file(staticPath);
      return new Response(file, {
        headers: {
          ...CORS,
          "Content-Type": file.type || "application/octet-stream",
          "Accept-Ranges": "bytes",
        }
      });
    }
  } catch { /* fall through */ }

  const index = join(PROJECT_DIR, "frontend/dist/index.html");
  return new Response(Bun.file(index), { headers: CORS });
}

if (import.meta.main) {
  let isBuilding = false;
  const build = async () => {
    if (isBuilding) return;
    isBuilding = true;
    console.log("[Auto-Build] Building frontend...");
    const proc = Bun.spawn(["bun", "run", "build"], {
      cwd: join(PROJECT_DIR, "frontend"),
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
    console.log("[Auto-Build] Build complete.");
    isBuilding = false;
  };

  build();

  watch(join(PROJECT_DIR, "frontend/src"), { recursive: true }, (event, filename) => {
    if (filename && (filename.endsWith(".tsx") || filename.endsWith(".ts") || filename.endsWith(".css"))) {
      build();
    }
  });

  serve({ port: BASE_PORT, fetch: handler });
  console.log(`dac server (Bun) listening on http://localhost:${BASE_PORT}`);
}
