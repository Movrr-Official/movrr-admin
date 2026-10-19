// Production boundary probes only. No identity, credential or financial command.
const fs = require('node:fs'), assert = require('node:assert/strict');
const base = 'https://admin.movrr.nl';
const target = '00000000-0000-4000-8000-000000000000';
const probes = [
  ['GET', '/api/v1/rewards/catalog'], ['GET', '/api/v1/rewards/redemptions'],
  ['GET', '/api/v1/wallet/balance'], ['GET', '/api/v1/fulfilment/health'],
  ['GET', `/api/v1/fulfilment/${target}/token`],
  ['GET', '/api/v1/partners/resources'], ['POST', '/api/v1/partners/validate'],
  ['POST', '/api/v1/rewards/redeem'], ['POST', '/api/v1/fulfilment/tokens/consume'],
  ['POST', `/api/v1/fulfilment/${target}/cancel`],
  ['POST', `/api/v1/fulfilment/${target}/refund`],
  ['GET', '/api/v1/internal/jobs/fulfilment-retry'],
];
(async () => {
  const results = [];
  for (const [method, path] of probes) {
    const response = await fetch(base + path, { method, redirect: 'manual', signal: AbortSignal.timeout(20000), headers: method === 'POST' ? { 'content-type': 'application/json' } : {}, ...(method === 'POST' ? { body: '{}' } : {}) });
    assert.equal(response.status, 401, `${method} ${path}: expected unauthenticated denial`);
    results.push({ method, path, status: response.status });
    await response.arrayBuffer();
  }
  const result = { at: new Date().toISOString(), base, unauthenticatedOnly: true, financialMutations: false, probes: results };
  fs.mkdirSync('docs/verification/shop-redemption', { recursive: true });
  fs.writeFileSync('docs/verification/shop-redemption/live-boundaries.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ base, denied: results.length, financialMutations: false }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
