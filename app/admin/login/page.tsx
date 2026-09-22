"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type FieldErrors = Partial<Record<"email" | "password", string[]>>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setErrors({});
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fields) setErrors(data.fields);
        setFormError(data.error || "Login failed");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8">
      <div className="card card-solar w-full max-w-md">
        <div className="mb-5 flex items-center gap-3">
          <span className="logo-ripple">
            <Image
              src="/logo.png"
              alt="ARVEX"
              width={48}
              height={48}
              className="rounded-full"
            />
          </span>
          <div>
            <h1 className="text-xl font-bold">
              <span className="text-gradient-gold">Admin Login</span>
            </h1>
            <p className="text-2xs tracking-label text-muted">ARVEX · secure panel</p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@multicore.live"
              required
              suppressHydrationWarning
            />
            {errors.email?.[0] && <span className="error-text">{errors.email[0]}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              suppressHydrationWarning
            />
            {errors.password?.[0] && <span className="error-text">{errors.password[0]}</span>}
          </div>

          {formError && <p className="error-text">{formError}</p>}

          <button className="btn btn-primary btn-block" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/">← Back to dApp</Link>
        </p>
      </div>
    </div>
  );
}
