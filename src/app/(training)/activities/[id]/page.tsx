import { ActivityDetail } from "@/features/activities/activity-detail";
export const metadata = { title: "Activity details" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ActivityDetail id={id} />;
}
