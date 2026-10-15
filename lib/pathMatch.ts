/**
 * True when `pathname` is exactly `prefix` or a nested path under it.
 * Avoids false positives like `/authorization` matching `/auth`.
 */
export function matchesPathPrefix(pathname: string, prefix: string): boolean {
  if (!pathname || !prefix) return false;
  if (pathname === prefix) return true;
  const normalized = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  return pathname.startsWith(`${normalized}/`);
}

export function matchesAnyPathPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function isRiderApiPath(pathname: string): boolean {
  // These rider routes enforce JWT identity and capabilities in their handlers.
  // Match complete paths so operational mutations retain dashboard protection.
  return (
    pathname.startsWith("/api/sessions/") ||
    /^\/api\/v1\/(?:partners\/locations|wallet\/(?:balance|transactions)|rewards\/(?:catalog(?:\/[^/]+)?|redeem|redemptions(?:\/[^/]+)?)|riders\/me\/campaigns(?:\/(?:opt-in|withdraw|confirm))?|community-rides(?:\/[^/]+\/join)?|fulfilment\/[^/]+(?:\/(?:timeline|token))?)$/.test(
      pathname,
    )
  );
}
