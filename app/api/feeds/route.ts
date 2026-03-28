import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { validateFeedUrl } from "@/lib/server/feeds";

const createFeedSchema = z.object({
  url: z.string().url(),
  categoryId: z.string().uuid().nullable().optional(),
  customTitle: z.string().trim().max(120).optional()
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { data: feeds, error } = await auth.supabase
    .from("feeds")
    .select("id, category_id, feed_url, site_url, title, custom_title, description, favicon_url, health_status, last_fetched_at, last_successful_fetch_at, consecutive_failures")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, feeds: feeds ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await request.json();
  const parsed = createFeedSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid feed payload." }, { status: 400 });
  }

  const existing = await auth.supabase
    .from("feeds")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("feed_url", parsed.data.url)
    .maybeSingle();

  if (existing.data?.id) {
    return NextResponse.json({ ok: false, error: "Feed already exists." }, { status: 409 });
  }

  try {
    const metadata = await validateFeedUrl(parsed.data.url);

    const { data, error } = await auth.supabase
      .from("feeds")
      .insert({
        user_id: auth.user.id,
        category_id: parsed.data.categoryId ?? null,
        feed_url: parsed.data.url,
        site_url: metadata.siteUrl,
        title: metadata.title,
        description: metadata.description,
        favicon_url: metadata.favicon,
        custom_title: parsed.data.customTitle || metadata.title,
        health_status: "active",
        last_fetched_at: new Date().toISOString(),
        last_successful_fetch_at: new Date().toISOString(),
        next_fetch_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Failed to save feed." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, feedId: data.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not validate feed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
