import Parser from "rss-parser";

type ParsedItem = {
  guid: string;
  title: string;
  url: string;
  excerpt: string;
  contentHtml?: string;
  author?: string;
  publishedAt: string;
};

type FeedFetchSuccess = {
  status: 200 | 304;
  feedTitle: string;
  items: ParsedItem[];
  etag: string | null;
  lastModified: string | null;
  siteUrl: string | null;
  description: string | null;
};

const parser = new Parser({
  timeout: 10_000,
  customFields: {
    item: ["content:encoded"]
  }
});

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function normalizeDate(value: string | undefined): string {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
}

function fallbackGuid(url: string, index: number): string {
  return `${url.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${index}`;
}

function faviconFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

export async function validateFeedUrl(url: string): Promise<{
  title: string;
  description: string;
  siteUrl: string;
  favicon: string;
}> {
  const response = await fetch(url, {
    signal: withTimeout(10_000),
    headers: {
      "User-Agent": "FrontpageFeedReader/1.0"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Feed responded with status ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);

  if (!feed.title) {
    throw new Error("Feed title missing.");
  }

  const siteUrl = feed.link || url;
  return {
    title: feed.title,
    description: feed.description || "No feed description provided.",
    siteUrl,
    favicon: faviconFromUrl(siteUrl)
  };
}

export async function fetchFeedItems(url: string): Promise<{ feedTitle: string; items: ParsedItem[] }> {
  const result = await fetchFeedItemsWithCache(url, null, null);
  return {
    feedTitle: result.feedTitle,
    items: result.items
  };
}

export async function fetchFeedItemsWithCache(
  url: string,
  etag: string | null,
  lastModified: string | null
): Promise<FeedFetchSuccess> {
  const response = await fetch(url, {
    signal: withTimeout(10_000),
    headers: {
      "User-Agent": "FrontpageFeedReader/1.0",
      ...(etag ? { "If-None-Match": etag } : {}),
      ...(lastModified ? { "If-Modified-Since": lastModified } : {})
    },
    redirect: "follow"
  });

  if (response.status === 304) {
    return {
      status: 304,
      feedTitle: url,
      items: [],
      etag: response.headers.get("etag"),
      lastModified: response.headers.get("last-modified"),
      siteUrl: null,
      description: null
    };
  }

  if (!response.ok) {
    throw new Error(`Feed responded with status ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);

  const items: ParsedItem[] = (feed.items || []).slice(0, 100).map((item, index) => ({
    // rss-parser types vary by feed format; normalize optional author fields safely.
    ...(() => {
      const candidate = item as { author?: string; creator?: string; guid?: string; id?: string };
      const sourceGuid = candidate.guid || candidate.id || item.link || fallbackGuid(url, index);
      return {
        guid: sourceGuid,
        title: item.title || "Untitled item",
        url: item.link || url,
        excerpt: item.contentSnippet || item.summary || "No summary provided.",
        contentHtml: typeof item.content === "string" ? item.content : undefined,
        author: candidate.creator || candidate.author,
        publishedAt: normalizeDate(item.isoDate || item.pubDate)
      };
    })()
  }));

  return {
    status: 200,
    feedTitle: feed.title || url,
    items,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    siteUrl: feed.link || null,
    description: feed.description || null
  };
}

export function computeNextRetryAt(failureCount: number, baseMinutes = 5, maxMinutes = 24 * 60): string {
  const multiplier = 2 ** Math.max(0, failureCount - 1);
  const minutes = Math.min(baseMinutes * multiplier, maxMinutes);
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}
