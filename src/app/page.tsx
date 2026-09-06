import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect("/inbox");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="font-mono text-xs tracking-[0.2em] text-[#8b97a8] uppercase">Not a ticker tape</p>
      <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Trackr
      </h1>
      <p className="mt-5 max-w-xl text-lg text-[#8b97a8]">
        Track your stocks with a watchlist that remembers when you last paid attention. Come back later
        and see what actually moved — versus the market, not just versus yesterday.
      </p>
      <ul className="mt-8 space-y-2 text-sm text-[#c5ced9]">
        <li>— Ranked by change since you last checked, not alphabetically</li>
        <li>— Excess return vs SPY so a beta-1 rally does not look like news</li>
        <li>— Delayed and cached quotes are labeled, never dressed up as live</li>
      </ul>
      <div className="mt-10 flex gap-3">
        <Link
          href="/register"
          className="rounded-full bg-[#e8edf4] px-5 py-2.5 text-sm font-medium text-[#0b0d10]"
        >
          Create account
        </Link>
        <Link href="/login" className="rounded-full border border-[#232a34] px-5 py-2.5 text-sm">
          Sign in
        </Link>
      </div>
      <p className="mt-12 text-xs text-[#8b97a8]">
        Free delayed data. Not investment advice. For research and personal use only.
      </p>
    </main>
  );
}
