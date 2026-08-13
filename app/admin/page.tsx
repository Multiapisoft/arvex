"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "superadmin";
  createdAt: string;
  updatedAt: string;
};

type Me = { id: string; email: string; name: string; role: "admin" | "superadmin" };

export default function AdminDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/auth/me");
      const meData = await meRes.json();
      if (!meRes.ok || !meData.ok) {
        router.replace("/admin/login");
        return;
      }
      setMe(meData.user);

      const usersRes = await fetch("/api/admin/users");
      const usersData = await usersRes.json();
      if (usersRes.ok && usersData.ok) setUsers(usersData.users);
    } catch {
      setError("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setMessage("");
    setFieldErrors({});
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fields) setFieldErrors(data.fields);
        setError(data.error || "Could not create user");
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setRole("admin");
      setMessage("Admin user created");
      await load();
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function removeUser(id: string) {
    if (!confirm("Delete this admin user?")) return;
    setError("");
    const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setMessage("User deleted");
    await load();
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <span className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar hidden md:flex">
        <Link href="/admin" className="flex items-center gap-2.5 px-1.5">
          <span className="logo-ripple">
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded-full" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-brand">
              <span className="text-leaf-400">FALCON</span> ADMIN
            </span>
            <span className="mt-1 text-2xs tracking-label text-muted">User management</span>
          </span>
        </Link>
        <span className="badge badge-green mt-4 self-start">Owner console</span>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          <span className="nav-link nav-link-admin" data-active="true">
            Users
          </span>
          <Link href="/" className="nav-link">
            Open dApp
          </Link>
        </nav>
        <div className="mt-4 px-1.5">
          <p className="text-2xs text-muted">
            Signed in as
            <br />
            <strong className="text-foreground">{me?.name}</strong>
            <br />
            {me?.email}
          </p>
          <span className="badge badge-green mt-2">{me?.role}</span>
          <button className="btn btn-danger btn-sm mt-3" type="button" onClick={() => void logout()}>
            Logout
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="topbar">
          <h1 className="text-lg font-semibold text-foreground">Admin Users</h1>
          <button className="btn btn-danger btn-sm md:hidden" type="button" onClick={() => void logout()}>
            Logout
          </button>
        </header>

        <main className="flex-1 px-4 py-5 md:px-6">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gradient-gold">Admin Users</h2>
              <p className="text-sm text-muted">
                Authenticated management panel with validation.
              </p>
            </div>

            {error && <p className="error-text">{error}</p>}
            {message && <p className="text-sm text-success">{message}</p>}

            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Registered Admins ({users.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{u.email}</td>
                        <td>
                          <span className="badge badge-green">{u.role}</span>
                        </td>
                        <td>{new Date(u.createdAt).toLocaleString()}</td>
                        <td>
                          {me?.role === "superadmin" && me.id !== u.id && (
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              onClick={() => void removeUser(u.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {me?.role === "superadmin" && (
              <div className="card card-green">
                <h2 className="card-title">Create Admin User</h2>
                <form onSubmit={createUser} noValidate className="mt-3">
                  <div className="grid-two">
                    <div className="field">
                      <label className="label">Name</label>
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
                      {fieldErrors.name?.[0] && <span className="error-text">{fieldErrors.name[0]}</span>}
                    </div>
                    <div className="field">
                      <label className="label">Email</label>
                      <input
                        className="input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                      {fieldErrors.email?.[0] && <span className="error-text">{fieldErrors.email[0]}</span>}
                    </div>
                    <div className="field">
                      <label className="label">Password</label>
                      <input
                        className="input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        placeholder="Min 8 chars, upper/lower/number/symbol"
                      />
                      {fieldErrors.password?.[0] && (
                        <span className="error-text">{fieldErrors.password[0]}</span>
                      )}
                    </div>
                    <div className="field">
                      <label className="label">Role</label>
                      <select
                        className="input"
                        value={role}
                        onChange={(e) => setRole(e.target.value as "admin" | "superadmin")}
                      >
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button className="btn btn-green" type="submit" disabled={creating}>
                      {creating ? "Creating…" : "Create User"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
