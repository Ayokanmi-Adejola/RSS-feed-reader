import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/server";
import { refreshFeed } from "@/lib/server/refresh-feed";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return false;
  }

  const header = request.headers.get("authorization") || "";
  const token = header.replace("Bearer ", "");
  return token === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  const batchSize = Number(process.env.FEED_JOB_BATCH_SIZE || 20);

  const { data: dueFeeds, error } = await supabase
    .from("feeds")
    .select("id, feed_url, title, custom_title, etag, last_modified, refresh_interval_minutes, consecutive_failures, last_successful_fetch_at")
    .lte("next_fetch_at", new Date().toISOString())
    .order("next_fetch_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results = [] as Array<{ feedId: string; ok: boolean; status: number; insertedCount: number; error?: string }>;
  for (const feed of dueFeeds ?? []) {
    const result = await refreshFeed(supabase as never, feed, 1);
    results.push({
      feedId: feed.id,
      ok: result.ok,
      status: result.status,
      insertedCount: result.insertedCount,
      error: result.error
    });
  }

  const healthy = results.filter((item) => item.ok).length;
  const failed = results.length - healthy;

  return NextResponse.json({
    ok: true,
    processed: results.length,
    healthy,
    failed,
    results
  });
}
