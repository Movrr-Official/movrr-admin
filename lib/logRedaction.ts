const REDACTED = "[REDACTED]";
const MAX_LOG_STRING_LENGTH = 200;

const SENSITIVE_KEY_PATTERN =
  /(password|passcode|pin|token|secret|authorization|cookie|session|email|phone|lat|lon|latitude|longitude|gps|accuracy|heading|user[_-]?id|userid|supabase|apikey|api[_-]?key|refresh[_-]?token|access[_-]?token)/i;

const SENSITIVE_VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization)\s*[=:]\s*(?:bearer\s+)?[^\s&]+/gi, "$1=[REDACTED]"],
  [
    /(access[_-]?token|refresh[_-]?token|token|authorization|api[_-]?key|apikey|password|secret)=([^&\s]+)/gi,
    "$1=[REDACTED]",
  ],
  [/(bearer)\s+[\w.-]+/gi, "$1 [REDACTED]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED],
];

function sanitizeString(value: string): string {
  const sanitized = SENSITIVE_VALUE_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value,
  );

  if (sanitized.length > MAX_LOG_STRING_LENGTH) {
    return `${sanitized.slice(0, MAX_LOG_STRING_LENGTH - 3)}...`;
  }

  return sanitized;
}

export function redactLogContext(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) return REDACTED;

  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogContext(item, depth + 1));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : redactLogContext(nested, depth + 1);
    }
    return result;
  }

  return REDACTED;
}
