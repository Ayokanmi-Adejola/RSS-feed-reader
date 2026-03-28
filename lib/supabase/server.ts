import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getServiceRoleKey, getSupabaseEnv } from "@/lib/supabase/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        items.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      }
    }
  });
}

export function createServiceSupabaseClient() {
  const { url } = getSupabaseEnv();
  const key = getServiceRoleKey();
  return createAdminClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
