import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSmashService } from '../src/features/smash/smash.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';

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
    updatedByName: null,
    updatedAt: null,
  });
});

test('getState: 누가 깨부쉈는지 닉네임을 함께 반환', async () => {
  const { service } = serviceWith({
    flag: { value: true, updatedByName: '이상명', updatedAt: '2026-07-05' },
  });

  const state = await service.getState();
  assert.equal(state.smashed, true);
  assert.equal(state.updatedByName, '이상명');
});

test('toggle: 현재 값을 뒤집고 조작자를 기록한다', async () => {
  const { service, calls } = serviceWith({
    flag: { value: true, updatedByName: null, updatedAt: '2026-07-05' },
  });

  const result = await service.toggle(USER_ID);

  assert.equal(result.smashed, false);
  assert.equal(calls.toggles[0][1], USER_ID);
});
