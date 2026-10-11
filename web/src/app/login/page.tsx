"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Stethoscope } from "lucide-react";
import { copy } from "@/copy/nurse.id";
import { Alert, AppBar, Button, Card, TextInput } from "@/components/ui";

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
    <div className="flex min-h-dvh flex-col">
      <AppBar title={copy.appName} icon={Stethoscope} className="max-w-md" />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6">
        <Card>
          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div>
              <h1 className="text-2xl font-bold text-ink">{copy.login.title}</h1>
              <p className="mt-1 text-base text-ink-muted">{copy.login.subtitle}</p>
            </div>

            <TextInput
              label={copy.login.emailLabel}
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <TextInput
              label={copy.login.passwordLabel}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && (
              <Alert tone="danger" role="alert">
                {error}
              </Alert>
            )}

            <Button type="submit" block icon={LogIn} loading={loading}>
              {copy.login.submit}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
