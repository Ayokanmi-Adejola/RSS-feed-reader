import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { refreshFeed } from "@/lib/server/refresh-feed";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const { data: feed, error } = await auth.supabase
    .from("feeds")
    .select("id, feed_url, title, custom_title, etag, last_modified, refresh_interval_minutes, consecutive_failures, last_successful_fetch_at")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (error || !feed) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Feed not found." }, { status: 404 });
  }

  const result = await refreshFeed(auth.supabase as never, feed, 1);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error ?? "Refresh failed." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: result.status, insertedCount: result.insertedCount });
}
