"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { copy } from "@/copy/nurse.id";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        router.push("/nurse");
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? copy.login.invalidCredentials);
    } catch {
      setError(copy.login.invalidCredentials);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-black/10 p-6"
      >
        <div>
          <h1 className="text-xl font-semibold">{copy.login.title}</h1>
          <p className="text-sm text-black/60">{copy.login.subtitle}</p>
        </div>

        <label className="block text-sm">
          {copy.login.emailLabel}
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 px-3 py-2"
          />
        </label>

        <label className="block text-sm">
          {copy.login.passwordLabel}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-black/20 px-3 py-2"
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {copy.login.submit}
        </button>
      </form>
    </main>
  );
}
