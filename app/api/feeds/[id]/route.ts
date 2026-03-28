import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";

const updateFeedSchema = z.object({
  customTitle: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().nullable().optional()
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = updateFeedSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid update payload." }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from("feeds")
    .update({
      custom_title: parsed.data.customTitle,
      category_id: parsed.data.categoryId
    })
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const { error } = await auth.supabase
    .from("feeds")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
