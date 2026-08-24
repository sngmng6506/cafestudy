import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerFeatures, validateUniqueBasePaths } from '../src/core/loadFeatures.js';

test('duplicate feature basePath fails before registration', () => {
  assert.throws(
    () => validateUniqueBasePaths([
      { name: 'first', basePath: '/api/shared' },
      { name: 'second', basePath: '/api/shared' },
    ]),
    /duplicate feature basePath.*first and second/,
  );
});

test('registerFeatures awaits onLoad before loading the next feature', async () => {
  const events = [];
  const app = {
    use(basePath) {
      events.push(`route:${basePath}`);
    },
  };
  const features = [
    {
      name: 'first',
      basePath: '/first',
      createRoutes: () => ({}),
      async onLoad() {
        events.push('first:start');
        await Promise.resolve();
        events.push('first:end');
      },
    },
    {
      name: 'second',
      basePath: '/second',
      createRoutes: () => ({}),
      onLoad() {
        events.push('second:loaded');
      },
    },
  ];

  await registerFeatures(app, {}, features);

  assert.deepEqual(events, [
    'route:/first',
    'first:start',
    'first:end',
    'route:/second',
    'second:loaded',
  ]);
});

test('registerFeatures는 ctx를 그대로 feature에 전달한다', async () => {
  const seen = [];
  const app = { use() {} };
  const ctx = { db: {}, hooks: { on() {}, emit: async () => [] } };
  const feature = {
    name: 'sample',
    basePath: '/api/sample',
    createRoutes: () => (_req, _res, next) => next(),
    onLoad: (loadedCtx) => { seen.push(loadedCtx.hooks); },
  };

  await registerFeatures(app, ctx, [feature]);

  assert.equal(seen[0], ctx.hooks, 'onLoad가 ctx.hooks를 받아야 구독할 수 있다');
});
