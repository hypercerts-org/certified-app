import { permanentRedirect } from "next/navigation";

/** Updates are on the project's Overview now, with everything else that happened in it. */
export default async function Page({ params }: PageProps<"/[actor]/project/[rkey]/updates">) {
  const { actor, rkey } = await params;
  permanentRedirect(`/${actor}/project/${rkey}`);
}
