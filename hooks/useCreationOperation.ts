"use client";
import { useRef } from "react";

// The token is invisible to the UI. Retain it through errors/lost responses,
// and replace it only after a confirmed success or a different submitted intent.
export function useCreationOperation(storageKey?: string) {
  const pending = useRef<{ fingerprint: string; id: string } | null>(null);
  return {
    operationId(input: unknown) {
      const fingerprint = JSON.stringify(input);
      if (!pending.current && storageKey) {
        try { pending.current = JSON.parse(sessionStorage.getItem(`movrr.creation.${storageKey}`) ?? "null"); } catch { /* Storage may be disabled. */ }
      }
      if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, id: crypto.randomUUID() };
      if (storageKey) { try { sessionStorage.setItem(`movrr.creation.${storageKey}`, JSON.stringify(pending.current)); } catch { /* The server journal still protects this request. */ } }
      return pending.current.id;
    },
    complete() {
      pending.current = null;
      if (storageKey) { try { sessionStorage.removeItem(`movrr.creation.${storageKey}`); } catch { /* Storage may be disabled. */ } }
    },
  };
}
