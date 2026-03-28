import { computeNextRetryAt, fetchFeedItemsWithCache } from "@/lib/server/feeds";

type FeedRow = {
  id: string;
  feed_url: string;
  title: string;
  custom_title: string | null;
  etag: string | null;
  last_modified: string | null;
  refresh_interval_minutes: number;
  consecutive_failures: number;
  last_successful_fetch_at: string | null;
};

type SupabaseLike = {
  from: (table: string) => {
    insert: (value: unknown) => { select?: (columns?: string) => { single?: () => Promise<{ data: unknown; error: { message: string } | null }> } } & Promise<{ error: { message: string } | null }>;
    upsert: (values: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => Promise<{ error: { message: string } | null }>;
    update: (values: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error: { message: string } | null }> };
  };
};

function healthFromLastSuccess(lastSuccess: string | null): "active" | "stale" {
  if (!lastSuccess) {
    return "active";
  }
  const age = Date.now() - new Date(lastSuccess).getTime();
  const staleMs = 30 * 24 * 60 * 60 * 1000;
  return age > staleMs ? "stale" : "active";
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export async function refreshFeed(
  supabase: SupabaseLike,
  feed: FeedRow,
  attempt = 1
): Promise<{ ok: boolean; status: number; insertedCount: number; error?: string }> {
  const nowIso = new Date().toISOString();

  try {
    const result = await fetchFeedItemsWithCache(feed.feed_url, feed.etag, feed.last_modified);

    if (result.status === 304) {
      const healthy = healthFromLastSuccess(feed.last_successful_fetch_at ?? nowIso);
      await supabase.from("feeds").update({
        health_status: healthy,
        last_fetched_at: nowIso,
        last_http_status: 304,
        consecutive_failures: 0,
        next_fetch_at: addMinutes(feed.refresh_interval_minutes),
        etag: result.etag ?? feed.etag,
        last_modified: result.lastModified ?? feed.last_modified,
        last_error: null
      }).eq("id", feed.id);

      await supabase.from("feed_refresh_jobs").insert({
        feed_id: feed.id,
        attempt,
        success: true,
        http_status: 304,
        run_started_at: nowIso,
        run_finished_at: new Date().toISOString()
      });

      return { ok: true, status: 304, insertedCount: 0 };
    }

    const rows = result.items.map((item) => ({
      feed_id: feed.id,
      item_guid: item.guid,
      url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      content_html: item.contentHtml ?? null,
      author: item.author ?? null,
      published_at: item.publishedAt
    }));

    if (rows.length > 0) {
      await supabase.from("feed_items").upsert(rows, { onConflict: "feed_id,item_guid" });
    }

    const healthy = healthFromLastSuccess(nowIso);
    await supabase.from("feeds").update({
      title: result.feedTitle || feed.title,
      site_url: result.siteUrl,
      description: result.description,
      health_status: healthy,
      last_fetched_at: nowIso,
      last_successful_fetch_at: nowIso,
      last_http_status: 200,
      consecutive_failures: 0,
      next_fetch_at: addMinutes(feed.refresh_interval_minutes),
      etag: result.etag,
      last_modified: result.lastModified,
      last_error: null
    }).eq("id", feed.id);

    await supabase.from("feed_refresh_jobs").insert({
      feed_id: feed.id,
      attempt,
      success: true,
      http_status: 200,
      run_started_at: nowIso,
      run_finished_at: new Date().toISOString()
    });

    return { ok: true, status: 200, insertedCount: rows.length };
  } catch (error) {
    const failures = (feed.consecutive_failures || 0) + 1;
    const nextRetry = computeNextRetryAt(failures);
    const message = error instanceof Error ? error.message : "Feed refresh failed.";

    await supabase.from("feeds").update({
      health_status: "error",
      last_fetched_at: nowIso,
      consecutive_failures: failures,
      next_fetch_at: nextRetry,
      last_error: message
    }).eq("id", feed.id);

    await supabase.from("feed_refresh_jobs").insert({
      feed_id: feed.id,
      attempt,
      success: false,
      error_message: message,
      next_retry_at: nextRetry,
      run_started_at: nowIso,
      run_finished_at: new Date().toISOString()
    });

    return { ok: false, status: 500, insertedCount: 0, error: message };
  }
}
