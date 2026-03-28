export type HealthStatus = "active" | "stale" | "error";
export type LayoutMode = "compact" | "comfortable" | "cards" | "split";

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Feed {
  id: string;
  url: string;
  siteUrl: string;
  title: string;
  description: string;
  favicon: string;
  categoryId: string;
  status: HealthStatus;
  lastFetchedAt: string | null;
  customTitle?: string;
}

export interface Article {
  id: string;
  feedId: string;
  sourceName: string;
  sourceFavicon: string;
  title: string;
  url: string;
  excerpt: string;
  contentHtml?: string;
  author?: string;
  publishedAt: string;
  read: boolean;
  bookmarked: boolean;
}

export interface FrontpageState {
  categories: Category[];
  feeds: Feed[];
  articles: Article[];
  selectedCategoryId: string | "all" | "saved";
  selectedFeedId: string | "all";
  searchQuery: string;
  layout: LayoutMode;
  lastDigestViewedAt: string | null;
}

export interface ValidateFeedResponse {
  ok: boolean;
  feed?: {
    title: string;
    description: string;
    siteUrl: string;
    favicon: string;
  };
  error?: string;
}

export interface FetchFeedResponse {
  ok: boolean;
  feedTitle?: string;
  items?: Array<{
    title: string;
    url: string;
    excerpt: string;
    contentHtml?: string;
    author?: string;
    publishedAt: string;
  }>;
  error?: string;
}
