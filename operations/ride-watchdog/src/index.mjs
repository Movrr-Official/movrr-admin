import watchdog from '../../../scripts/ride-settlement-independent-watchdog.cjs';

export default {
  async scheduled(_event, env) {
    try {
      const result = await watchdog.check(env);
      if (!result.enabled) throw new Error('watchdog_disabled');
      console.log(JSON.stringify({ event: 'movrr_watchdog_succeeded', ...result }));
    } catch (error) {
      const categories = ['watchdog_disabled', 'watchdog_origin_invalid', 'watchdog_token_required', 'watchdog_authorization_failed', 'watchdog_monitor_unavailable', 'watchdog_monitor_disabled', 'watchdog_transport_failed'];
      const category = categories.includes(error?.message) ? error.message : 'watchdog_runtime_failed';
      console.error(JSON.stringify({ event: 'movrr_watchdog_failed', category, privateDetailsSuppressed: true }));
      throw new Error('movrr_watchdog_failed');
    }
  },
  async fetch() { return new Response('Not found', { status: 404 }); }
};
