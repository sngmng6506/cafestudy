import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSmashService } from '../src/features/smash/smash.service.js';

function serviceWith({ flag = null } = {}) {
  const calls = { toggles: [] };
  const db = {
    query: async (sql, params = []) => {
      if (sql.includes('INSERT INTO app_flags')) {
        calls.toggles.push(params);
        const value = flag ? !flag.value : true;
        return { rows: [{ value, updatedAt: new Date().toISOString() }] };
      }
      if (sql.includes('FROM app_flags')) {
        return { rows: flag ? [flag] : [] };
      }
      return { rows: [] };
    },
  };

  return { service: createSmashService({ db }), calls };
}

test('getState: 기록이 없으면 안 깨진 상태', async () => {
  const { service } = serviceWith();

  assert.deepEqual(await service.getState(), {
    smashed: false,
    updatedAt: null,
  });
});

test('getState: 조작자 정보를 노출하지 않는다 (익명)', async () => {
  const { service } = serviceWith({
    flag: { value: true, updatedAt: '2026-07-05' },
  });

  const state = await service.getState();
  assert.deepEqual(Object.keys(state).sort(), ['smashed', 'updatedAt']);
  assert.equal(state.smashed, true);
});

test('toggle: 현재 값을 뒤집고 조작자를 기록하지 않는다', async () => {
  const { service, calls } = serviceWith({
    flag: { value: true, updatedAt: '2026-07-05' },
  });

  const result = await service.toggle();

  assert.equal(result.smashed, false);
  // 파라미터는 key 하나뿐 — user id가 넘어가지 않는다.
  assert.deepEqual(calls.toggles[0], ['smashed']);
});
