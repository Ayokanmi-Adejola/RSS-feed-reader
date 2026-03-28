import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

function toInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(request.url);
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const pageSize = Math.min(100, Math.max(10, toInt(url.searchParams.get("pageSize"), 40)));
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const categoryId = url.searchParams.get("categoryId");
  const feedId = url.searchParams.get("feedId");
  const savedOnly = url.searchParams.get("saved") === "1";

  let feedQuery = auth.supabase
    .from("feeds")
    .select("id, title, custom_title, favicon_url, category_id")
    .eq("user_id", auth.user.id);

  if (categoryId && categoryId !== "all") {
    feedQuery = feedQuery.eq("category_id", categoryId);
  }

  if (feedId && feedId !== "all") {
    feedQuery = feedQuery.eq("id", feedId);
  }

  const { data: feeds, error: feedError } = await feedQuery;
  if (feedError) {
    return NextResponse.json({ ok: false, error: feedError.message }, { status: 500 });
  }

  const feedIds = (feeds ?? []).map((item) => item.id);
  if (feedIds.length === 0) {
    return NextResponse.json({ ok: true, items: [], total: 0, page, pageSize });
  }

  let query = auth.supabase
    .from("feed_items")
    .select("id, feed_id, title, url, excerpt, content_html, author, published_at", { count: "exact" })
    .in("feed_id", feedIds)
    .order("published_at", { ascending: false });

  if (search) {
    query = query.or(`title.ilike.*${search}*,excerpt.ilike.*${search}*`);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: items, count, error: itemsError } = await query.range(from, to);

  if (itemsError) {
    return NextResponse.json({ ok: false, error: itemsError.message }, { status: 500 });
  }

  const itemIds = (items ?? []).map((item) => item.id);
  const { data: states } = itemIds.length
    ? await auth.supabase
        .from("user_item_states")
        .select("feed_item_id, is_read, is_bookmarked")
        .eq("user_id", auth.user.id)
        .in("feed_item_id", itemIds)
    : { data: [] as Array<{ feed_item_id: string; is_read: boolean; is_bookmarked: boolean }> };

  const stateMap = new Map((states ?? []).map((state) => [state.feed_item_id, state]));
  const feedMap = new Map((feeds ?? []).map((feed) => [feed.id, feed]));

  let merged = (items ?? []).map((item) => {
    const itemState = stateMap.get(item.id);
    const source = feedMap.get(item.feed_id);
    return {
      id: item.id,
      feedId: item.feed_id,
      sourceName: source?.custom_title || source?.title || "Unknown source",
      sourceFavicon: source?.favicon_url || "",
      title: item.title,
      url: item.url,
      excerpt: item.excerpt || "",
      contentHtml: item.content_html || "",
      author: item.author || "",
      publishedAt: item.published_at || new Date().toISOString(),
      read: itemState?.is_read ?? false,
      bookmarked: itemState?.is_bookmarked ?? false
    };
  });

  if (savedOnly) {
    merged = merged.filter((item) => item.bookmarked);
  }

  return NextResponse.json({
    ok: true,
    items: merged,
    total: count ?? merged.length,
    page,
    pageSize
  });
}
