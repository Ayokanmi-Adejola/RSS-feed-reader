import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";

const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(80)
});

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { data, error } = await auth.supabase
    .from("categories")
    .select("id, name, sort_order")
    .eq("user_id", auth.user.id)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, categories: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return auth.response;
  }

  const payload = await request.json();
  const parsed = createCategorySchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid category name." }, { status: 400 });
  }

  const { count } = await auth.supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  const { data, error } = await auth.supabase
    .from("categories")
    .insert({ user_id: auth.user.id, name: parsed.data.name, sort_order: count ?? 999 })
    .select("id, name, sort_order")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create category." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, category: data });
}
