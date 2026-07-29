"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sync a details drawer selection with a URL query param (default `id`),
 * matching Partner Operations deep-links: `/path?id=<uuid>`.
 */
export function useDrawerQueryId(paramKey = "id") {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get(paramKey);

  const setSelectedId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set(paramKey, id);
      else params.delete(paramKey);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [paramKey, pathname, router, searchParams],
  );

  return { selectedId, setSelectedId } as const;
}
