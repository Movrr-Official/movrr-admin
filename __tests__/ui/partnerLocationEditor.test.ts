import { it, expect, vi } from "vitest";
vi.mock("@/lib/platformApi/client", () => ({ platformGet: vi.fn(), platformPost: vi.fn() }));
import { PartnerLocationsPanel } from "@/components/rewards/partners/PartnerLocationsPanel";
it("uses an organisation-specific editor identity so selected/form/loading state cannot migrate", () => { const a = PartnerLocationsPanel({ organisationId: "a" }); const b = PartnerLocationsPanel({ organisationId: "b" }); expect(a.key).toBe("a"); expect(b.key).toBe("b"); expect(a.props.organisationId).toBe("a"); expect(b.props.organisationId).toBe("b"); });
