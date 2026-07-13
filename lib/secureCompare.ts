import { timingSafeEqual } from "crypto";

/**
 * Constant-time comparison for bearer tokens.
 * Returns false when lengths differ without leaking timing on the secret.
 */
export function safeEqualBearerToken(
  authorizationHeader: string,
  expectedToken: string,
): boolean {
  if (!expectedToken) {
    return false;
  }

  const normalizedHeader = authorizationHeader.trim();
  const expected = `Bearer ${expectedToken}`;

  const providedBuffer = Buffer.from(normalizedHeader);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function safeEqualString(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }

  const providedBuffer = Buffer.from(a.trim());
  const expectedBuffer = Buffer.from(b.trim());

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
