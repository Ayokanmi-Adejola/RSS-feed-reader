import seed from "@/data/sample-feeds.json";
import type { Article, Category, Feed, FrontpageState } from "@/lib/types";

const STORAGE_KEY = "frontpage-state-v1";

function id(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

function faviconFromSite(siteUrl: string): string {
  try {
    const host = new URL(siteUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return "";
  }
}

function makeExcerpt(title: string, source: string): string {
  return `${title} from ${source}. Open the article to read the full story and mark it read.`;
}

function makeSeedArticles(feeds: Feed[]): Article[] {
  const now = Date.now();
  const articles: Article[] = [];

  feeds.forEach((feed, feedIndex) => {
    for (let i = 0; i < 4; i += 1) {
      const publishedAt = new Date(now - (feedIndex * 4 + i) * 1000 * 60 * 90).toISOString();
      const title = `${feed.customTitle ?? feed.title}: sample item ${i + 1}`;
      articles.push({
        id: `${feed.id}-item-${i + 1}`,
        feedId: feed.id,
        sourceName: feed.customTitle ?? feed.title,
        sourceFavicon: feed.favicon,
        title,
        url: feed.siteUrl,
        excerpt: makeExcerpt(title, feed.title),
        contentHtml: `<p>${makeExcerpt(title, feed.title)}</p><p>This seeded content exists so guests can explore layout, bookmarks, unread tracking, digest, and reader view instantly.</p>`,
        publishedAt,
        read: false,
        bookmarked: false
      });
    }
  });

  return articles.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
}

export function createInitialState(): FrontpageState {
  const categories: Category[] = [
    { id: "uncategorized", name: "Uncategorized", order: 0 },
    ...seed.categories.map((category, index) => ({
      id: id("cat", category.name),
      name: category.name,
      order: index + 1
    }))
  ];

  const feeds: Feed[] = seed.categories.flatMap((category) => {
    const categoryId = id("cat", category.name);

    return category.feeds.map((feed) => ({
      id: id("feed", feed.feedUrl),
      url: feed.feedUrl,
      siteUrl: feed.siteUrl,
      title: feed.title,
      description: feed.description,
      favicon: faviconFromSite(feed.siteUrl),
      categoryId,
      status: "active" as const,
      lastFetchedAt: new Date().toISOString(),
      customTitle: feed.title
    }));
  });

  return {
    categories,
    feeds,
    articles: makeSeedArticles(feeds),
    selectedCategoryId: "all",
    selectedFeedId: "all",
    searchQuery: "",
    layout: "comfortable",
    lastDigestViewedAt: null
  };
}

export function loadState(): FrontpageState {
  if (typeof window === "undefined") {
    return createInitialState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState();
    }

    return JSON.parse(raw) as FrontpageState;
  } catch {
    return createInitialState();
  }
}

export function saveState(state: FrontpageState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const frontpageStorageKey = STORAGE_KEY;
