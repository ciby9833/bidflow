const assert = require('node:assert/strict');

// Called by the isolated HTTP suite using its own institution and accounts.
module.exports = async function checkQuoteCooldowns({ call, buyerToken, supplierToken, tag }) {
  for (const type of ['routine', 'transport']) {
    for (const cooldownSeconds of [0, 60]) {
      const lineMode = type === 'transport';
      const tender = await call('POST', '/api/tenders', {
        title: `Cooldown ${type} ${cooldownSeconds} ${tag}`,
        type, cooldownSeconds, notifySuppliers: false, participationMode: 'all',
        bidDeadline: new Date(Date.now() + 86400000).toISOString(),
        lots: [{ title: 'Cooldown regression', ...(lineMode ? {
          lineColumns: [{ key: 'route', label: 'Route' }],
          lines: [{ data: { route: 'Test route' } }],
        } : { quantity: 1 }) }],
      }, buyerToken, 201);
      await call('POST', `/api/tenders/${tender.id}/publish`, {}, buyerToken, 201);
      const lot = tender.lots[0];
      const path = lineMode ? `/api/quotes/lines/${lot.lines[0].id}` : '/api/quotes';
      const payload = { totalPrice: 100, currency: 'BRL', ...(lineMode ? { items: {} } : { lotId: lot.id, idempotencyKey: `cooldown-first-${lot.id}` }) };
      await call('POST', path, payload, supplierToken, 201);
      const minePath = lineMode ? `${path}/mine` : `/api/quotes/lots/${lot.id}/mine`;
      const mine = await call('GET', minePath, undefined, supplierToken);
      assert.equal(mine.ability.canSubmit, cooldownSeconds === 0);
      const rebid = { ...payload, totalPrice: 90, ...(lineMode ? {} : { idempotencyKey: `cooldown-rebid-${lot.id}` }) };
      const result = await call('POST', path, rebid, supplierToken, cooldownSeconds === 0 ? 201 : 400);
      if (cooldownSeconds === 0) assert.equal(Number(result.quote.totalPrice), 90);
    }
  }
  console.log('PASS cooldown: zero allows immediate lot/line rebids; positive cooldown blocks both');
};
