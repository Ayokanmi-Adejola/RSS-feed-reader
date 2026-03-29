"use client";

import { formatDistanceToNowStrict } from "date-fns";
import DOMPurify from "isomorphic-dompurify";
import { useMemo, useState, useEffect, useRef } from "react";
import { createInitialState, loadState, saveState } from "@/lib/sample-data";
import type {
  Article,
  Feed,
  FetchFeedResponse,
  FrontpageState,
  LayoutMode,
  ValidateFeedResponse
} from "@/lib/types";

function timeAgo(value: string): string {
  return `${formatDistanceToNowStrict(new Date(value), { addSuffix: true })}`;
}

function uniqueArticleId(feedId: string, url: string): string {
  return `${feedId}-${url.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function downloadTextFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}

function toOpml(feeds: Feed[]): string {
  const outlines = feeds
    .map((feed) => `    <outline text="${feed.customTitle ?? feed.title}" title="${feed.customTitle ?? feed.title}" type="rss" xmlUrl="${feed.url}" htmlUrl="${feed.siteUrl}" />`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head>\n    <title>Frontpage Subscriptions</title>\n  </head>\n  <body>\n${outlines}\n  </body>\n</opml>`;
}

function parseOpmlUrls(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  return Array.from(doc.querySelectorAll("outline[xmlUrl]"))
    .map((node) => node.getAttribute("xmlUrl") || "")
    .filter(Boolean);
}

function sanitize(html: string): string {
  return DOMPurify.sanitize(html);
}

