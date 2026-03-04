import { SignJWT, jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "sx_session";
const JWT_ALGORITHM = "HS256";

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  handle: string;
}

/** Signs and returns a JWT string for a given userId + handle. */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt()
    .setExpirationTime("90d")
    .sign(getSecret());
}

/** Verifies the JWT and returns the payload, or null if invalid/expired. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId as string,
      handle: payload.handle as string,
    };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = AUTH_COOKIE_NAME;
