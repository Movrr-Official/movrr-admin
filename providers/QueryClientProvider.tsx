"use client";

import {
  QueryClient,
  QueryClientProvider as ReactQueryClientProvider,
} from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PropsWithChildren, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-client";

const QueryClientProvider = ({ children }: PropsWithChildren) => {
  const router = useRouter();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    let identity: string | null | undefined;
    const { data: { subscription } } = createSupabaseBrowserClient().auth.onAuthStateChange((event, session) => {
      const nextIdentity = session?.user.id ?? null;
      if (event === "SIGNED_OUT" || (identity !== undefined && identity !== nextIdentity)) {
        // clear() cancels/removes in-flight reads as well as all private results.
        queryClient.clear();
        router.refresh();
      }
      identity = nextIdentity;
    });
    return () => subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </ReactQueryClientProvider>
  );
};

export default QueryClientProvider;
