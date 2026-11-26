import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SettingsRowsSkeleton } from "@/components/settings/settings-access";
import { getUser } from "@/lib/auth/dal";
import { groupSettingsHref } from "@/lib/routes";
import { isDid, signInHref } from "@/lib/validate";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

async function RedirectToProfileSettings({
  params,
}: Pick<PageProps<"/[actor]/edit">, "params">): Promise<never> {
  const did = decodeURIComponent((await params).actor);
  if (!isDid(did)) notFound();
  const user = await getUser();
  if (!user) redirect(signInHref(`/${did}/edit`));
  if (did === user.did) redirect("/settings/profile");
  redirect(`${groupSettingsHref(did)}/profile`);
}

export default function EditProfilePage(props: PageProps<"/[actor]/edit">) {
  return (
    <div className="page">
      <Suspense fallback={<SettingsRowsSkeleton rows={4} />}>
        <RedirectToProfileSettings params={props.params} />
      </Suspense>
    </div>
  );
}
