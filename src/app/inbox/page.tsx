import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getAttention } from "@/lib/attention";
import { InboxClient } from "./inbox-client";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const initial = await getAttention(session.userId);
  return <InboxClient email={session.email} initial={initial} />;
}
