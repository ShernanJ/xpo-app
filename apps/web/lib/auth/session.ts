import { SignJWT, jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "sx_session";
const JWT_ALGORITHM = "HS256";
const SESSION_DURATION_DAYS = 90;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email?: string | null;
}

/** Signs and returns a JWT string for a given auth user identity. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_DAYS}d`)
    .sign(getSecret());
}

/** Verifies the JWT and returns the payload, or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      email: payload.email ? (payload.email as string) : null,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = AUTH_COOKIE_NAME;
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_DAYS * 24 * 60 * 60;
