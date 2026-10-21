import { describe, expect, it } from "vitest";
import { accountCreationSchema } from "@/features/identity/domain/accountCreation";
import { productProvisioningSchema } from "@/features/identity/application/productProvisioning";

const user = { domain: "user", email: "ordinary@example.test", name: "Ordinary User" };
describe("shared Admin creation contract", () => {
  it("accepts User-only creation without a role, organisation or Rider fields", () => {
    const parsed = accountCreationSchema.parse(user);
    expect(parsed.role).toBeUndefined(); expect(parsed.organisationId).toBeUndefined();
    expect(parsed.domain).toBe("user");
  });
  it.each(["rider", "support_agent", "owner", "partner_operations_manager"])("does not turn User-only creation into %s", role => {
    expect(accountCreationSchema.safeParse({ ...user, role }).success).toBe(false);
  });
  it("rejects an organisation on User-only creation and requires it only for explicit external access", () => {
    const organisationId = "11111111-1111-4111-8111-111111111111";
    expect(accountCreationSchema.safeParse({ ...user, organisationId }).success).toBe(false);
    for (const domain of ["partner", "advertiser", "government"]) {
      expect(accountCreationSchema.safeParse({ ...user, domain, role: "viewer" }).success).toBe(false);
      expect(accountCreationSchema.safeParse({ ...user, domain, role: "viewer", organisationId }).success).toBe(true);
    }
  });
  it("accepts explicit Rider and Staff creation with no organisation", () => {
    expect(accountCreationSchema.safeParse({ ...user, domain: "rider", role: "rider", city: "Amsterdam", country: "NL" }).success).toBe(true);
    expect(accountCreationSchema.safeParse({ ...user, domain: "staff", role: "support_agent" }).success).toBe(true);
  });
  it("does not persist a fabricated product role for User-only provisioning", () => {
    const input = { email: user.email, name: user.name, role: null, status: "active", languagePreference: "en", isVerified: false };
    expect(productProvisioningSchema.parse(input).role).toBeNull();
    expect(productProvisioningSchema.safeParse({ ...input, role: "user" }).success).toBe(false);
    expect(productProvisioningSchema.safeParse({ ...input, city: "Amsterdam" }).success).toBe(false);
  });
});
