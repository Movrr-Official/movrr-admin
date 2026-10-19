import { expect, it } from "vitest";
import { getCapabilitiesForRole } from "@/lib/authPermissions";
import { canAccessPage } from "@/features/authorization/dashboardRegistry";
import { filterGeneratedNavigation, generateNavigationFromCapabilities } from "@/features/authorization/navigation";
it("lets security controllers reach the Rewards control without granting catalog creation", () => {
  const capabilities = getCapabilitiesForRole("security_admin");
  expect(capabilities).toContain("settings.security");expect(capabilities).not.toContain("rewards.manage");
  expect(canAccessPage("/rewards", capabilities)).toBe(true);
  expect(canAccessPage("/rewards/catalog/create", capabilities)).toBe(false);
  expect(filterGeneratedNavigation(generateNavigationFromCapabilities(), capabilities).some(x => x.type === "item" && x.href === "/rewards")).toBe(true);
});
