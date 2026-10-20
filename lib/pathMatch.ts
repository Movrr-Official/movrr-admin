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
  // These exact Platform paths enforce bearer identity and capabilities in their
  // handlers. Partner commands additionally authorize the actual target in SQL.
  return (
    pathname === "/api/v1/wallet/statement" ||
    pathname === "/api/v1/government/me" ||
    pathname.startsWith("/api/sessions/") ||
    /^\/api\/v1\/(?:partners\/(?:locations|me|resources|validate|collections\/confirm|fulfilments\/pending|rewards(?:\/[^/]+)?|settings|staff)|wallet\/(?:balance|transactions)|rewards\/(?:catalog(?:\/[^/]+)?|redeem|redemptions(?:\/[^/]+)?)|riders\/me\/(?:rides|achievements|accessories|brands|impact)|riders\/me\/campaigns(?:\/(?:opt-in|withdraw|confirm))?|community-rides(?:\/[^/]+(?:\/(?:join|leave|cancel))?)?|fulfilment(?:\/tokens\/consume|\/[^/]+(?:\/(?:timeline|token|cancel|refund|confirm-collection|retry))?)?)$/.test(
      pathname,
    )
  );
}
