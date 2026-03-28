import { redirect } from "next/navigation";
import DashboardDbApp from "@/components/dashboard-db-app";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/auth/sign-in");
  }

  return <DashboardDbApp />;
}
