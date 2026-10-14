export type ManagedWriteRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function coordinatedManagedFetch(options: {
  rpc: ManagedWriteRpc;
  actor: () => Promise<string>;
  fetch?: typeof fetch;
}): typeof fetch {
  const transport = options.fetch ?? globalThis.fetch;
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const managed = url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/storage/v1/');
    if (!managed || method === 'GET' || method === 'HEAD') return transport(request);
    const path = decodeURIComponent(url.pathname);
    const subjects = new Set<string>();
    let identity: Record<string, unknown> = {};

    if (path.startsWith('/auth/v1/admin/')) {
      const target = path.split("/users/")[1]?.split("/")[0];
      if (target && uuid.test(target)) subjects.add(target);
      if (request.headers.get('content-type')?.includes('application/json')) {
        const body: unknown = await request.clone().json();
        if (body && typeof body === 'object' && !Array.isArray(body)) {
          const data = body as Record<string, unknown>;
          identity = Object.fromEntries(['id', 'email', 'phone', 'user_id'].filter(key => typeof data[key] === 'string').map(key => [key, data[key]]));
          if (typeof data.user_id === 'string' && uuid.test(data.user_id)) subjects.add(data.user_id);
        }
      }
      if (!subjects.size && !identity.email && !identity.phone) throw new Error('managed_write_scope_required');
    } else if (path.startsWith('/storage/v1/object/')) {
      const parts = path.slice('/storage/v1/object/'.length).split('/');
      if (method === 'DELETE' && parts.length === 1) {
        const body: unknown = await request.clone().json();
        const prefixes = body && typeof body === 'object' ? (body as Record<string, unknown>).prefixes : undefined;
        if (!Array.isArray(prefixes) || !prefixes.length) throw new Error('managed_write_scope_required');
        for (const prefix of prefixes) {
          const subject = typeof prefix === 'string' ? prefix.split('/')[0] : '';
          if (!uuid.test(subject)) throw new Error('managed_write_scope_required');
          subjects.add(subject);
        }
      } else {
        if (!['POST', 'PUT'].includes(method) || parts.length < 3 || !uuid.test(parts[1])) throw new Error('managed_write_scope_required');
        subjects.add(parts[1]);
      }
    } else throw new Error('uncoordinated_managed_write_rejected');
    const resource = path + '?subjects=' + encodeURIComponent([...subjects].sort().join(',')) + '&alias=' + encodeURIComponent(String(identity.email ?? identity.phone ?? '').toLowerCase());
    const actor = await options.actor();
    if (!uuid.test(actor)) throw new Error('authenticated_managed_writer_required');
    const acquired = await options.rpc('acquire_account_managed_write', {
      p_id: crypto.randomUUID(), p_actor: actor, p_subjects: [...subjects], p_identity: identity, p_resource: resource, p_method: method,
    });
    const permit = acquired.data as { id?: string; token?: string } | null;
    if (acquired.error || !permit?.id || !permit.token) throw new Error('managed_write_permit_unavailable');
    const args = { p_id: permit.id, p_token: permit.token };
    const dispatched = await options.rpc('dispatch_account_managed_write', args);
    if (dispatched.error || dispatched.data !== true) {
      try { await options.rpc('finish_account_managed_write', { ...args, p_outcome: 'cancelled' }); } catch { /* A possibly dispatched operation remains held. */ }
      throw new Error('managed_write_dispatch_rejected');
    }
    try {
      const response = await transport(request);
      // Consume a clone before release: a headers-only response is not a completed acknowledgement.
      await response.clone().arrayBuffer();
      const finished = await options.rpc('finish_account_managed_write', { ...args, p_outcome: response.ok ? 'acknowledged' : 'uncertain' });
      if (finished.error || finished.data !== true) throw new Error('managed_write_outcome_unresolved');
      return response;
    } catch (error) {
      // Network errors/abort/failed release retain a durable hold; no automatic takeover.
      try { await options.rpc('finish_account_managed_write', { ...args, p_outcome: 'uncertain' }); } catch { /* Durable in-flight hold remains. */ }
      throw error;
    }
  };
}

// Worker writes retain the existing exact-job journal and claim fencing.
export function fencedManagedFetch(authorize: (request: Request) => Promise<void>, transport: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if ((path.startsWith('/auth/v1/') || path.startsWith('/storage/v1/')) && !['GET', 'HEAD'].includes(request.method)) await authorize(request.clone());
    return transport(request);
  };
}
