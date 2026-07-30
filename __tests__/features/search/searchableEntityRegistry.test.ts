import { describe, expect, it } from "vitest";
import { ADMIN_ENTITY_ROUTES } from "@/lib/adminEntityRoutes";
import { canAccessSearchableEntity } from "@/lib/search/access";
import {
  SEARCHABLE_ENTITY_REGISTRY,
  listActiveSearchableEntities,
} from "@/lib/search/registry";

describe("Searchable Entity Registry navigation contracts", () => {
  it("emits drawer ?id= URLs for Users, Campaigns, and Riders", () => {
    const id = "11111111-1111-1111-1111-111111111111";

    expect(SEARCHABLE_ENTITY_REGISTRY.user.navigation.href(id)).toBe(
      `/users?id=${id}`,
    );
    expect(SEARCHABLE_ENTITY_REGISTRY.campaign.navigation.href(id)).toBe(
      `/campaigns?id=${id}`,
    );
    expect(SEARCHABLE_ENTITY_REGISTRY.rider.navigation.href(id)).toBe(
      `/riders?id=${id}`,
    );
  });

  it("uses existing Admin IA paths for partners, organisations, and rewards", () => {
    const id = "22222222-2222-2222-2222-222222222222";

    expect(SEARCHABLE_ENTITY_REGISTRY.partner.navigation.href(id)).toBe(
      ADMIN_ENTITY_ROUTES.partnerDetail(id),
    );
    expect(SEARCHABLE_ENTITY_REGISTRY.organisation.navigation.href(id)).toBe(
      ADMIN_ENTITY_ROUTES.organisationDetail(id),
    );
    expect(SEARCHABLE_ENTITY_REGISTRY.reward_catalog.navigation.href(id)).toBe(
      `/rewards?section=catalog&id=${id}`,
    );
  });

  it("keeps fulfilment queue on a dedicated detail-page strategy", () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const entity = SEARCHABLE_ENTITY_REGISTRY.fulfilment_item;

    expect(entity.navigation.strategy).toBe("detail-page");
    expect(entity.navigation.href(id)).toBe(`/fulfilment/queue/${id}`);
  });

  it("does not use legacy path-param destinations for drawer entities", () => {
    const id = "44444444-4444-4444-4444-444444444444";

    for (const entity of listActiveSearchableEntities()) {
      const href = entity.navigation.href(id);
      expect(href).not.toMatch(new RegExp(`^/${entity.type}s?/${id}$`));
      if (entity.navigation.strategy !== "detail-page") {
        expect(href).toContain(`id=${id}`);
      }
    }
  });

  it("gates Users to admin/super_admin with users:read", () => {
    const userEntity = SEARCHABLE_ENTITY_REGISTRY.user;

    expect(canAccessSearchableEntity(userEntity, "admin")).toBe(true);
    expect(canAccessSearchableEntity(userEntity, "super_admin")).toBe(true);
    expect(canAccessSearchableEntity(userEntity, "moderator")).toBe(false);
    expect(canAccessSearchableEntity(userEntity, "support")).toBe(false);
  });

  it("allows moderators to access routes when searchable is enabled later", () => {
    const routeEntity = SEARCHABLE_ENTITY_REGISTRY.route;
    expect(canAccessSearchableEntity(routeEntity, "moderator")).toBe(true);
    expect(canAccessSearchableEntity(routeEntity, "support")).toBe(false);
  });

  it("registers Jump-to listHref for searchable and deferred entities", () => {
    expect(SEARCHABLE_ENTITY_REGISTRY.route.navigation.listHref).toBe("/routes");
    expect(SEARCHABLE_ENTITY_REGISTRY.fulfilment_item.navigation.listHref).toBe(
      "/fulfilment/queue",
    );
    expect(SEARCHABLE_ENTITY_REGISTRY.partner.navigation.listHref).toBe(
      "/fulfilment/partners",
    );
  });
});
