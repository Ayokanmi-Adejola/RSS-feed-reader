import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: Params) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  const { data: uncategorized } = await auth.supabase
    .from("categories")
    .select("id")
    .eq("user_id", auth.user.id)
    .eq("name", "Uncategorized")
    .single();

  if (uncategorized?.id) {
    await auth.supabase
      .from("feeds")
      .update({ category_id: uncategorized.id })
      .eq("user_id", auth.user.id)
      .eq("category_id", id);
  }

  const { error } = await auth.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
