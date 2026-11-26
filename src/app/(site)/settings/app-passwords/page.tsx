import type { Metadata } from "next";
import { Suspense } from "react";
import { AppPasswordsSection } from "@/components/settings/app-passwords-section";
import {
  requirePersonalSettings,
  SettingsCardsSkeleton,
} from "@/components/settings/settings-access";
import { SettingsSection } from "@/components/settings/settings-frame";

export const metadata: Metadata = { title: "App passwords" };

async function PersonalAppPasswords() {
  const access = await requirePersonalSettings("/settings/app-passwords");
  if (!access) return null;
  return (
    <SettingsSection description="Passwords that let other AT Protocol apps sign in as you. Each is shown once, and you can revoke it any time.">
      <AppPasswordsSection />
    </SettingsSection>
  );
}

export default function PersonalAppPasswordsSettingsPage() {
  return (
    <Suspense fallback={<SettingsCardsSkeleton count={1} />}>
      <PersonalAppPasswords />
    </Suspense>
  );
}
