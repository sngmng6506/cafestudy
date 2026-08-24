import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHooks } from '../src/core/hooks.js';

test('emit은 등록 순서대로 리스너를 부르고 반환값을 모은다', async () => {
  const hooks = createHooks();
  const order = [];
  hooks.on('meetupCreated', async (meetup) => { order.push('first'); return { jobId: `a-${meetup.id}` }; });
  hooks.on('meetupCreated', async () => { order.push('second'); return { jobId: 'b' }; });

  const results = await hooks.emit('meetupCreated', { id: '1' });

  assert.deepEqual(order, ['first', 'second']);
  assert.deepEqual(results, [{ jobId: 'a-1' }, { jobId: 'b' }]);
});

test('듣는 리스너가 없으면 빈 배열을 준다', async () => {
  const hooks = createHooks();
  assert.deepEqual(await hooks.emit('meetupCreated', {}), []);
});

test('리스너가 던져도 나머지 리스너는 계속 실행된다', async () => {
  const logged = [];
  const hooks = createHooks({ logger: { error: (event, fields) => logged.push({ event, fields }) } });
  hooks.on('meetupCreated', async () => { throw new Error('boom'); });
  hooks.on('meetupCreated', async () => ({ jobId: 'b' }));

  const results = await hooks.emit('meetupCreated', {});

  assert.deepEqual(results, [{ jobId: 'b' }], '실패한 리스너의 결과는 빠진다');
  assert.equal(logged.length, 1);
  assert.equal(logged[0].fields.event, 'meetupCreated');
  assert.match(logged[0].fields.message, /boom/);
});

test('undefined를 반환한 리스너는 결과에서 제외된다', async () => {
  const hooks = createHooks();
  hooks.on('meetupCreated', async () => undefined);
  assert.deepEqual(await hooks.emit('meetupCreated', {}), []);
});
