const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/shared/institution-time.ts'), 'utf8');
const context = { exports: {}, require };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText, context);
const { institutionInstant, institutionWallTime } = context.exports;

for (const [zone, wall, iso] of [
  ['America/Sao_Paulo', '2026-11-26 12:00:00', '2026-11-26T15:00:00.000Z'],
  ['Asia/Ho_Chi_Minh', '2026-11-26 12:00:00', '2026-11-26T05:00:00.000Z'],
  ['Asia/Jakarta', '2026-11-26 12:00:00', '2026-11-26T05:00:00.000Z'],
  ['America/Sao_Paulo', '2026-11-26 23:30:00', '2026-11-27T02:30:00.000Z'],
  ['Asia/Jakarta', '2026-11-26 00:30:00', '2026-11-25T17:30:00.000Z'],
  ['America/Manaus', '2026-11-26 12:00:00', '2026-11-26T16:00:00.000Z'],
]) {
  test(`${zone}: ${wall} round trips through ${iso}`, () => {
    assert.equal(institutionInstant(wall, zone), iso);
    assert.equal(institutionWallTime(iso, zone), wall);
  });
}
for (const [name, wall, zone] of [
  ['invalid calendar date', '2026-02-30 12:00:00', 'America/Sao_Paulo'],
  ['DST nonexistent time', '2026-03-08 02:30:00', 'America/New_York'],
  ['DST ambiguous time', '2026-11-01 01:30:00', 'America/New_York'],
]) {
  test(`rejects ${name}`, () => assert.throws(() => institutionInstant(wall, zone)));
}