export default function DashboardApp() {
  const [state, setState] = useState<FrontpageState | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedForm, setFeedForm] = useState({ url: "", categoryId: "uncategorized", customTitle: "" });
  const [newCategoryName, setNewCategoryName] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setState(loadState());
  }, []);

  useEffect(() => {
    if (!state) {
      return;
    }
    saveState(state);
  }, [state]);

  const categories = useMemo(() => {
    if (!state) {
      return [];
    }
    return [...state.categories].sort((a, b) => a.order - b.order);
  }, [state]);

  const feedMap = useMemo(() => {
    const map = new Map<string, Feed>();
    if (!state) {
      return map;
    }
    state.feeds.forEach((feed) => map.set(feed.id, feed));
    return map;
  }, [state]);

  const filteredArticles = useMemo(() => {
    if (!state) {
      return [];
    }

    let items = [...state.articles];

    if (state.selectedCategoryId === "saved") {
      items = items.filter((article) => article.bookmarked);
    } else if (state.selectedCategoryId !== "all") {
      const selectedFeedIds = state.feeds
        .filter((feed) => feed.categoryId === state.selectedCategoryId)
        .map((feed) => feed.id);
      items = items.filter((article) => selectedFeedIds.includes(article.feedId));
    }

    if (state.selectedFeedId !== "all") {
      items = items.filter((article) => article.feedId === state.selectedFeedId);
    }

    const normalizedQuery = state.searchQuery.trim().toLowerCase();
    if (normalizedQuery) {
      items = items.filter((article) => {
        const haystack = `${article.title} ${article.excerpt} ${article.sourceName}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }

    return items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  }, [state]);

  const digestItems = useMemo(() => {
    if (!state) {
      return [];
    }

    const baseline = state.lastDigestViewedAt ? +new Date(state.lastDigestViewedAt) : Date.now() - 1000 * 60 * 60 * 24;
    return state.articles
      .filter((article) => +new Date(article.publishedAt) >= baseline || !article.read)
      .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
      .slice(0, 12);
  }, [state]);

  const activeArticle = useMemo(() => {
    if (!state || !activeArticleId) {
      return null;
    }
    return state.articles.find((article) => article.id === activeArticleId) ?? null;
  }, [activeArticleId, state]);

  const updateState = (updater: (previous: FrontpageState) => FrontpageState) => {
    setState((previous) => {
      if (!previous) {
        return previous;
      }
      return updater(previous);
    });
  };

  const setLayout = (layout: LayoutMode) => {
    updateState((previous) => ({ ...previous, layout }));
  };

  const selectCategory = (categoryId: FrontpageState["selectedCategoryId"]) => {
    updateState((previous) => ({ ...previous, selectedCategoryId: categoryId, selectedFeedId: "all" }));
  };

  const openArticle = (articleId: string) => {
    setActiveArticleId(articleId);
    updateState((previous) => ({
      ...previous,
      articles: previous.articles.map((article) =>
        article.id === articleId ? { ...article, read: true } : article
      )
    }));
  };

  const toggleRead = (articleId: string) => {
    updateState((previous) => ({
      ...previous,
      articles: previous.articles.map((article) =>
        article.id === articleId ? { ...article, read: !article.read } : article
      )
    }));
  };

  const toggleBookmark = (articleId: string) => {
    updateState((previous) => ({
      ...previous,
      articles: previous.articles.map((article) =>
        article.id === articleId ? { ...article, bookmarked: !article.bookmarked } : article
      )
    }));
  };

  const markAllRead = () => {
    updateState((previous) => ({
      ...previous,
      articles: previous.articles.map((article) => ({ ...article, read: true }))
    }));
    setMessage("All visible items are now marked as read.");
  };

  const addCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      return;
    }

    updateState((previous) => {
      if (previous.categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
        return previous;
      }
      return {
        ...previous,
        categories: [
          ...previous.categories,
          { id: `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name, order: previous.categories.length }
        ]
      };
    });
    setNewCategoryName("");
  };

  const removeCategory = (categoryId: string) => {
    if (categoryId === "uncategorized") {
      return;
    }

    updateState((previous) => ({
      ...previous,
      categories: previous.categories.filter((category) => category.id !== categoryId),
      feeds: previous.feeds.map((feed) =>
        feed.categoryId === categoryId ? { ...feed, categoryId: "uncategorized" } : feed
      )
    }));
  };

  const addFeed = async () => {
    const feedUrl = feedForm.url.trim();
    if (!feedUrl || !state) {
      return;
    }

    if (state.feeds.some((feed) => feed.url.toLowerCase() === feedUrl.toLowerCase())) {
      setMessage("This feed is already in your subscriptions.");
      return;
    }

    setLoadingFeed(true);
    setMessage("Validating feed...");

    try {
      const response = await fetch("/api/feeds/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl })
      });
      const payload = (await response.json()) as ValidateFeedResponse;

      if (!payload.ok || !payload.feed) {
        setMessage(payload.error ?? "Could not validate this feed URL.");
        return;
      }
      const validatedFeed = payload.feed;

      updateState((previous) => {
        const feedId = `feed-${feedUrl.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return {
          ...previous,
          feeds: [
            {
              id: feedId,
              url: feedUrl,
              siteUrl: validatedFeed.siteUrl,
              title: validatedFeed.title,
              description: validatedFeed.description,
              favicon: validatedFeed.favicon,
              categoryId: feedForm.categoryId,
              status: "active",
              lastFetchedAt: new Date().toISOString(),
              customTitle: feedForm.customTitle || validatedFeed.title
            },
            ...previous.feeds
          ]
        };
      });

      setFeedForm({ url: "", categoryId: feedForm.categoryId, customTitle: "" });
      setMessage("Feed added. Run refresh to pull live items.");
    } catch {
      setMessage("Unable to validate feed right now.");
    } finally {
      setLoadingFeed(false);
    }
  };

  const refreshFeed = async (feed: Feed) => {
    setMessage(`Refreshing ${feed.customTitle ?? feed.title}...`);
    try {
      const response = await fetch("/api/feeds/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feed.url })
      });
      const payload = (await response.json()) as FetchFeedResponse;

      if (!payload.ok || !payload.items) {
        updateState((previous) => ({
          ...previous,
          feeds: previous.feeds.map((current) =>
            current.id === feed.id ? { ...current, status: "error" } : current
          )
        }));
        setMessage(payload.error ?? "Feed refresh failed.");
        return;
      }

      updateState((previous) => {
        const existing = new Map(previous.articles.map((item) => [item.id, item]));
        payload.items?.forEach((item) => {
          const articleId = uniqueArticleId(feed.id, item.url);
          const current = existing.get(articleId);
          existing.set(articleId, {
            id: articleId,
            feedId: feed.id,
            sourceName: feed.customTitle ?? feed.title,
            sourceFavicon: feed.favicon,
            title: item.title,
            url: item.url,
            excerpt: item.excerpt,
            contentHtml: item.contentHtml,
            author: item.author,
            publishedAt: item.publishedAt,
            read: current?.read ?? false,
            bookmarked: current?.bookmarked ?? false
          });
        });

        return {
          ...previous,
          articles: Array.from(existing.values()).sort(
            (a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt)
          ),
          feeds: previous.feeds.map((current) =>
            current.id === feed.id
              ? { ...current, status: "active", lastFetchedAt: new Date().toISOString() }
              : current
          )
        };
      });
      setMessage(`Refreshed ${feed.customTitle ?? feed.title}.`);
    } catch {
      setMessage("Refresh failed due to a network issue.");
    }
  };

  const exportOpml = () => {
    if (!state) {
      return;
    }
    const xml = toOpml(state.feeds);
    downloadTextFile("frontpage-subscriptions.opml", xml);
    setMessage("Subscriptions exported as OPML.");
  };

  const importOpml = async (file: File) => {
    const text = await file.text();
    const urls = parseOpmlUrls(text);

    if (urls.length === 0) {
      setMessage("No feed URLs found in OPML file.");
      return;
    }

    let added = 0;
    for (const url of urls.slice(0, 30)) {
      try {
        const response = await fetch("/api/feeds/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url })
        });
        const payload = (await response.json()) as ValidateFeedResponse;
        if (!payload.ok || !payload.feed) {
          continue;
        }
        const validatedFeed = payload.feed;

        updateState((previous) => {
          if (previous.feeds.some((feed) => feed.url.toLowerCase() === url.toLowerCase())) {
            return previous;
          }

          const feedId = `feed-${url.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          return {
            ...previous,
            feeds: [
              {
                id: feedId,
                url,
                siteUrl: validatedFeed.siteUrl,
                title: validatedFeed.title,
                description: validatedFeed.description,
                favicon: validatedFeed.favicon,
                categoryId: "uncategorized",
                status: "active",
                lastFetchedAt: new Date().toISOString(),
                customTitle: validatedFeed.title
              },
              ...previous.feeds
            ]
          };
        });
        added += 1;
      } catch {
        // Continue importing remaining feeds when one URL fails.
      }
    }

    setMessage(`OPML import complete. Added ${added} feeds.`);
  };

  const unreadCountByFeed = useMemo(() => {
    if (!state) {
      return new Map<string, number>();
    }
    const counts = new Map<string, number>();
    state.articles.forEach((article) => {
      if (article.read) {
        return;
      }
      counts.set(article.feedId, (counts.get(article.feedId) ?? 0) + 1);
    });
    return counts;
  }, [state]);

  const unreadCountByCategory = useMemo(() => {
    if (!state) {
      return new Map<string, number>();
    }
    const counts = new Map<string, number>();
    state.feeds.forEach((feed) => {
      const unread = unreadCountByFeed.get(feed.id) ?? 0;
      counts.set(feed.categoryId, (counts.get(feed.categoryId) ?? 0) + unread);
    });
    return counts;
  }, [state, unreadCountByFeed]);

  if (!state) {
    return <main className="landing-shell">Loading Frontpage...</main>;
  }

  return (
    <main className="dashboard-shell" id="main-content" tabIndex={-1}>
      <aside className="sidebar" aria-label="Sidebar navigation">
        <h2>Frontpage</h2>
        <p className="meta">Unread total: {state.articles.filter((article) => !article.read).length}</p>

        <div className="pill-row" style={{ marginBottom: "0.75rem" }}>
          <button className={`pill ${state.selectedCategoryId === "all" ? "active" : ""}`} onClick={() => selectCategory("all")}>All items</button>
          <button className={`pill ${state.selectedCategoryId === "saved" ? "active" : ""}`} onClick={() => selectCategory("saved")}>Saved</button>
        </div>

        <h3>Categories</h3>
        <ul className="feed-list">
          {categories.map((category) => (
            <li key={category.id}>
              <button
                className={`pill ${state.selectedCategoryId === category.id ? "active" : ""}`}
                onClick={() => selectCategory(category.id)}
              >
                {category.name} ({unreadCountByCategory.get(category.id) ?? 0})
              </button>
              {category.id !== "uncategorized" ? (
                <button className="action-btn" onClick={() => removeCategory(category.id)} aria-label={`Delete ${category.name}`}>
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>

        <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.75rem" }}>
          <input
            className="field"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="New category"
            aria-label="New category"
          />
          <button className="btn btn-secondary" onClick={addCategory}>Add category</button>
        </div>

        <h3 style={{ marginTop: "1.2rem" }}>Subscriptions</h3>
        <ul className="feed-list">
          {state.feeds.map((feed) => (
            <li key={feed.id} className="feed-item" style={{ padding: "0.6rem" }}>
              <div className="feed-item-header">
                <strong>{feed.customTitle ?? feed.title}</strong>
                <span className="meta">{unreadCountByFeed.get(feed.id) ?? 0}</span>
              </div>
              <p className="meta" style={{ margin: 0 }}>
                {feed.status} {feed.lastFetchedAt ? `• ${timeAgo(feed.lastFetchedAt)}` : ""}
              </p>
              <div className="feed-item-actions">
                <button className="action-btn" onClick={() => updateState((prev) => ({ ...prev, selectedFeedId: feed.id, selectedCategoryId: "all" }))}>
                  Open
                </button>
                <button className="action-btn" onClick={() => refreshFeed(feed)}>
                  Refresh
                </button>
                <button className="action-btn" onClick={() => updateState((prev) => ({ ...prev, feeds: prev.feeds.filter((current) => current.id !== feed.id), articles: prev.articles.filter((article) => article.feedId !== feed.id) }))}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="app-main" aria-label="Content area">
        <header className="topbar">
          <input
            className="search-input"
            type="search"
            value={state.searchQuery}
            onChange={(event) => updateState((previous) => ({ ...previous, searchQuery: event.target.value }))}
            placeholder="Search all feeds"
            aria-label="Search all feeds"
          />

          <div className="pill-row" role="tablist" aria-label="Layout mode">
            {(["compact", "comfortable", "cards", "split"] as LayoutMode[]).map((layout) => (
              <button
                key={layout}
                role="tab"
                aria-selected={state.layout === layout}
                className={`pill ${state.layout === layout ? "active" : ""}`}
                onClick={() => setLayout(layout)}
              >
                {layout}
              </button>
            ))}
          </div>

          <button className="btn btn-secondary" onClick={markAllRead}>Mark all read</button>
          <button className="btn btn-secondary" onClick={exportOpml}>Export OPML</button>
          <button className="btn btn-secondary" onClick={() => importInputRef.current?.click()}>Import OPML</button>
          <input
            ref={importInputRef}
            style={{ display: "none" }}
            type="file"
            accept=".opml,.xml,text/xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importOpml(file);
              }
              event.currentTarget.value = "";
            }}
          />

          <button
            className="btn btn-secondary"
            onClick={() => updateState((previous) => ({ ...previous, lastDigestViewedAt: new Date().toISOString() }))}
          >
            Digest ({digestItems.length})
          </button>
        </header>

        <div className="topbar" aria-live="polite" style={{ borderTop: 0 }}>
          <input
            className="field"
            placeholder="https://example.com/feed.xml"
            value={feedForm.url}
            onChange={(event) => setFeedForm((previous) => ({ ...previous, url: event.target.value }))}
            aria-label="Feed URL"
          />
          <input
            className="field"
            placeholder="Custom title"
            value={feedForm.customTitle}
            onChange={(event) => setFeedForm((previous) => ({ ...previous, customTitle: event.target.value }))}
            aria-label="Custom feed title"
          />
          <select
            className="select"
            value={feedForm.categoryId}
            onChange={(event) => setFeedForm((previous) => ({ ...previous, categoryId: event.target.value }))}
            aria-label="Choose category"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={addFeed} disabled={loadingFeed}>
            {loadingFeed ? "Validating..." : "Add feed"}
          </button>
          <button className="btn btn-secondary" onClick={() => setState(createInitialState())}>Reset guest data</button>
          {message ? <span className="meta">{message}</span> : null}
        </div>

        <section className={`content-grid ${state.layout === "cards" ? "card-layout" : ""} ${state.layout === "compact" ? "compact-layout" : ""}`}>
          <div className="feed-pane">
            <h2 style={{ marginTop: 0 }}>Feed</h2>
            <ul className="feed-list">
              {filteredArticles.map((article) => (
                <li key={article.id} className={`feed-item ${article.read ? "read" : ""}`}>
                  <div className="feed-item-header">
                    <span className="meta">{article.sourceName} • {timeAgo(article.publishedAt)}</span>
                    <span aria-label={article.read ? "Read" : "Unread"} title={article.read ? "Read" : "Unread"}>
                      {article.read ? "Read" : "Unread"}
                    </span>
                  </div>

                  <h3 className="feed-title">
                    <button onClick={() => openArticle(article.id)}>{article.title}</button>
                  </h3>
                  <p className="meta" style={{ margin: 0 }}>{article.excerpt}</p>

                  <div className="feed-item-actions">
                    <button className="action-btn" onClick={() => toggleRead(article.id)}>
                      Mark {article.read ? "Unread" : "Read"}
                    </button>
                    <button className="action-btn" onClick={() => toggleBookmark(article.id)}>
                      {article.bookmarked ? "Unsave" : "Save"}
                    </button>
                    <a className="action-btn" href={article.url} target="_blank" rel="noreferrer">Open source</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {(state.layout === "split" || activeArticle) && (
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
          )}
        </section>

        <nav className="mobile-nav" aria-label="Mobile quick actions">
          <button className="pill" onClick={() => selectCategory("all")}>All</button>
          <button className="pill" onClick={() => selectCategory("saved")}>Saved</button>
          <button className="pill" onClick={() => updateState((previous) => ({ ...previous, selectedFeedId: "all" }))}>Feeds</button>
        </nav>
      </section>
    </main>
  );
}
