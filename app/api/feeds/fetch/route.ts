import { NextResponse } from "next/server";
import { fetchFeedItems } from "@/lib/server/feeds";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: "Feed URL is required." }, { status: 400 });
    }

    const result = await fetchFeedItems(url);

    return NextResponse.json({
      ok: true,
      feedTitle: result.feedTitle,
      items: result.items
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to fetch feed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
