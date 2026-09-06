"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });
    const json = (await res.json()) as { error?: string };
    setPending(false);
    if (!res.ok) {
      setError(json.error ?? "Could not sign in.");
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="font-mono text-[11px] tracking-[0.18em] text-[#8b97a8] uppercase">Trackr</p>
      <h1 className="mt-2 text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[#8b97a8]">Same account on every device.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-[#232a34] bg-[#14181e] px-3 py-2 outline-none focus:border-[#8b97a8]"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-[#232a34] bg-[#14181e] px-3 py-2 outline-none focus:border-[#8b97a8]"
          />
        </label>
        {error ? <p className="text-sm text-[#ff6b7a]">{error}</p> : null}
        <button
          disabled={pending}
          className="w-full rounded-full bg-[#e8edf4] py-2.5 text-sm font-medium text-[#0b0d10] disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-[#8b97a8]">
        No account?{" "}
        <Link href="/register" className="text-[#e8edf4] underline">
          Register
        </Link>
      </p>
    </main>
  );
}
