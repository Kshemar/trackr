import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { clearSessionCookie, setSessionCookie } from "./session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerUser(email: string, password: string) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_RE.test(normalized)) {
    return { error: "Enter a valid email address." as const };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." as const };
  }

  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (existing) {
    return { error: "An account with that email already exists." as const };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: normalized, passwordHash },
  });
  await setSessionCookie({ userId: user.id, email: user.email });
  return { user };
}

export async function loginUser(email: string, password: string) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) {
    return { error: "Invalid email or password." as const };
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { error: "Invalid email or password." as const };
  }
  await setSessionCookie({ userId: user.id, email: user.email });
  return { user };
}

export async function logoutUser() {
  await clearSessionCookie();
}
