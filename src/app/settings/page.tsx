export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/auth";
import { getProfile } from "@/lib/data";
import { allEquipment } from "@/lib/exercises";
import SettingsForm from "./SettingsForm";

async function logout() {
  "use server";
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  redirect("/login");
}

export default async function SettingsPage() {
  const profile = await getProfile();
  if (!profile) redirect("/onboarding");
  return (
    <SettingsForm
      profile={profile}
      allEquipment={allEquipment}
      logout={logout}
    />
  );
}
