"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNowStrict } from "date-fns";
import DOMPurify from "isomorphic-dompurify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LayoutMode } from "@/lib/types";

type Category = { id: string; name: string; sort_order: number };
type Feed = {
  id: string;
  category_id: string | null;
  feed_url: string;
  site_url: string | null;
  title: string;
  custom_title: string | null;
  description: string | null;
  favicon_url: string | null;
  health_status: "active" | "stale" | "error";
  last_fetched_at: string | null;
  last_successful_fetch_at: string | null;
  consecutive_failures: number;
};
type Article = {
  id: string;
  feedId: string;
  sourceName: string;
  sourceFavicon: string;
  title: string;
  url: string;
  excerpt: string;
  contentHtml: string;
  author: string;
  publishedAt: string;
  read: boolean;
  bookmarked: boolean;
};

type Preferences = {
  layout_mode: LayoutMode;
  items_per_page: number;
  keyboard_shortcuts_enabled: boolean;
};

const defaultPreferences: Preferences = {
  layout_mode: "comfortable",
  items_per_page: 40,
  keyboard_shortcuts_enabled: true
};

const categoryDotPalette = ["#2563eb", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#0ea5e9"];

function timeAgo(value: string): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html);
}

async function safeJson(response: Response) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  }
}

export default function DashboardDbApp() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hasLoadedArticles, setHasLoadedArticles] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedFeedId, setSelectedFeedId] = useState<string>("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [feedUrl, setFeedUrl] = useState("");
  const [feedCustomTitle, setFeedCustomTitle] = useState("");
  const [feedCategoryId, setFeedCategoryId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [profileInitials, setProfileInitials] = useState("FP");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string>("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileFormName, setProfileFormName] = useState("");
  const [profileFormAvatarUrl, setProfileFormAvatarUrl] = useState("");

  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [search]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const [categoriesRes, feedsRes, prefRes, profileRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/feeds"),
        fetch("/api/preferences"),
        fetch("/api/profile")
      ]);

      const categoriesJson = await safeJson(categoriesRes);
      const feedsJson = await safeJson(feedsRes);
      const prefJson = await safeJson(prefRes);
      const profileJson = await safeJson(profileRes);

      if (categoriesJson?.ok) {
        setCategories(categoriesJson.categories);
      }
      if (feedsJson?.ok) {
        setFeeds(feedsJson.feeds);
      }
      if (prefJson?.ok && prefJson.preferences) {
        setPreferences((previous) => ({ ...previous, ...prefJson.preferences }));
      }
      if (profileJson?.ok && profileJson.profile) {
        const profile = profileJson.profile as {
          display_name: string | null;
          avatar_url: string | null;
          email: string | null;
        };
        const label = profile.display_name || profile.email || "Frontpage";
        const words = label.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        const initials = words.length > 0
          ? words.map((part) => part[0]?.toUpperCase() ?? "").join("")
          : "FP";

        setProfileInitials(initials || "FP");
        setDisplayName(profile.display_name || "");
        setAvatarUrl(profile.avatar_url || null);
        setProfileFormName(profile.display_name || "");
        setProfileFormAvatarUrl(profile.avatar_url || "");
      }

      if (!profileJson) {
        setMessage("Profile endpoint returned unexpected response. Run latest Supabase migrations.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadArticles = useCallback(async (nextPage: number, reset = false) => {
    if (reset) {
      if (hasLoadedArticles) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: String(preferences.items_per_page || 40),
        search: debouncedSearch,
        categoryId: selectedCategoryId,
        feedId: selectedFeedId,
        saved: savedOnly ? "1" : "0"
      });

      const res = await fetch(`/api/articles?${params.toString()}`);
      const json = await res.json();

      if (!json.ok) {
        setMessage(json.error || "Failed to load articles.");
        return;
      }

      setTotal(json.total || 0);
      setPage(nextPage);
      setArticles((previous) => (reset ? json.items : [...previous, ...json.items]));

      if (reset && json.items.length > 0) {
        setActiveArticleId(json.items[0].id);
        setSelectedIndex(0);
      }
    } finally {
      if (reset && !hasLoadedArticles) {
        setHasLoadedArticles(true);
      }
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, hasLoadedArticles, preferences.items_per_page, selectedCategoryId, selectedFeedId, savedOnly]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    void loadArticles(1, true);
  }, [loadArticles]);

  const activeArticle = useMemo(() => {
    return articles.find((article) => article.id === activeArticleId) || null;
  }, [articles, activeArticleId]);

  const hasMore = articles.length < total;
  const unreadTotal = articles.filter((article) => !article.read).length;

  const unreadByFeed = useMemo(() => {
    const map = new Map<string, number>();
    for (const article of articles) {
      if (!article.read) {
        map.set(article.feedId, (map.get(article.feedId) || 0) + 1);
      }
    }
    return map;
  }, [articles]);

  const unreadByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const feed of feeds) {
      const unread = unreadByFeed.get(feed.id) || 0;
      if (feed.category_id) {
        map.set(feed.category_id, (map.get(feed.category_id) || 0) + unread);
      }
    }
    return map;
  }, [feeds, unreadByFeed]);

  const healthStats = useMemo(() => {
    const stats = { active: 0, stale: 0, error: 0 };
    for (const feed of feeds) {
      stats[feed.health_status] += 1;
    }
    return stats;
  }, [feeds]);

  const rowVirtualizer = useVirtualizer({
    count: articles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      if (preferences.layout_mode === "compact") {
        return 126;
      }
      if (preferences.layout_mode === "cards") {
        return 206;
      }
      return 164;
    },
    overscan: 8
  });

  const toggleItemState = async (id: string, nextState: { read?: boolean; bookmarked?: boolean }) => {
    const response = await fetch(`/api/articles/${id}/state`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextState)
    });

    const json = await response.json();
    if (!json.ok) {
      setMessage(json.error || "Failed to update item state.");
      return;
    }

    setArticles((previous) =>
      previous.map((article) =>
        article.id === id
          ? {
              ...article,
              read: json.read,
              bookmarked: json.bookmarked
            }
          : article
      )
    );
  };

  const refreshFeed = async (id: string) => {
    setMessage("Refreshing feed...");
    const response = await fetch(`/api/feeds/${id}/refresh`, { method: "POST" });
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "Feed refresh failed.");
      return;
    }

    setMessage(`Feed refreshed (${json.status}).`);
    await Promise.all([loadBase(), loadArticles(1, true)]);
  };

  const addFeed = async () => {
    const url = feedUrl.trim();
    if (!url) {
      return;
    }

    const response = await fetch("/api/feeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, customTitle: feedCustomTitle, categoryId: feedCategoryId })
    });
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "Could not add feed.");
      return;
    }

    if (json.feedId) {
      await refreshFeed(json.feedId);
    }

    setFeedUrl("");
    setFeedCustomTitle("");
    setMessage("Feed added and refreshed.");
    await loadBase();
  };

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) {
      return;
    }

    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "Could not add category.");
      return;
    }

    setCategories((previous) => [...previous, json.category].sort((a, b) => a.sort_order - b.sort_order));
    setNewCategory("");
  };

  const setLayout = async (layout: LayoutMode) => {
    setPreferences((previous) => ({ ...previous, layout_mode: layout }));
    await fetch("/api/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout_mode: layout })
    });
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const saveProfile = async () => {
    const trimmedName = profileFormName.trim();
    const trimmedAvatar = profileFormAvatarUrl.trim();

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        display_name: trimmedName || undefined,
        avatar_url: trimmedAvatar ? trimmedAvatar : null
      })
    });
    const json = await response.json();

    if (!json.ok) {
      setMessage(json.error || "Unable to save profile.");
      return;
    }

    const avatarPersisted = !json.warning;

    const label = trimmedName || "Frontpage";
    const words = label.split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = words.length > 0
      ? words.map((part) => part[0]?.toUpperCase() ?? "").join("")
      : "FP";

    setDisplayName(trimmedName);
    setProfileInitials(initials || "FP");
    if (avatarPersisted) {
      setAvatarUrl(trimmedAvatar || null);
    }
    setMessage(json.warning || "Profile updated.");
    setProfileMenuOpen(false);
  };

  const markAllRead = async () => {
    const unread = articles.filter((article) => !article.read);
    if (unread.length === 0) {
      return;
    }

    await Promise.all(
      unread.map((article) =>
        fetch(`/api/articles/${article.id}/state`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true })
        })
      )
    );

    setArticles((previous) => previous.map((article) => ({ ...article, read: true })));
    setMessage(`${unread.length} items marked as read.`);
  };

  useEffect(() => {
    if (!preferences.keyboard_shortcuts_enabled) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (isTyping) {
        return;
      }

      if (event.key === "j") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, articles.length - 1)));
      }

      if (event.key === "k") {
        event.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      }

      if (event.key === "o" || event.key === "Enter") {
        event.preventDefault();
        const selected = articles[selectedIndex];
        if (selected) {
          setActiveArticleId(selected.id);
          void toggleItemState(selected.id, { read: true });
        }
      }

      if (event.key === "m") {
        event.preventDefault();
        const selected = articles[selectedIndex];
        if (selected) {
          void toggleItemState(selected.id, { read: !selected.read });
        }
      }

      if (event.key === "b") {
        event.preventDefault();
        const selected = articles[selectedIndex];
        if (selected) {
          void toggleItemState(selected.id, { bookmarked: !selected.bookmarked });
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [articles, preferences.keyboard_shortcuts_enabled, selectedIndex]);

  useEffect(() => {
    const selected = articles[selectedIndex];
    if (selected) {
      setActiveArticleId(selected.id);
      rowVirtualizer.scrollToIndex(selectedIndex, { align: "auto" });
    }
  }, [selectedIndex, articles, rowVirtualizer]);

  const activeCategoryLabel = useMemo(() => {
    if (savedOnly) {
      return "Saved";
    }
    if (selectedFeedId !== "all") {
      const currentFeed = feeds.find((feed) => feed.id === selectedFeedId);
      return currentFeed?.custom_title || currentFeed?.title || "Feed";
    }
    if (selectedCategoryId === "all") {
      return "All Items";
    }
    const currentCategory = categories.find((category) => category.id === selectedCategoryId);
    return currentCategory?.name || "Category";
  }, [savedOnly, selectedFeedId, selectedCategoryId, feeds, categories]);

  if (loading) {
    return <main className="landing-shell">Loading dashboard...</main>;
  }

  return (
    <main className="dashboard-root" id="main-content">
      <header className="app-chrome" aria-label="Application header">
        <div className="app-brand">
          <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSkO4xvSiDi9-OpLNU4bH0d362Puts5E9JCFw&s" alt="Frontpage" className="brand-mark" />
          <strong>Frontpage</strong>
        </div>
        <nav className="app-tabs" aria-label="Main tabs">
          <button className="app-tab app-tab-active">Feed</button>
          <button className="app-tab">Digest</button>
          <button className="app-tab">Discover</button>
        </nav>
        <div className="app-chrome-actions">
          <input
            ref={searchRef}
            className="chrome-search"
            placeholder="Search articles... (/ to focus)"
            aria-label="Global search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="chrome-icon-btn" aria-label="Quick add">+</button>
          <button className="profile-chip" aria-label="Profile" onClick={() => setProfileMenuOpen((prev) => !prev)}>
            {avatarUrl ? <img src={avatarUrl} alt="" className="profile-avatar" /> : <span>{profileInitials}</span>}
          </button>
          {profileMenuOpen ? (
            <div className="profile-menu" role="dialog" aria-label="Edit profile">
              <p className="profile-menu-title">Profile</p>
              <label className="profile-label" htmlFor="profile-name">Display name</label>
              <input
                id="profile-name"
                className="field"
                value={profileFormName}
                onChange={(event) => setProfileFormName(event.target.value)}
                placeholder="Your name"
              />
              <label className="profile-label" htmlFor="profile-avatar">Avatar URL</label>
              <input
                id="profile-avatar"
                className="field"
                value={profileFormAvatarUrl}
                onChange={(event) => setProfileFormAvatarUrl(event.target.value)}
                placeholder="https://..."
              />
              <div className="profile-menu-actions">
                <button className="btn btn-secondary" onClick={() => { setProfileFormAvatarUrl(""); }}>Clear avatar</button>
                <button className="btn btn-primary" onClick={() => void saveProfile()}>Save</button>
              </div>
              {displayName ? <p className="meta">Signed in as {displayName}</p> : null}
            </div>
          ) : null}
        </div>
      </header>

      <section className="dashboard-shell dashboard-modern">
      <aside className="sidebar sidebar-modern" aria-label="Sidebar navigation">
        <p className="meta">Unread total: {unreadTotal}</p>
        <p className="meta">Health: {healthStats.active} active, {healthStats.stale} stale, {healthStats.error} errors</p>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <button
            className={`side-link ${selectedCategoryId === "all" && !savedOnly ? "active" : ""}`}
            onClick={() => {
              setSavedOnly(false);
              setSelectedCategoryId("all");
              setSelectedFeedId("all");
            }}
          >
            <span>All Items</span>
            <span>{unreadTotal}</span>
          </button>
          <button
            className={`side-link ${savedOnly ? "active" : ""}`}
            onClick={() => {
              setSavedOnly(true);
              setSelectedFeedId("all");
            }}
          >
            <span>Saved</span>
            <span>{articles.filter((item) => item.bookmarked).length}</span>
          </button>
        </nav>

        <h3 className="sidebar-heading">Categories</h3>
        <ul className="feed-list">
          {categories.map((category, index) => (
            <li key={category.id}>
              <button
                className={`category-chip ${selectedCategoryId === category.id && !savedOnly ? "active" : ""}`}
                onClick={() => {
                  setSelectedCategoryId(category.id);
                  setSavedOnly(false);
                  setSelectedFeedId("all");
                }}
              >
                <span className="dot" style={{ backgroundColor: categoryDotPalette[index % categoryDotPalette.length] }} />
                <span>{category.name}</span>
                <span>{unreadByCategory.get(category.id) || 0}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar-form">
          <input className="field" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category" aria-label="New category" />
          <button className="btn btn-secondary" onClick={addCategory}>Add category</button>
        </div>

        <h3 className="sidebar-heading">Subscriptions</h3>
        <ul className="feed-list subscriptions-list">
          {feeds.map((feed) => (
            <li key={feed.id} className="subscription-row">
              <div className="subscription-top">
                <button className="subscription-open" onClick={() => { setSelectedFeedId(feed.id); setSavedOnly(false); }}>
                  {feed.custom_title || feed.title}
                </button>
                <span className="meta">{unreadByFeed.get(feed.id) || 0}</span>
              </div>
              <p className="meta subscription-meta">
                {feed.health_status} {feed.last_fetched_at ? `• ${timeAgo(feed.last_fetched_at)}` : ""}
              </p>
              <div className="feed-item-actions">
                <button className="action-btn" onClick={() => void refreshFeed(feed.id)}>Refresh</button>
                <button className="action-btn" onClick={async () => {
                  await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
                  await Promise.all([loadBase(), loadArticles(1, true)]);
                }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="app-main app-main-modern" aria-label="Content area">
        <header className="topbar topbar-modern">
          <div className="topbar-row">
            <h1 className="stream-title">{activeCategoryLabel}</h1>
            <span className="meta">{unreadTotal} unread</span>
          </div>
          <div className="topbar-row topbar-controls">
          <div className="pill-row" role="tablist" aria-label="Layout mode">
            {(["compact", "comfortable", "cards", "split"] as LayoutMode[]).map((layout) => (
              <button key={layout} role="tab" aria-selected={preferences.layout_mode === layout} className={`pill ${preferences.layout_mode === layout ? "active" : ""}`} onClick={() => void setLayout(layout)}>
                {layout}
              </button>
            ))}
          </div>

          <button className="btn btn-secondary" onClick={() => void loadArticles(1, true)}>Refresh list</button>
          <button className="btn btn-secondary" onClick={() => void markAllRead()}>Mark all read</button>
          <button className="btn btn-secondary" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <div className="topbar topbar-modern topbar-add" aria-live="polite" style={{ borderTop: 0 }}>
          <input className="field" placeholder="https://example.com/feed.xml" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} aria-label="Feed URL" />
          <input className="field" placeholder="Custom title" value={feedCustomTitle} onChange={(event) => setFeedCustomTitle(event.target.value)} aria-label="Custom feed title" />
          <select className="select" value={feedCategoryId ?? ""} onChange={(event) => setFeedCategoryId(event.target.value || null)} aria-label="Choose category">
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => void addFeed()}>Add feed</button>
          {message ? <span className="meta status-banner">{message}</span> : null}
        </div>

        <section className={`content-grid content-grid-modern ${preferences.layout_mode === "cards" ? "card-layout" : ""} ${preferences.layout_mode === "compact" ? "compact-layout" : ""}`}>
          <div className="feed-pane feed-pane-modern" ref={parentRef}>
            {unreadTotal > 0 ? <p className="new-items-banner">↑ {unreadTotal} unread items in this view</p> : null}
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const article = articles[virtualRow.index];
                if (!article) {
                  return null;
                }

                const selected = virtualRow.index === selectedIndex;
                return (
                  <article
                    key={article.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className={`stream-row ${article.read ? "read" : ""} ${selected ? "is-selected" : ""} ${preferences.layout_mode === "cards" ? "is-card" : ""}`}
                    style={{ position: "absolute", width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="stream-row-header">
                      <span className="meta">{article.sourceName} • {timeAgo(article.publishedAt)}</span>
                      <span className={`read-pill ${article.read ? "is-read" : "is-unread"}`}>{article.read ? "Read" : "Unread"}</span>
                    </div>
                    <h3 className="stream-row-title">
                      <button onClick={() => {
                        setSelectedIndex(virtualRow.index);
                        setActiveArticleId(article.id);
                        void toggleItemState(article.id, { read: true });
                      }}>{article.title}</button>
                    </h3>
                    <p className="stream-row-excerpt">{article.excerpt}</p>
                    <div className="feed-item-actions">
                      <button className="action-btn" onClick={() => void toggleItemState(article.id, { read: !article.read })}>Mark {article.read ? "Unread" : "Read"}</button>
                      <button className="action-btn" onClick={() => void toggleItemState(article.id, { bookmarked: !article.bookmarked })}>{article.bookmarked ? "Unsave" : "Save"}</button>
                      <a className="action-btn" href={article.url} target="_blank" rel="noreferrer">Open source</a>
                    </div>
                  </article>
                );
              })}
            </div>

            {hasMore ? (
              <button className="btn btn-secondary load-more" disabled={loadingMore} onClick={() => void loadArticles(page + 1, false)}>
                {loadingMore ? "Loading..." : `Load more (${articles.length}/${total})`}
              </button>
            ) : null}
          </div>

          {(preferences.layout_mode === "split" || activeArticle) ? (
            <aside className="reader-pane" aria-label="Reader view">
              {activeArticle ? (
                <article>
                  <p className="meta">
                    {activeArticle.sourceName}
                    {activeArticle.author ? ` • ${activeArticle.author}` : ""}
                    {` • ${new Date(activeArticle.publishedAt).toLocaleString()}`}
                  </p>
                  <h2 style={{ marginTop: 0 }}>{activeArticle.title}</h2>
                  <div dangerouslySetInnerHTML={{ __html: sanitize(activeArticle.contentHtml || `<p>${activeArticle.excerpt}</p>`) }} />
                </article>
              ) : (
                <p className="meta">Select an item to open the in-app reader.</p>
              )}
            </aside>
          ) : null}
        </section>
      </section>
      </section>
    </main>
  );
}
