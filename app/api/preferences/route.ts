import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";

const preferenceSchema = z.object({
  layout_mode: z.enum(["compact", "comfortable", "cards", "split"]).optional(),
  refresh_interval_minutes: z.number().int().min(5).max(240).optional(),
  digest_last_viewed_at: z.string().datetime().nullable().optional(),
  items_per_page: z.number().int().min(20).max(100).optional(),
  keyboard_shortcuts_enabled: z.boolean().optional()
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { data, error } = await auth.supabase
    .from("user_preferences")
    .select("layout_mode, refresh_interval_minutes, digest_last_viewed_at, items_per_page, keyboard_shortcuts_enabled")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: data });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await request.json();
  const parsed = preferenceSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid preferences payload." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("user_preferences")
    .upsert({
      user_id: auth.user.id,
      ...parsed.data
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
