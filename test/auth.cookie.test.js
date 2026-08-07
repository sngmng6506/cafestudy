import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuth } from '../src/core/auth.js';
import { serializeSessionCookie } from '../src/features/auth/auth.routes.js';
import { hashOpaqueToken } from '../src/features/auth/auth.util.js';

function request(headers = {}) {
  return { header(name) { return headers[name.toLowerCase()] ?? ''; } };
}

test('session cookie is HttpOnly, SameSite and Secure in production', () => {
  const value = serializeSessionCookie('secret', {
    cookieName: 'session',
    secureCookie: true,
    maxAgeMs: 60_000,
  });
  assert.match(value, /^session=secret;/);
  assert.match(value, /HttpOnly/);
  assert.match(value, /SameSite=Lax/);
  assert.match(value, /Secure/);
  assert.match(value, /Max-Age=60/);
});

test('auth resolves the cookie by its database hash and ignores bearer in production', async () => {
  const rawToken = 'browser-secret';
  const seen = [];
  const auth = createAuth({
    env: 'production',
    config: { cookieName: 'session', allowBearerAuth: false },
    db: {
      async query(_sql, params) {
        seen.push(params[0]);
        if (params[0] === hashOpaqueToken(rawToken)) {
          return { rows: [{ id: 'user-1', adminRole: 'member' }] };
        }
        return { rows: [] };
      },
    },
  });
  const req = request({
    cookie: `session=${rawToken}`,
    authorization: 'Bearer stolen-legacy-token',
  });
  await new Promise((resolve, reject) => auth.resolveUser(req, {}, (error) => error ? reject(error) : resolve()));
  assert.equal(req.user.id, 'user-1');
  assert.deepEqual(seen, [hashOpaqueToken(rawToken)]);
});
