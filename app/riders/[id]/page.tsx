import { redirect } from "next/navigation";

export default async function RiderDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/riders?selected=${id}`);
}
