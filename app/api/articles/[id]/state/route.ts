import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";

const bodySchema = z.object({
  read: z.boolean().optional(),
  bookmarked: z.boolean().optional()
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = bodySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid item state payload." }, { status: 400 });
  }

  const { data: existing } = await auth.supabase
    .from("user_item_states")
    .select("is_read, is_bookmarked")
    .eq("user_id", auth.user.id)
    .eq("feed_item_id", id)
    .maybeSingle();

  const read = parsed.data.read ?? existing?.is_read ?? false;
  const bookmarked = parsed.data.bookmarked ?? existing?.is_bookmarked ?? false;

  const { error } = await auth.supabase
    .from("user_item_states")
    .upsert({
      user_id: auth.user.id,
      feed_item_id: id,
      is_read: read,
      read_at: read ? new Date().toISOString() : null,
      is_bookmarked: bookmarked,
      bookmarked_at: bookmarked ? new Date().toISOString() : null
    });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, read, bookmarked });
}
