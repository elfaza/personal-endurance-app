import { redirect } from "next/navigation";
import { authRequired, signedIn } from "@/lib/server/auth";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function TrainingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (authRequired() && !(await signedIn())) redirect("/login");
  return (
    <Providers>
      <Shell>{children}</Shell>
    </Providers>
  );
}
