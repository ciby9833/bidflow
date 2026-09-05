// Run after npm run build. No real emails, Redis writes or database access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AuthService } = require('../dist/modules/auth/auth.service');

function fixture(env, mode) {
  const logs = [], emails = [], stored = [];
  const auth = Object.create(AuthService.prototype);
  auth.logger = { log: message => logs.push(message) };
  auth.userRepo = { findOne: async () => null };
  auth.config = { get: (key, fallback) => ({ NODE_ENV: env, SUPPLIER_REGISTER_EMAIL_MODE: mode }[key] ?? fallback) };
  auth.redis = { setnx: async () => true, set: async (...args) => stored.push(args), del: async () => {} };
  auth.mail = { send: async message => emails.push(message) };
  auth.generateNumericCode = () => '123456';
  return { auth, logs, emails, stored };
}

test('explicit development console mode logs the code, skips SMTP and keeps API response code-free', async () => {
  const { auth, logs, emails, stored } = fixture('development', 'console');
  const response = await auth.sendSupplierRegisterEmailCode('Local@Example.test');
  assert.equal(emails.length, 0);
  assert.match(logs[0], /email=local@example.test code=123456 expiresIn=300s/);
  assert.deepEqual(response, { sent: true, expiresIn: 300, resendIn: 60 });
  assert.notEqual(stored[0][1], '123456'); // Redis still stores a hash, not plaintext.
});

for (const [env, mode] of [['production', 'console'], ['test', 'console'], [undefined, 'console'], ['development', 'smtp'], ['development', undefined]]) {
  test(`SMTP and no code logging for environment=${env}, mode=${mode}`, async () => {
    const { auth, logs, emails } = fixture(env, mode);
    await auth.sendSupplierRegisterEmailCode('local@example.test');
    assert.equal(logs.length, 0);
    assert.equal(emails.length, 1);
  });
}

test('console mode does not bypass resend cooldown', async () => {
  const { auth, logs } = fixture('development', 'console');
  auth.redis.setnx = async () => false;
  await assert.rejects(auth.sendSupplierRegisterEmailCode('local@example.test'), /too_frequent/);
  assert.equal(logs.length, 0);
});
