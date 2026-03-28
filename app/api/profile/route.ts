import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";

const updateProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(80).optional(),
  avatar_url: z.string().trim().url().nullable().optional()
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const profileQuery = await auth.supabase
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  let data = profileQuery.data;
  if (profileQuery.error) {
    const isMissingAvatarColumn = /avatar_url|column/i.test(profileQuery.error.message);
    if (!isMissingAvatarColumn) {
      return NextResponse.json({ ok: false, error: profileQuery.error.message }, { status: 500 });
    }

    const fallbackQuery = await auth.supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (fallbackQuery.error) {
      return NextResponse.json({ ok: false, error: fallbackQuery.error.message }, { status: 500 });
    }

    data = {
      display_name: fallbackQuery.data?.display_name ?? null,
      avatar_url: null
    };
  }

  return NextResponse.json({
    ok: true,
    profile: {
      display_name: data?.display_name ?? null,
      avatar_url: data?.avatar_url ?? null,
      email: auth.user.email ?? null
    }
  });
}

export async function PATCH(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await request.json();
  const parsed = updateProfileSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid profile payload." }, { status: 400 });
  }

  const updateAttempt = await auth.supabase
    .from("profiles")
    .upsert({
      user_id: auth.user.id,
      display_name: parsed.data.display_name,
      avatar_url: parsed.data.avatar_url ?? null
    });

  if (updateAttempt.error) {
    const isMissingAvatarColumn = /avatar_url|column/i.test(updateAttempt.error.message);
    if (!isMissingAvatarColumn) {
      return NextResponse.json({ ok: false, error: updateAttempt.error.message }, { status: 500 });
    }

    // Fallback for environments where avatar migration was not yet applied.
    const fallback = await auth.supabase
      .from("profiles")
      .upsert({
        user_id: auth.user.id,
        display_name: parsed.data.display_name
      });

    if (fallback.error) {
      return NextResponse.json({ ok: false, error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, warning: "Avatar column missing. Run latest migration to enable avatar URLs." });
  }

  return NextResponse.json({ ok: true });
}
