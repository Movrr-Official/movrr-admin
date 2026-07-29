import { describe, it, expect, vi, beforeEach } from "vitest";
import { platformGet, platformPost } from "@/lib/platformApi/client";

describe("platformApi client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("maps 409 to ConcurrencyConflict", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { kind: "ConcurrencyConflict", message: "version mismatch" },
          correlationId: "corr-409",
        }),
        {
          status: 409,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "corr-409",
          },
        },
      ),
    );

    const result = await platformGet("/api/v1/fulfilment/f1", {
      fetch: fetchMock,
      correlationId: "corr-409",
      getAccessToken: async () => null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("ConcurrencyConflict");
    expect(result.message).toBe("version mismatch");
    expect(result.correlationId).toBe("corr-409");
    expect(result.status).toBe(409);
  });

  it("maps 403 to PermissionFailure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { kind: "permission_denied", message: "missing capability" },
          correlationId: "corr-403",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "corr-403",
          },
        },
      ),
    );

    const result = await platformPost("/api/v1/fulfilment/f1/cancel", {
      fetch: fetchMock,
      correlationId: "corr-403",
      body: { version: 1, reason: "ops" },
      getAccessToken: async () => null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.kind).toBe("PermissionFailure");
    expect(result.message).toBe("missing capability");
    expect(result.correlationId).toBe("corr-403");
    expect(result.status).toBe(403);
  });

  it("attaches X-Correlation-Id and uses same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "f1" }, correlationId: "client-corr" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "client-corr",
          },
        },
      ),
    );

    const result = await platformGet<{ id: string }>("/api/v1/fulfilment/f1", {
      fetch: fetchMock,
      correlationId: "client-corr",
      getAccessToken: async () => null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ id: "f1" });
    expect(result.correlationId).toBe("client-corr");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/fulfilment/f1");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("same-origin");
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Correlation-Id")).toBe("client-corr");
  });

  it("sends JSON body on platformPost with correlation header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { cancelled: true }, correlationId: "post-corr" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "post-corr",
          },
        },
      ),
    );

    const result = await platformPost<{ cancelled: boolean }>(
      "/api/v1/fulfilment/f1/cancel",
      {
        fetch: fetchMock,
        correlationId: "post-corr",
        body: { version: 2 },
        headers: { "Idempotency-Key": "idem-1" },
        getAccessToken: async () => null,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ cancelled: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.body).toBe(JSON.stringify({ version: 2 }));
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Correlation-Id")).toBe("post-corr");
    expect(headers.get("Idempotency-Key")).toBe("idem-1");
  });

  it("attaches Authorization Bearer from getAccessToken when not provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "f1" }, correlationId: "auth-corr" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "auth-corr",
          },
        },
      ),
    );

    const getAccessToken = vi.fn().mockResolvedValue("session-jwt-token");

    const result = await platformGet<{ id: string }>("/api/v1/fulfilment/f1", {
      fetch: fetchMock,
      correlationId: "auth-corr",
      getAccessToken,
    });

    expect(result.ok).toBe(true);
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer session-jwt-token");
  });

  it("does not override an explicit Authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ data: { id: "f1" }, correlationId: "auth-corr" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "auth-corr",
          },
        },
      ),
    );

    const getAccessToken = vi.fn().mockResolvedValue("session-jwt-token");

    await platformGet<{ id: string }>("/api/v1/fulfilment/f1", {
      fetch: fetchMock,
      correlationId: "auth-corr",
      headers: { Authorization: "Bearer explicit-token" },
      getAccessToken,
    });

    expect(getAccessToken).not.toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer explicit-token");
  });
});
