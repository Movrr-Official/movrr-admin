export type ApplicationResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: string; message: string };

export function ok<T>(value: T): ApplicationResult<T> {
  return { ok: true, value };
}

export function fail(kind: string, message: string): ApplicationResult<never> {
  return { ok: false, kind, message };
}
