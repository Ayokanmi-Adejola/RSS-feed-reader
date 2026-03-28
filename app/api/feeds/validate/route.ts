import { NextResponse } from "next/server";
import { validateFeedUrl } from "@/lib/server/feeds";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: "Feed URL is required." }, { status: 400 });
    }

    const feed = await validateFeedUrl(url);

    return NextResponse.json({ ok: true, feed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate feed.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
