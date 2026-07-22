import { NextResponse } from "next/server";
import {
  getSession,
  hashPassword,
  readAdminUsers,
  writeAdminUsers,
  type AdminUser,
} from "@/lib/auth";
import { createAdminSchema, updateAdminSchema } from "@/lib/validations";

function publicUser(u: AdminUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const users = readAdminUsers().map(publicUser);
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const users = readAdminUsers();
  const email = parsed.data.email.toLowerCase();
  if (users.some((u) => u.email === email)) {
    return NextResponse.json(
      { ok: false, error: "Email already registered" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const user: AdminUser = {
    id: `admin-${Date.now()}`,
    email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
    createdAt: now,
    updatedAt: now,
  };
  users.push(user);
  writeAdminUsers(users);

  return NextResponse.json({ ok: true, user: publicUser(user) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateAdminSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        fields: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const users = readAdminUsers();
  const idx = users.findIndex((u) => u.id === parsed.data.id);
  if (idx < 0) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  if (parsed.data.name) users[idx].name = parsed.data.name;
  if (parsed.data.role) users[idx].role = parsed.data.role;
  if (parsed.data.password) {
    users[idx].passwordHash = await hashPassword(parsed.data.password);
  }
  users[idx].updatedAt = new Date().toISOString();
  writeAdminUsers(users);

  return NextResponse.json({ ok: true, user: publicUser(users[idx]) });
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }
  if (id === session.sub) {
    return NextResponse.json(
      { ok: false, error: "You cannot delete your own account" },
      { status: 400 },
    );
  }

  const users = readAdminUsers();
  const next = users.filter((u) => u.id !== id);
  if (next.length === users.length) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  writeAdminUsers(next);
  return NextResponse.json({ ok: true });
}
