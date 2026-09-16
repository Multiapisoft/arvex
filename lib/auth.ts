import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const COOKIE_NAME = "fc_admin_session";
const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "admin-users.json");

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "superadmin" | "admin";
  createdAt: string;
  updatedAt: string;
};

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: AdminUser["role"];
};

function getSecret() {
  const secret = process.env.ADMIN_JWT_SECRET || "multicore-dev-secret-change-me";
  return new TextEncoder().encode(secret);
}

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function seedUsers(): AdminUser[] {
  const email = (process.env.ADMIN_EMAIL || "admin@multicore.live").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Admin@123";
  const now = new Date().toISOString();
  return [
    {
      id: "admin-1",
      email,
      name: "Multi Core Admin",
      passwordHash: bcrypt.hashSync(password, 10),
      role: "superadmin",
      createdAt: now,
      updatedAt: now,
    },
  ];
}

let memoryUsers: AdminUser[] | null = null;

export function readAdminUsers(): AdminUser[] {
  if (memoryUsers) return memoryUsers;
  if (!ensureDataDir()) {
    memoryUsers = seedUsers();
    return memoryUsers;
  }
  try {
    if (!fs.existsSync(USERS_FILE)) {
      const seeded = seedUsers();
      fs.writeFileSync(USERS_FILE, JSON.stringify(seeded, null, 2), "utf8");
      return seeded;
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as AdminUser[];
  } catch {
    memoryUsers = seedUsers();
    return memoryUsers;
  }
}

export function writeAdminUsers(users: AdminUser[]) {
  memoryUsers = users;
  if (!ensureDataDir()) return;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch {
    /* Cloudflare Workers have no persistent disk */
  }
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
