export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { allEquipment } from "@/lib/exercises";
import { getProfile } from "@/lib/data";
import OnboardingWizard from "./OnboardingWizard";

export default async function OnboardingPage() {
  const profile = await getProfile();
  if (profile) redirect("/");
  return <OnboardingWizard allEquipment={allEquipment} />;
}
