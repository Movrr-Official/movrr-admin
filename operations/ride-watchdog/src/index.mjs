import watchdog from '../../../scripts/ride-settlement-independent-watchdog.cjs';

export default {
  async scheduled(_event, env) {
    try {
      const result = await watchdog.check(env);
      if (!result.enabled) throw new Error('watchdog_disabled');
      console.log(JSON.stringify({ event: 'movrr_watchdog_succeeded', ...result }));
    } catch {
      console.error(JSON.stringify({ event: 'movrr_watchdog_failed', privateDetailsSuppressed: true }));
      throw new Error('movrr_watchdog_failed');
    }
  },
  async fetch() { return new Response('Not found', { status: 404 }); }
};
