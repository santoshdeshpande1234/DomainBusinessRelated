import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM. ENCRYPTION_KEY is 32 bytes, base64. Output: base64(iv | tag | ciphertext).
function key(raw: string) {
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encrypt(plain: string, rawKey: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64");
}

export function decrypt(token: string, rawKey: string) {
  const buf = Buffer.from(token, "base64");
  const d = createDecipheriv("aes-256-gcm", key(rawKey), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

/** What the UI may show of a stored value: secrets keep only their last 4 characters. */
export function mask(value: string, secret: boolean) {
  if (!secret) return value;
  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}
