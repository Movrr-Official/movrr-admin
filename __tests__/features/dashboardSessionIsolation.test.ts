import { expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const state = vi.hoisted(() => ({ effect: undefined as undefined | (() => (() => void)), listener: undefined as undefined | ((event: string, session: {user:{id:string}} | null) => void), refresh: vi.fn(), unsubscribe: vi.fn(), client: undefined as unknown }));
vi.mock("react", async importOriginal => {
  const original = await importOriginal<typeof import("react")>();
  return { ...original, useState: (init: () => unknown) => { state.client = init(); return [state.client]; }, useEffect: (effect: () => (() => void)) => {state.effect = effect;} };
});
vi.mock("next/navigation", () => ({useRouter: () => ({refresh:state.refresh})}));
vi.mock("@/lib/supabase-client", () => ({createSupabaseBrowserClient: () => ({auth:{onAuthStateChange:(listener: typeof state.listener) => {state.listener=listener; return {data:{subscription:{unsubscribe:state.unsubscribe}}};}}})}));
import Provider from "@/providers/QueryClientProvider";
it("removes private results and cancels in-flight reads on account switch and logout", async () => {
  Provider({children:null});
  const cleanup = state.effect!();
  const client = state.client as QueryClient;
  state.listener!("INITIAL_SESSION", {user:{id:"a"}});
  client.setQueryData(["wallet"], {owner:"a",points:42});
  let release!: (value: unknown) => void;
  const pending = client.fetchQuery({queryKey:["users"],queryFn:()=>new Promise(resolve=>{release=resolve;})}).catch(()=>undefined);
  state.listener!("SIGNED_IN", {user:{id:"b"}});
  release([{owner:"a"}]);
  await pending;
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  client.setQueryData(["wallet"], {owner:"b",points:7});
  state.listener!("SIGNED_OUT", null);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  expect(state.refresh).toHaveBeenCalledTimes(2);
  cleanup();
  expect(state.unsubscribe).toHaveBeenCalled();
});
