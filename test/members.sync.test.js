import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMembersService } from '../src/features/members/members.service.js';
import { createCafesService } from '../src/features/cafes/cafes.service.js';

// ---------- members: 정모 동기화 + 유령 정리 가드 ----------

function fakeDb() {
  return {
    query: async () => ({ rows: [] }),
    transaction: async (cb) => cb({ query: async () => ({ rows: [] }) }),
  };
}

function fakeQueries(overrides = {}) {
  const calls = { upsertEvent: [], prune: [], pruneMembers: [] };
  return {
    calls,
    upsertMembers: async () => ({ count: 1, ids: ['m-1'] }),
    pruneStaleMembers: async (_c, _url, keepIds) => {
      calls.pruneMembers.push(keepIds);
      return 3;
    },
    insertSyncLog: async () => 'log-1',
    upsertEvent: async (_c, event) => {
      calls.upsertEvent.push(event);
      return `event-${calls.upsertEvent.length}`;
    },
    pruneStaleFutureEvents: async (_c, _url, keepIds) => {
      calls.prune.push(keepIds);
      return 2;
    },
    ...overrides,
  };
}

const basePayload = {
  url: 'https://somoim.example/group',
  expected_member_count: 10,
  crawled_member_count: 10,
  members: [{ name: '이상명', bio: '' }],
};

test('syncMembers: 정모가 있으면 upsert 후 유령 정리를 호출한다', async () => {
  const queries = fakeQueries();
  const service = createMembersService(fakeDb(), queries);

  const result = await service.syncMembers({
    ...basePayload,
    events: [
      { title: '26.', attendees: [] },
      { title: '비정기', attendees: [] },
    ],
  });

  assert.equal(result.eventCount, 2);
  assert.equal(result.prunedCount, 2);
  assert.deepEqual(queries.calls.prune, [['event-1', 'event-2']]);
});

test('syncMembers: 정모 0건(파싱 실패 가능성)이면 유령 정리를 건너뛴다', async () => {
  const queries = fakeQueries();
  const service = createMembersService(fakeDb(), queries);

  const result = await service.syncMembers({ ...basePayload, events: [] });

  assert.equal(result.eventCount, 0);
  assert.equal(result.prunedCount, 0);
  assert.equal(queries.calls.prune.length, 0, '오삭제 방지: prune 미호출');
});

test('syncMembers: upsert 후 나간 멤버 정리를 keepIds로 호출한다', async () => {
  const queries = fakeQueries();
  const service = createMembersService(fakeDb(), queries);

  const result = await service.syncMembers(basePayload);

  assert.equal(result.prunedMemberCount, 3);
  assert.deepEqual(queries.calls.pruneMembers, [['m-1']]);
});

test('syncMembers: 멤버 0명(파싱 실패 가능성)이면 나간 멤버 정리를 건너뛴다', async () => {
  const queries = fakeQueries({
    upsertMembers: async () => ({ count: 0, ids: [] }),
  });
  const service = createMembersService(fakeDb(), queries);

  const result = await service.syncMembers({ ...basePayload, members: [] });

  assert.equal(result.prunedMemberCount, 0);
  assert.equal(queries.calls.pruneMembers.length, 0, '오삭제 방지: 멤버 prune 미호출');
});

test('syncMembers: events 필드가 없으면(구버전 페이로드) 정모 로직을 건너뛴다', async () => {
  const queries = fakeQueries();
  const service = createMembersService(fakeDb(), queries);

  const result = await service.syncMembers(basePayload);

  assert.equal(result.eventCount, 0);
  assert.equal(queries.calls.upsertEvent.length, 0);
});

// ---------- cafes: 코멘트 검증 ----------

function cafesDbStub({ visited = true } = {}) {
  return {
    query: async (sql) => {
      if (sql.includes('SELECT EXISTS')) {
        return { rows: [{ allowed: visited }] };
      }
      if (sql.includes('INSERT INTO cafe_comments')) {
        return { rows: [{ id: 'c-1', location: '아비아채', body: 'ok' }] };
      }
      return { rows: [] };
    },
  };
}

test('upsertComment: 빈 위치/빈 본문/121자 초과는 VALIDATION_ERROR', async () => {
  const service = createCafesService(cafesDbStub());

  for (const input of [
    { location: '  ', body: '좋아요' },
    { location: '아비아채', body: '   ' },
    { location: '아비아채', body: 'a'.repeat(121) },
  ]) {
    await assert.rejects(
      service.upsertComment({ userId: 'u-1', ...input }),
      (err) => err.code === 'VALIDATION_ERROR',
    );
  }
});

test('upsertComment: 방문 이력 없으면 COMMENT_NOT_ALLOWED', async () => {
  const service = createCafesService(cafesDbStub({ visited: false }));

  await assert.rejects(
    service.upsertComment({ userId: 'u-1', location: '아비아채', body: '좋아요' }),
    (err) => err.code === 'COMMENT_NOT_ALLOWED',
  );
});

test('upsertComment: 방문 이력 있으면 공백 정규화 후 저장', async () => {
  const service = createCafesService(cafesDbStub({ visited: true }));

  const result = await service.upsertComment({
    userId: 'u-1',
    location: ' 아비아채 ',
    body: '  콘센트   많아요  ',
  });

  assert.equal(result.id, 'c-1');
});
