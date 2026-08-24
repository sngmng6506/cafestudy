# 웹 모임 생성 시 소모임 정모 자동 등록 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회원이 웹에서 모임을 만들면 자동으로 소모임 자동화 job이 생겨 Bot이 소모임 앱에 정모를 대신 개설한다.

**Architecture:** feature 간 직접 import를 금지하는 규칙을 지키기 위해 composition root가 만든 이벤트 훅(`ctx.hooks`)으로 `meetups`와 `somoim-automation`을 잇는다. `emit`은 리스너 반환값을 모아 돌려주므로 `meetups`가 자기 테이블만 갱신한다. 듣는 리스너가 없으면 자동 등록도 일어나지 않는다.

**Tech Stack:** Node 22 (ESM), Express 4, PostgreSQL(raw SQL), Vue 3, `node:test`

**Spec:** `docs/superpowers/specs/2026-08-23-meetup-somoim-auto-registration-design.md`

## Global Constraints

- 커밋 메시지 형식: `<type>(<scope>): <summary>` + 빈 줄 + `Why:` + (판단이 있으면) `Decision:` + 빈 줄 + `🤖 Generated with Claude Code / claude-opus-5` + 빈 줄 + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **로컬에서 `npm run db:migrate`를 실행하지 않는다.** `DATABASE_URL`이 공유 Railway DB일 수 있다. 마이그레이션은 CI와 배포에서 적용된다.
- 마이그레이션 파일명: `migrations/YYYYMMDD_설명.sql`. 이미 적용된 파일은 수정하지 않는다.
- 응답은 `sendOk`/`sendFail`. 도메인 오류는 `src/shared/errors.js`의 `throwError(statusCode, code, message)`로 던지고 라우트는 `next(error)`만 호출한다.
- feature 간 직접 import 금지. 의존성은 `ctx`로만 주입한다.
- DB 통합 테스트는 `DATABASE_URL`이 없으면 `test.skip`으로 건너뛴다.
- 클라이언트에 새 hex 색상을 추가하지 않는다. `text-[var(--ui-color-*)]` 형태의 semantic token을 쓴다.
- 사용자 문구는 해요체. 용어사전을 따른다(`모임 만들기`, `모임 취소하기`).
- `somoim_state` 값은 정확히 `none` | `pending` | `registered` | `failed`.
- 검증 명령: `npm run check:js`, `node --test`, `npm run build`

---

### Task 1: 이벤트 훅 core

**Files:**
- Create: `src/core/hooks.js`
- Test: `test/hooks.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `createHooks()` → `{ on(event, listener), emit(event, payload) }`.
  `on`은 반환값 없음. `emit`은 `Promise<Array>`로 리스너들의 반환값 배열을 준다.
  예외를 던진 리스너는 결과 배열에서 빠진다.

- [ ] **Step 1: Write the failing test**

`test/hooks.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/hooks.test.js`
Expected: FAIL — `Cannot find module '../src/core/hooks.js'`

- [ ] **Step 3: Write minimal implementation**

`src/core/hooks.js`:

```js
// feature 간 직접 import를 피하기 위한 이벤트 훅.
// composition root가 만들어 ctx.hooks로 주입하고, feature는 onLoad(ctx)에서 구독한다.
// emit이 반환값을 모아 주므로, 이벤트를 낸 쪽이 결과를 받아 자기 테이블만 갱신할 수 있다.
const noopLogger = { error: () => {} };

export function createHooks({ logger = noopLogger } = {}) {
  const listeners = new Map();

  return {
    on(event, listener) {
      if (typeof listener !== 'function') return;
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(listener);
    },

    async emit(event, payload) {
      const results = [];
      for (const listener of listeners.get(event) ?? []) {
        try {
          const result = await listener(payload);
          if (result !== undefined) results.push(result);
        } catch (error) {
          // 리스너 실패가 이벤트를 낸 쪽의 동작을 깨뜨리면 안 된다.
          logger.error('hook_listener_failed', { event, message: error?.message });
        }
      }
      return results;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/hooks.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/core/hooks.js test/hooks.test.js
git commit -F - <<'EOF'
feat(core): add an event hook channel for cross-feature wiring

Why: feature 간 직접 import가 금지돼 있어 모임 생성 사실을 소모임 자동화에 알릴
경로가 없었다.

Decision: emit이 리스너 반환값을 모아 돌려준다. 이벤트를 낸 feature가 결과를 받아
자기 테이블만 갱신할 수 있어 남의 테이블을 건드리지 않는다. 리스너 예외는 삼키고
로그만 남긴다 — 자동화 문제로 모임 생성이 깨지면 안 된다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 훅을 ctx에 배선

**Files:**
- Modify: `src/server.js`
- Modify: `test/app.test.js` (ctx에 hooks 추가)

**Interfaces:**
- Consumes: Task 1의 `createHooks()`
- Produces: 모든 feature가 `ctx.hooks`로 `{ on, emit }`을 받는다. `ctx.hooks`는 항상 존재한다(테스트에서 생략하면 `undefined`이므로 호출부는 `ctx.hooks?.emit?.()` 형태로 방어한다).

- [ ] **Step 1: Write the failing test**

`test/app.test.js`의 상단 ctx 구성에 hooks를 추가하고, feature가 ctx.hooks를 받는지 확인하는 테스트를 `test/loadFeatures.test.js`에 추가한다.

`test/loadFeatures.test.js`에 추가:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/loadFeatures.test.js`
Expected: FAIL — `registerFeatures`가 import되어 있지 않으면 import 에러, 아니면 assertion 실패

(`registerFeatures`가 이미 export되어 있다면 이 테스트는 통과할 수 있다. 그 경우 Step 3의 server.js 배선만 진행하고 이 단계를 회귀 방지용으로 남긴다.)

- [ ] **Step 3: Write minimal implementation**

`src/server.js`에서 `createHooks`를 import하고 ctx에 넣는다.

```js
import { createHooks } from './core/hooks.js';
```

`const storage = createStorage(config.storage);` 다음 줄에 추가:

```js
const hooks = createHooks({ logger });
```

그리고 `createApp` 호출을 바꾼다:

```js
const app = await createApp({ db, auth, storage, config, logger, hooks });
```

- [ ] **Step 4: Run tests**

Run: `node --test test/loadFeatures.test.js test/app.test.js && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/loadFeatures.test.js
git commit -F - <<'EOF'
feat(core): inject the hook channel through ctx

Why: feature가 onLoad(ctx)에서 이벤트를 구독하려면 훅이 ctx에 있어야 한다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: 마이그레이션과 meetups 쿼리

**Files:**
- Create: `migrations/20260823_meetup_somoim_state.sql`
- Modify: `src/features/meetups/meetup.queries.js`
- Test: `test/meetup.integration.test.js` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `queries.listMeetups(userId)`가 각 행에 `somoimState`(string), `somoimJobId`(uuid|null)를 포함
  - `queries.createMeetup(...)` 반환값에 `somoimState: 'none'` 포함
  - `queries.setSomoimState({ meetupId, state, jobId })` → 갱신된 행 또는 `null`
  - `queries.getMeetupById(id)` 반환값에 `somoimState` 포함

- [ ] **Step 1: 마이그레이션 파일 작성**

`migrations/20260823_meetup_somoim_state.sql`:

```sql
-- 앱에서 만든 모임이 소모임 앱에도 등록됐는지 추적한다.
-- source_type/source_ref는 "소모임에서 가져온 모임"을 뜻하므로 의미가 다르다.
ALTER TABLE meetups ADD COLUMN somoim_state text NOT NULL DEFAULT 'none';

ALTER TABLE meetups ADD CONSTRAINT meetups_somoim_state_check
  CHECK (somoim_state IN ('none', 'pending', 'registered', 'failed'));

ALTER TABLE meetups ADD COLUMN somoim_job_id uuid
  REFERENCES somoim_automation_jobs(id) ON DELETE SET NULL;

CREATE INDEX meetups_somoim_state_idx ON meetups (somoim_state)
  WHERE somoim_state <> 'none';
```

- [ ] **Step 2: Write the failing test**

`test/meetup.integration.test.js` 끝에 추가 (파일 상단의 `run`/`pool` 패턴을 그대로 쓴다):

```js
run('somoim_state는 기본이 none이고 setSomoimState로 바뀐다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const userResult = await pool.query(
    `INSERT INTO users (nickname) VALUES ($1) RETURNING id`,
    [`somoim-state-${suffix}`],
  );
  const hostId = userResult.rows[0].id;

  const created = await queries.createMeetup({
    hostId,
    title: `somoim-state-${suffix}`,
    description: null,
    location: 'test cafe',
    scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    capacity: 4,
  });

  try {
    assert.equal(created.somoimState, 'none', '기본값은 자동화 대상 아님이다');

    const updated = await queries.setSomoimState({
      meetupId: created.id,
      state: 'pending',
      jobId: null,
    });
    assert.equal(updated.somoimState, 'pending');

    const fetched = await queries.getMeetupById(created.id);
    assert.equal(fetched.somoimState, 'pending');

    const listed = await queries.listMeetups(hostId);
    const row = listed.find((item) => item.id === created.id);
    assert.equal(row.somoimState, 'pending', '목록에도 상태가 실려야 화면이 배지를 그린다');
  } finally {
    await pool.query('DELETE FROM participants WHERE meetup_id = $1', [created.id]);
    await pool.query('DELETE FROM meetups WHERE id = $1', [created.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [hostId]);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/meetup.integration.test.js`
Expected: 로컬에서는 SKIP(정상). 실패를 직접 보려면 `DATABASE_URL`이 있는 환경이 필요하다. 로컬에서는 다음 단계로 진행하고 CI에서 확인한다.

- [ ] **Step 4: Write implementation**

`src/features/meetups/meetup.queries.js`:

`listMeetups`의 SELECT 목록에서 `m.created_at AS "createdAt",` 다음 줄에 추가:

```sql
            m.somoim_state AS "somoimState",
            m.somoim_job_id AS "somoimJobId",
```

`createMeetup`의 `RETURNING` 목록에서 `created_at AS "createdAt"` 앞에 추가:

```sql
              somoim_state AS "somoimState",
              somoim_job_id AS "somoimJobId",
```

`getMeetupById`의 SELECT에 `somoim_state AS "somoimState"`를 추가한다(해당 쿼리는 `id, host_id AS "hostId", scheduled_at ...` 형태다).

그리고 `createMeetupQueries`가 반환하는 객체에 메서드를 추가한다:

```js
    async setSomoimState({ meetupId, state, jobId = null }) {
      const result = await db.query(
        `UPDATE meetups
            SET somoim_state = $2,
                somoim_job_id = COALESCE($3, somoim_job_id)
          WHERE id = $1
          RETURNING id, somoim_state AS "somoimState", somoim_job_id AS "somoimJobId"`,
        [meetupId, state, jobId],
      );
      return result.rows[0] ?? null;
    },
```

- [ ] **Step 5: Run checks**

Run: `npm run check:js && node --test`
Expected: PASS (통합 테스트는 로컬에서 skip)

- [ ] **Step 6: Commit**

```bash
git add migrations/20260823_meetup_somoim_state.sql src/features/meetups/meetup.queries.js test/meetup.integration.test.js
git commit -F - <<'EOF'
feat(meetups): track whether a meetup is registered on somoim

Why: 소모임 등록이 끝나기 전에는 참가를 막고 "등록 중"으로 보여줘야 한다. 그 상태를
담을 곳이 없었다.

Decision: status에 섞지 않고 somoim_state 컬럼을 새로 둔다. status는 모집 상태이고
lifecycleState 계산에 쓰여서, 등록 진행 상태를 섞으면 두 의미가 얽힌다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 모임 생성 시 이벤트 발행

**Files:**
- Modify: `src/features/meetups/meetup.service.js`
- Modify: `src/features/meetups/meetup.routes.js`
- Test: `test/meetup.service.test.js` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 `hooks.emit`, Task 3 `queries.setSomoimState`
- Produces: `createMeetupService({ db, storage, hooks })`. `createMeetup`이 생성 후
  `hooks.emit('meetupCreated', meetup)`을 부르고, 결과 중 첫 `{ jobId }`가 있으면
  `somoim_state`를 `pending`으로 바꾼 뒤 그 상태를 응답에 담는다.

- [ ] **Step 1: Write the failing test**

`test/meetup.service.test.js`에 추가:

```js
import { createMeetupService } from '../src/features/meetups/meetup.service.js';

function serviceWithHooks({ listenerResult } = {}) {
  const calls = { emitted: [], stateUpdates: [] };
  const queries = {
    async createMeetup(input) {
      return { id: 'meetup-1', ...input, status: 'open', somoimState: 'none', somoimJobId: null };
    },
    async setSomoimState(input) {
      calls.stateUpdates.push(input);
      return { id: input.meetupId, somoimState: input.state, somoimJobId: input.jobId };
    },
  };
  const hooks = {
    on() {},
    async emit(event, payload) {
      calls.emitted.push({ event, payload });
      return listenerResult === undefined ? [] : [listenerResult];
    },
  };
  return { service: createMeetupService({ db: {}, storage: null, hooks, queries }), calls };
}

const VALID_INPUT = {
  hostId: '00000000-0000-0000-0000-000000000001',
  title: '토요일 카페 스터디',
  description: null,
  location: '강남역 스타벅스',
  scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
  capacity: 4,
};

test('createMeetup: 모임 생성 후 meetupCreated를 발행한다', async () => {
  const { service, calls } = serviceWithHooks();
  await service.createMeetup(VALID_INPUT);

  assert.equal(calls.emitted.length, 1);
  assert.equal(calls.emitted[0].event, 'meetupCreated');
  assert.equal(calls.emitted[0].payload.id, 'meetup-1');
});

test('createMeetup: 듣는 리스너가 없으면 상태를 건드리지 않는다', async () => {
  const { service, calls } = serviceWithHooks();
  const meetup = await service.createMeetup(VALID_INPUT);

  assert.deepEqual(calls.stateUpdates, [], '자동화가 꺼진 환경에서는 지금과 똑같이 동작해야 한다');
  assert.equal(meetup.somoimState, 'none');
});

test('createMeetup: 리스너가 jobId를 주면 pending으로 바꾼다', async () => {
  const { service, calls } = serviceWithHooks({ listenerResult: { jobId: 'job-1' } });
  const meetup = await service.createMeetup(VALID_INPUT);

  assert.deepEqual(calls.stateUpdates, [{ meetupId: 'meetup-1', state: 'pending', jobId: 'job-1' }]);
  assert.equal(meetup.somoimState, 'pending', '응답이 바로 등록 중으로 보여야 한다');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/meetup.service.test.js`
Expected: FAIL — `createMeetupService`가 `queries` 주입을 지원하지 않고 `hooks`를 모른다

- [ ] **Step 3: Write implementation**

`src/features/meetups/meetup.service.js`의 시그니처를 바꾼다:

```js
export function createMeetupService({ db, storage, hooks, queries = createMeetupQueries(db) }) {
```

`createMeetup`을 교체한다:

```js
    async createMeetup(input) {
      validateMeetupInput(input);
      const meetup = await queries.createMeetup(input);

      // 듣는 리스너가 없으면 자동 등록도 없다. 자동화가 꺼진 환경은 여기서 그대로 끝난다.
      const results = await (hooks?.emit?.('meetupCreated', meetup) ?? Promise.resolve([]));
      const jobId = results.find((result) => result?.jobId)?.jobId ?? null;

      let somoimState = meetup.somoimState ?? 'none';
      if (jobId) {
        const updated = await queries.setSomoimState({
          meetupId: meetup.id,
          state: 'pending',
          jobId,
        });
        somoimState = updated?.somoimState ?? 'pending';
      }

      return {
        ...withLifecycleState(meetup),
        somoimState,
        participantCount: 1,
        joined: true,
        isHost: true,
      };
    },
```

`src/features/meetups/meetup.routes.js`에서 서비스를 만들 때 hooks를 넘긴다:

```js
  const meetupService = createMeetupService({ db: ctx.db, storage: ctx.storage, hooks: ctx.hooks });
```

- [ ] **Step 4: Run tests**

Run: `node --test test/meetup.service.test.js && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/meetups/meetup.service.js src/features/meetups/meetup.routes.js test/meetup.service.test.js
git commit -F - <<'EOF'
feat(meetups): announce meetupCreated and store the returned job id

Why: 모임을 만들었다는 사실을 소모임 자동화가 알아야 하는데, feature 간 직접 호출은
금지돼 있다.

Decision: 모임 기능은 누가 듣는지 모른 채 발행만 한다. 리스너가 jobId를 돌려주면
그때만 자기 행을 pending으로 바꾼다. 듣는 리스너가 없으면 상태를 건드리지 않아
자동화가 꺼진 환경에서 기존 동작이 그대로 유지된다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 5: 자동화가 이벤트를 구독해 job 생성

**Files:**
- Modify: `src/features/somoim-automation/index.js`
- Modify: `src/features/somoim-automation/somoim-automation.service.js`
- Test: `test/somoim-automation.service.test.js` (기존 파일에 추가)

**Interfaces:**
- Consumes: Task 1 `hooks.on`, 기존 `service.createMeetupJob`
- Produces:
  - `service.createJobForMeetup(meetup)` → `{ jobId }`. 웹 모임을 job payload로 옮긴다.
  - `somoim-automation`의 `onLoad(ctx)`가 자동화 설정이 켜져 있을 때만
    `ctx.hooks.on('meetupCreated', ...)`을 등록한다.

- [ ] **Step 1: Write the failing test**

`test/somoim-automation.service.test.js`에 추가:

```js
test('createJobForMeetup: 웹 모임을 그대로 payload로 옮긴다', async () => {
  const { service, calls } = serviceWith({ allowSubmit: true });

  const result = await service.createJobForMeetup({
    id: 'meetup-1',
    hostId: USER_ID,
    title: '토요일 카페 스터디',
    description: '각자 할 일 가져오기',
    location: '강남역 스타벅스',
    scheduledAt: '2026-08-29T01:00:00.000Z',
    capacity: 6,
  });

  assert.equal(result.jobId, JOB_ID);
  const payload = calls.created[0].payload;
  assert.equal(payload.title, '토요일 카페 스터디');
  assert.equal(payload.location, '강남역 스타벅스');
  assert.equal(payload.capacity, 6, '정원은 웹 모임 값을 그대로 쓴다');
  // payload에는 담지만 앱에는 반영되지 않는다. 소모임 "새 게시글 자동 생성" 화면에
  // 설명 입력란이 없어서 handler가 건너뛴다(worker/handlers/create-meetup.js 참고).
  // job 목록에서 무엇을 요청했는지 확인하는 기록으로만 쓴다.
  assert.equal(payload.description, '각자 할 일 가져오기', '설명에 안내 문구를 덧붙이지 않는다');
  assert.equal(payload.submit, true, '자동 트리거는 실제 등록이 목적이다');
  assert.equal(payload.dryRun, false);
  assert.equal(calls.created[0].requestedBy, USER_ID);
});

test('createJobForMeetup: 설명이 없으면 빈 문자열로 보낸다', async () => {
  const { service, calls } = serviceWith({ allowSubmit: true });

  await service.createJobForMeetup({
    id: 'meetup-1',
    hostId: USER_ID,
    title: '제목',
    description: null,
    location: '장소',
    scheduledAt: '2026-08-29T01:00:00.000Z',
    capacity: 6,
  });

  assert.equal(calls.created[0].payload.description, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/somoim-automation.service.test.js`
Expected: FAIL — `service.createJobForMeetup is not a function`

- [ ] **Step 3: Write implementation**

`src/features/somoim-automation/somoim-automation.service.js`의 반환 객체에 추가(`createMeetupJob` 바로 아래):

`createMeetupJob`을 지역 함수로 뽑아 두 곳에서 부른다. 반환 객체 리터럴 안에서
`this`는 호출 방식(구조 분해 등)에 따라 달라지므로 쓰지 않는다.

```js
export function createSomoimAutomationService({ ... } = {}) {
  async function createMeetupJob({ requestedBy, input }) {
    assertUuid(requestedBy, 'requestedBy');
    const payload = normalizeMeetupPayload(input, { allowSubmit });
    return summarizeJob(await queries.createJob({ requestedBy, type: JOB_TYPE_CREATE_MEETUP, payload }));
  }

  return {
    createMeetupJob,

    // 웹 모임 생성 훅이 부른다. 개설자를 요청자로 남겨 관리자 화면에서 추적할 수 있게 한다.
    async createJobForMeetup(meetup) {
      const { jobId } = await createMeetupJob({
        requestedBy: meetup.hostId,
        input: {
          title: meetup.title,
          scheduledAt: meetup.scheduledAt,
          location: meetup.location,
          capacity: meetup.capacity,
          description: meetup.description ?? '',
          cost: '',
          submit: true,
        },
      });
      return { jobId };
    },

    // ... 나머지 기존 메서드(listJobs, getJob, claimNextJob, completeJob, failJob)는 그대로 둔다
  };
}
```

`src/features/somoim-automation/index.js`:

```js
import { registerMeetupCreatedListener } from './somoim-automation.hooks.js';
import { createSomoimAutomationRouter } from './somoim-automation.routes.js';

export default {
  name: 'somoim-automation',
  basePath: '/api/somoim-automation',
  createRoutes: (ctx) => createSomoimAutomationRouter(ctx),
  onLoad: (ctx) => registerMeetupCreatedListener(ctx),
};
```

Create `src/features/somoim-automation/somoim-automation.hooks.js`:

```js
import { createSomoimAutomationService } from './somoim-automation.service.js';

// 자동 등록은 실제 제출이 목적이라, 제출 스위치가 꺼져 있으면 구독하지 않는다.
// 구독하지 않으면 모임 생성은 지금과 똑같이 동작한다(듣는 사람이 없으면 아무 일도 없다).
export function registerMeetupCreatedListener(ctx) {
  const config = ctx.config?.somoimAutomation ?? {};
  if (!config.internalApiKey || !config.allowSubmit) return;
  if (!ctx.hooks?.on) return;

  const service = createSomoimAutomationService({
    db: ctx.db,
    allowSubmit: config.allowSubmit,
    staleClaimSeconds: config.staleClaimSeconds,
    maxAttempts: config.maxAttempts,
  });

  ctx.hooks.on('meetupCreated', (meetup) => service.createJobForMeetup(meetup));
}
```

- [ ] **Step 4: Run tests**

Run: `node --test test/somoim-automation.service.test.js && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/somoim-automation/ test/somoim-automation.service.test.js
git commit -F - <<'EOF'
feat(somoim-automation): create a job when a meetup is created

Why: 권한 없는 멤버도 웹에서 모임을 만들면 Bot이 소모임에 정모를 대신 열어주는 것이
이 기능의 목적이다. 트리거가 관리자 수동 요청이어서는 그 목적을 달성하지 못한다.

Decision: 제출 스위치가 꺼져 있으면 아예 구독하지 않는다. handler가 완성되고 서버·
worker 양쪽 스위치를 켜기 전까지 이 기능은 자동으로 비활성이고, 그동안 모임 생성은
기존과 동일하게 동작한다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 6: 등록 대기 중에는 참가를 막는다

**Files:**
- Modify: `src/features/meetups/meetup.queries.js` (joinMeetup 쿼리)
- Modify: `src/features/meetups/meetup.service.js` (joinMeetup 분기)
- Test: `test/meetup.service.test.js`

**Interfaces:**
- Consumes: Task 3 `somoim_state`
- Produces: `queries.joinMeetup`이 `{ outcome: 'somoim_pending' }`를 추가로 반환할 수 있다.
  서비스는 이를 400 `MEETUP_SOMOIM_PENDING`으로 바꾼다.

- [ ] **Step 1: Write the failing test**

`test/meetup.service.test.js`에 추가:

```js
test('joinMeetup: 소모임 등록 중이면 참가를 막는다', async () => {
  const service = createMeetupService({
    db: {},
    storage: null,
    hooks: null,
    queries: { async joinMeetup() { return { outcome: 'somoim_pending' }; } },
  });

  await assert.rejects(
    () => service.joinMeetup({ meetupId: 'meetup-1', userId: 'user-1' }),
    (error) => {
      assert.equal(error.code, 'MEETUP_SOMOIM_PENDING');
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/meetup.service.test.js`
Expected: FAIL — 알 수 없는 outcome이라 예외가 나지 않는다

- [ ] **Step 3: Write implementation**

`src/features/meetups/meetup.queries.js`의 `joinMeetup` 안, meetup을 `FOR UPDATE`로 읽은 직후 SELECT에 `somoim_state AS "somoimState"`를 추가하고 정원 확인 앞에 분기를 넣는다:

```js
        if (meetup.somoimState === 'pending' || meetup.somoimState === 'failed') {
          return { outcome: 'somoim_pending' };
        }
```

`src/features/meetups/meetup.service.js`의 `joinMeetup`에서 `not_found` 분기 아래에 추가:

```js
      if (result.outcome === 'somoim_pending') {
        throwError(400, 'MEETUP_SOMOIM_PENDING', '소모임에 등록하는 중이에요. 잠시 뒤에 참여할 수 있어요.');
      }
```

- [ ] **Step 4: Run tests**

Run: `node --test test/meetup.service.test.js && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/meetups/ test/meetup.service.test.js
git commit -F - <<'EOF'
fix(meetups): block joining while somoim registration is pending

Why: 소모임 등록이 실패하면 그 모임은 다른 사람에게서 사라진다. 그 전에 참가한
사람이 있으면 이미 참여한 모임이 없어지는 혼란이 생긴다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 7: 실패한 모임은 개설자에게만 보인다

**Files:**
- Modify: `src/features/meetups/meetup.queries.js` (listMeetups WHERE)
- Test: `test/meetup.integration.test.js`

**Interfaces:**
- Consumes: Task 3 `somoim_state`
- Produces: `listMeetups(userId)`가 `somoim_state='failed'`인 모임을 `host_id = userId`일 때만 포함한다. `userId`가 null(비로그인)이면 절대 포함하지 않는다.

- [ ] **Step 1: Write the failing test**

`test/meetup.integration.test.js`에 추가:

```js
run('failed 모임은 개설자에게만 보이고 비로그인에게는 숨는다', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const users = await pool.query(
    `INSERT INTO users (nickname) VALUES ($1), ($2) RETURNING id`,
    [`failed-host-${suffix}`, `failed-other-${suffix}`],
  );
  const [host, other] = users.rows;

  const created = await queries.createMeetup({
    hostId: host.id,
    title: `failed-${suffix}`,
    description: null,
    location: 'test cafe',
    scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
    capacity: 4,
  });

  try {
    await queries.setSomoimState({ meetupId: created.id, state: 'failed', jobId: null });

    const asHost = await queries.listMeetups(host.id);
    assert.ok(asHost.some((m) => m.id === created.id), '개설자에게는 보여야 다시 시도할 수 있다');

    const asOther = await queries.listMeetups(other.id);
    assert.ok(!asOther.some((m) => m.id === created.id), '다른 멤버에게는 취소된 것과 같다');

    const asGuest = await queries.listMeetups(null);
    assert.ok(!asGuest.some((m) => m.id === created.id), '비로그인에게 절대 새면 안 된다');
  } finally {
    await pool.query('DELETE FROM participants WHERE meetup_id = $1', [created.id]);
    await pool.query('DELETE FROM meetups WHERE id = $1', [created.id]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[host.id, other.id]]);
  }
});
```

- [ ] **Step 2: Run test**

Run: `node --test test/meetup.integration.test.js`
Expected: 로컬 SKIP. CI에서 FAIL을 확인한 뒤 다음 단계로 간다.

- [ ] **Step 3: Write implementation**

`src/features/meetups/meetup.queries.js`의 `listMeetups` 쿼리에는 이미
`WHERE m.status = 'open' AND m.source_type = 'app'` 절이 있다. 거기에 조건을 더한다:

```sql
          WHERE (m.somoim_state <> 'failed' OR m.host_id = $1)
```

`$1`은 이미 `userId`로 바인딩되어 있다. `userId`가 null이면 `m.host_id = NULL`이 NULL로 평가되어 조건이 거짓이 되므로 `failed` 모임이 제외된다.

- [ ] **Step 4: Run checks**

Run: `npm run check:js && node --test`
Expected: PASS (통합 테스트는 로컬 skip)

- [ ] **Step 5: Commit**

```bash
git add src/features/meetups/meetup.queries.js test/meetup.integration.test.js
git commit -F - <<'EOF'
feat(meetups): hide failed registrations from everyone but the host

Why: 소모임 등록에 실패한 모임은 다른 사람에게 취소된 것과 같아야 한다. 동시에
개설자는 입력을 잃지 않고 다시 시도할 수 있어야 한다.

Decision: 목록 조회가 공개 엔드포인트라 비로그인 요청에도 절대 새지 않도록
host_id 비교로 거른다. userId가 null이면 비교가 NULL이 되어 자동으로 제외된다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 8: 실패 보고 시 재시도 또는 failed 전환

**Files:**
- Modify: `src/features/somoim-automation/somoim-automation.service.js`
- Modify: `src/features/somoim-automation/somoim-automation.queries.js`
- Modify: `src/features/somoim-automation/somoim-automation.hooks.js`
- Modify: `src/features/meetups/index.js`
- Create: `src/features/meetups/meetup.hooks.js`
- Test: `test/somoim-automation.service.test.js`

**Interfaces:**
- Consumes: Task 1 `hooks.emit`/`on`, Task 3 `queries.setSomoimState`
- Produces:
  - `queries.requeueJob(id)` → job을 `pending`으로 되돌리고 갱신된 행 반환
  - `service.failJob({ id, errorMessage, needsManualReview, result })`가
    `{ ...job, requeued: boolean }`을 반환
  - `somoimRegistrationFailed` 이벤트 payload: `{ jobId }`
    (`somoim-automation`은 모임 id를 알 방법이 없다. `somoim_job_id`로 자기 행을
    찾는 것은 `meetups` 쪽이다)
  - `meetups`의 `onLoad(ctx)`가 이 이벤트를 구독해 `somoim_state='failed'`로 바꾼다

- [ ] **Step 1: Write the failing test**

`test/somoim-automation.service.test.js`에 추가:

```js
test('failJob: 일시적 장애면 시도 횟수가 남는 동안 다시 큐에 넣는다', async () => {
  const claimed = { id: JOB_ID, status: 'claimed', attempts: 1, payload: {} };
  const { service, calls } = serviceWith({ job: claimed, maxAttempts: 3 });

  const outcome = await service.failJob({
    id: JOB_ID,
    errorMessage: 'app launch timed out',
    needsManualReview: false,
  });

  assert.equal(outcome.requeued, true);
  assert.deepEqual(calls.jobRequeues, [JOB_ID]);
  assert.deepEqual(calls.failed, [], '아직 실패로 확정하지 않는다');
});

test('failJob: 사람 확인이 필요하면 재시도하지 않는다', async () => {
  const claimed = { id: JOB_ID, status: 'claimed', attempts: 1, payload: {} };
  const { service, calls } = serviceWith({ job: claimed, maxAttempts: 3 });

  const outcome = await service.failJob({
    id: JOB_ID,
    errorMessage: 'Create button was not found',
    needsManualReview: true,
  });

  assert.equal(outcome.requeued, false);
  assert.equal(calls.failed.length, 1);
});

test('failJob: 시도 횟수를 다 쓰면 재시도하지 않는다', async () => {
  const claimed = { id: JOB_ID, status: 'claimed', attempts: 3, payload: {} };
  const { service, calls } = serviceWith({ job: claimed, maxAttempts: 3 });

  const outcome = await service.failJob({
    id: JOB_ID,
    errorMessage: 'timeout',
    needsManualReview: false,
  });

  assert.equal(outcome.requeued, false);
  assert.equal(calls.failed.length, 1);
});
```

`serviceWith` 헬퍼의 fake queries에 다음을 추가한다:

```js
    async requeueJob(id) {
      calls.jobRequeues.push(id);
      return { ...job, status: 'pending' };
    },
```

그리고 `calls`에 `jobRequeues: []`를 추가한다. 기존 `calls.requeued`는 stale claim
회수(`requeueStaleJobs`)를 기록하는 용도라 이름을 구분한다.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/somoim-automation.service.test.js`
Expected: FAIL — `outcome.requeued`가 undefined

- [ ] **Step 3: Write implementation**

`somoim-automation.queries.js`에 추가:

```js
    async requeueJob(id) {
      const result = await db.query(
        `UPDATE somoim_automation_jobs
            SET status = 'pending', claimed_at = NULL, updated_at = now()
          WHERE id = $1 AND status = 'claimed'
          RETURNING id, status, attempts`,
        [id],
      );
      return result.rows[0] ?? null;
    },
```

`somoim-automation.service.js`의 `failJob`을 바꾼다:

```js
    async failJob({ id, errorMessage, needsManualReview, result }) {
      assertUuid(id, 'jobId');
      const current = await queries.getJob(id);
      const canRetry = needsManualReview !== true
        && (current?.attempts ?? maxAttempts) < maxAttempts;

      if (canRetry) {
        const requeued = await queries.requeueJob(id);
        if (!requeued) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
        return { ...requeued, requeued: true };
      }

      const job = await queries.failJob({
        id,
        errorMessage: normalizeErrorMessage(errorMessage),
        needsManualReview: needsManualReview === true,
        result: normalizeResult(result),
      });
      if (!job) throwConflict('JOB_NOT_CLAIMED', 'Only claimed jobs can be failed');
      return { ...job, requeued: false };
    },
```

`somoim-automation.hooks.js`에서 실패가 확정됐을 때 이벤트를 낸다. 라우트가 서비스 결과를 받아 emit하도록 `somoim-automation.routes.js`의 fail 핸들러를 바꾼다:

```js
  router.post('/jobs/:id/fail', requireInternalKey, async (req, res, next) => {
    try {
      const job = await service.failJob({
        id: req.params.id,
        errorMessage: req.body?.errorMessage,
        needsManualReview: req.body?.needsManualReview,
        result: req.body?.result,
      });

      // 재시도 여지가 없을 때만 모임 쪽에 실패를 알린다.
      if (!job.requeued) {
        await ctx.hooks?.emit?.('somoimRegistrationFailed', { jobId: job.id });
      }
      return sendOk(res, job);
    } catch (err) { return next(err); }
  });
```

Create `src/features/meetups/meetup.hooks.js`:

```js
import { createMeetupQueries } from './meetup.queries.js';

// 소모임 등록이 최종 실패하면 그 모임을 failed로 바꾼다.
// 자동화가 meetups 테이블을 직접 수정하지 않도록 이 feature가 자기 행만 갱신한다.
export function registerSomoimFailureListener(ctx) {
  if (!ctx.hooks?.on) return;
  const queries = createMeetupQueries(ctx.db);

  ctx.hooks.on('somoimRegistrationFailed', async ({ jobId }) => {
    if (!jobId) return;
    await queries.markSomoimFailedByJob(jobId);
  });
}
```

`meetup.queries.js`에 추가:

```js
    async markSomoimFailedByJob(jobId) {
      const result = await db.query(
        `UPDATE meetups
            SET somoim_state = 'failed'
          WHERE somoim_job_id = $1 AND somoim_state = 'pending'
          RETURNING id, somoim_state AS "somoimState"`,
        [jobId],
      );
      return result.rows[0] ?? null;
    },
```

`src/features/meetups/index.js`:

```js
import { registerSomoimFailureListener } from './meetup.hooks.js';
import { createMeetupRouter } from './meetup.routes.js';

export default {
  name: 'meetups',
  basePath: '/api/meetups',
  createRoutes: (ctx) => createMeetupRouter(ctx),
  onLoad: (ctx) => registerSomoimFailureListener(ctx),
  navItem: { label: 'Meetups', path: '/meetups' },
};
```

- [ ] **Step 4: Run tests**

Run: `node --test && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/ test/somoim-automation.service.test.js
git commit -F - <<'EOF'
feat(somoim-automation): retry transient failures before giving up

Why: worker가 일시적 장애로 실패한 job을 곧바로 포기하면 모임이 불필요하게 실패
상태로 넘어간다.

Decision: needsManualReview가 false이고 시도 횟수가 남아 있으면 job을 pending으로
되돌린다. 최종 실패일 때만 somoimRegistrationFailed를 발행하고, 모임 기능이 그
이벤트를 받아 자기 행을 failed로 바꾼다. 자동화가 meetups 테이블을 직접 쓰지 않는다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 9: 개설자의 다시 시도 endpoint

**Files:**
- Modify: `src/features/meetups/meetup.routes.js`
- Modify: `src/features/meetups/meetup.service.js`
- Test: `test/meetup.service.test.js`

**Interfaces:**
- Consumes: Task 3 `setSomoimState`, Task 5 `meetupCreated` 훅
- Produces: `POST /api/meetups/:id/retry-somoim`. `requireUser`, 개설자만, `failed` 상태에서만.
  성공 시 `{ meetupId, somoimState: 'pending' }`.

- [ ] **Step 1: Write the failing test**

`test/meetup.service.test.js`에 추가:

```js
test('retrySomoimRegistration: 개설자가 아니면 거부한다', async () => {
  const service = createMeetupService({
    db: {}, storage: null, hooks: null,
    queries: { async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'failed' }; } },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'm1', userId: 'other' }),
    (error) => { assert.equal(error.code, 'NOT_MEETUP_HOST'); return true; },
  );
});

test('retrySomoimRegistration: failed가 아니면 거부한다', async () => {
  const service = createMeetupService({
    db: {}, storage: null, hooks: null,
    queries: { async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'registered' }; } },
  });

  await assert.rejects(
    () => service.retrySomoimRegistration({ meetupId: 'm1', userId: 'host' }),
    (error) => { assert.equal(error.code, 'MEETUP_SOMOIM_NOT_FAILED'); return true; },
  );
});

test('retrySomoimRegistration: 새 job을 만들고 pending으로 되돌린다', async () => {
  const updates = [];
  const service = createMeetupService({
    db: {}, storage: null,
    hooks: { on() {}, async emit() { return [{ jobId: 'job-2' }]; } },
    queries: {
      async getMeetupById() { return { id: 'm1', hostId: 'host', somoimState: 'failed' }; },
      async setSomoimState(input) { updates.push(input); return { somoimState: input.state }; },
    },
  });

  const result = await service.retrySomoimRegistration({ meetupId: 'm1', userId: 'host' });

  assert.equal(result.somoimState, 'pending');
  assert.deepEqual(updates, [{ meetupId: 'm1', state: 'pending', jobId: 'job-2' }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/meetup.service.test.js`
Expected: FAIL — `service.retrySomoimRegistration is not a function`

- [ ] **Step 3: Write implementation**

`meetup.service.js`에 추가:

```js
    async retrySomoimRegistration({ meetupId, userId }) {
      const meetup = await queries.getMeetupById(meetupId);
      if (!meetup) throwError(404, 'MEETUP_NOT_FOUND', '모임을 찾을 수 없습니다.');
      if (meetup.hostId !== userId) {
        throwError(403, 'NOT_MEETUP_HOST', '모임 개설자만 다시 시도할 수 있어요.');
      }
      if (meetup.somoimState !== 'failed') {
        throwError(400, 'MEETUP_SOMOIM_NOT_FAILED', '다시 시도할 수 있는 상태가 아니에요.');
      }

      const results = await (hooks?.emit?.('meetupCreated', meetup) ?? Promise.resolve([]));
      const jobId = results.find((result) => result?.jobId)?.jobId ?? null;
      if (!jobId) {
        throwError(503, 'SOMOIM_AUTOMATION_UNAVAILABLE', '지금은 소모임에 등록할 수 없어요.');
      }

      const updated = await queries.setSomoimState({ meetupId, state: 'pending', jobId });
      return { meetupId, somoimState: updated?.somoimState ?? 'pending' };
    },
```

`meetup.routes.js`에 추가:

```js
  router.post('/:id/retry-somoim', ctx.auth.requireUser, async (req, res, next) => {
    try {
      sendOk(res, await meetupService.retrySomoimRegistration({
        meetupId: req.params.id,
        userId: req.user.id,
      }));
    } catch (error) {
      next(error);
    }
  });
```

- [ ] **Step 4: Run tests**

Run: `node --test test/meetup.service.test.js && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/meetups/ test/meetup.service.test.js
git commit -F - <<'EOF'
feat(meetups): let the host retry a failed somoim registration

Why: 등록에 실패한 모임을 지우지 않고 남기기로 했으니, 개설자가 다시 시도할 방법이
있어야 한다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 10: 모임 카드에 등록 상태 표시

**Files:**
- Modify: `client/src/shared/MeetupCard.vue`
- Modify: `client/src/shared/useMeetups.js`
- Test: `test/meetup-somoim-state.test.js` (신규, 순수 로직)

**Interfaces:**
- Consumes: API 응답의 `somoimState`
- Produces:
  - `client/src/shared/somoim-registration.js`의 `somoimBadge(state)` → `{ label, tone }` 또는 `null`
  - `useMeetups().retrySomoim(meetup)` → 성공 시 목록 새로고침

- [ ] **Step 1: Write the failing test**

`test/meetup-somoim-state.test.js`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canJoin, somoimBadge } from '../client/src/shared/somoim-registration.js';

test('등록 중과 실패만 배지를 단다', () => {
  assert.equal(somoimBadge('none'), null);
  assert.equal(somoimBadge('registered'), null);
  assert.deepEqual(somoimBadge('pending'), { label: '소모임 등록 중', tone: 'ui-text-muted' });
  assert.deepEqual(somoimBadge('failed'), { label: '소모임 등록 실패', tone: 'ui-text-danger' });
});

test('등록이 끝나기 전에는 참가할 수 없다', () => {
  assert.equal(canJoin('none'), true);
  assert.equal(canJoin('registered'), true);
  assert.equal(canJoin('pending'), false);
  assert.equal(canJoin('failed'), false);
});

test('모르는 상태는 막지 않는다', () => {
  assert.equal(canJoin('brand_new'), true, '서버가 새 상태를 보내도 화면이 멈추면 안 된다');
  assert.equal(somoimBadge('brand_new'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/meetup-somoim-state.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write implementation**

Create `client/src/shared/somoim-registration.js`:

```js
// 소모임 등록 상태의 화면 표현. 브라우저 API에 의존하지 않는 순수 모듈이다.
const BADGES = Object.freeze({
  pending: { label: '소모임 등록 중', tone: 'ui-text-muted' },
  failed: { label: '소모임 등록 실패', tone: 'ui-text-danger' },
});

export function somoimBadge(state) {
  return BADGES[state] ?? null;
}

export function canJoin(state) {
  return state !== 'pending' && state !== 'failed';
}
```

`client/src/shared/useMeetups.js`에 추가(`toggleJoin` 아래):

```js
  async function retrySomoim(meetup) {
    if (isGuest.value) {
      requireLogin('다시 시도는 로그인하면 쓸 수 있어요.');
      return;
    }
    pendingId.value = meetup.id;
    actionError.value = '';
    try {
      await apiFetch(`/api/meetups/${meetup.id}/retry-somoim`, { method: 'POST' });
      await loadMeetups();
    } catch (error) {
      actionError.value = error.message;
    } finally {
      pendingId.value = '';
    }
  }
```

반환 객체에 `retrySomoim`을 추가한다.

`client/src/shared/MeetupCard.vue`:
- `somoimBadge`, `canJoin`을 import한다.
- 기존 모집중/마감 배지 옆에 등록 상태 배지를 추가한다:

```html
        <span
          v-if="somoimBadge(meetup.somoimState)"
          class="ui-bg-subtle ui-radius-pill inline-flex h-7 items-center px-3 text-[12px] font-semibold"
          :class="somoimBadge(meetup.somoimState).tone"
        >
          {{ somoimBadge(meetup.somoimState).label }}
        </span>
```

- 참여 버튼에 `:disabled="!canJoin(meetup.somoimState)"`를 더한다.
- `meetup.somoimState === 'failed' && meetup.isHost`일 때 버튼 두 개를 보여준다:

```html
        <template v-if="meetup.somoimState === 'failed' && meetup.isHost">
          <button
            class="focus-ring ui-radius-control ui-border h-9 border px-3 text-[12px] font-medium"
            type="button"
            @click="emit('retry-somoim', meetup)"
          >
            다시 시도
          </button>
          <button
            class="focus-ring ui-radius-control ui-text-danger h-9 px-3 text-[12px] font-medium"
            type="button"
            @click="emit('cancel', meetup)"
          >
            취소
          </button>
        </template>
```

`defineEmits`에 `'retry-somoim'`을 추가하고, `HomePage.vue`와 `MeetupPage.vue`의 `<MeetupCard>`에 `@retry-somoim="retrySomoim"`을 연결한다.

- [ ] **Step 4: Run tests and build**

Run: `node --test test/meetup-somoim-state.test.js && npm run build && npm run check:js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add client/src test/meetup-somoim-state.test.js
git commit -F - <<'EOF'
feat(meetups): show somoim registration state on the meetup card

Why: 등록이 끝나기 전에는 참가할 수 없고, 실패한 모임은 개설자가 다시 시도하거나
취소해야 한다. 화면이 그 상태를 알려주지 않으면 버튼이 왜 안 눌리는지 알 수 없다.

Decision: 상태 표현을 브라우저 API에 의존하지 않는 순수 모듈로 분리해 단위
테스트한다. 모르는 상태가 오면 막지 않는다 — 서버가 새 상태를 추가해도 화면이
멈추지 않게 한다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 11: 문서 갱신

**Files:**
- Modify: `AGENTS.md`
- Modify: `DEVELOPMENT.md`
- Modify: `SOMOIM_AUTOMATION.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 앞선 모든 태스크
- Produces: 없음(문서)

- [ ] **Step 1: AGENTS.md의 Backend feature 규칙에 훅 추가**

"의존성은 `ctx = { db, auth, storage, config }`로 주입한다. feature 간 직접 import 금지." 줄 아래에 추가:

```markdown
- feature끼리 알려야 할 일이 있으면 `ctx.hooks`를 쓴다. `onLoad(ctx)`에서
  `ctx.hooks.on(event, listener)`으로 구독하고, 이벤트를 내는 쪽은 누가 듣는지 모른다.
  `emit`은 리스너 반환값을 배열로 돌려주므로, 각 feature가 자기 테이블만 갱신한다.
```

- [ ] **Step 2: DEVELOPMENT.md의 meetups 항목에 상태 추가**

`meetups` 설명의 컬럼 목록에 `somoim_state`, `somoim_job_id`를 넣고 아래 설명을 더한다:

```markdown
- somoim_state는 앱 모임이 소모임 앱에도 등록됐는지를 나타낸다
  (none/pending/registered/failed). source_type='somoim'과 혼동하지 않는다 —
  그쪽은 "소모임에서 가져온 모임"이고 이쪽은 "앱 모임을 소모임에 올렸는가"다.
- pending과 failed인 모임에는 참가할 수 없다. failed는 개설자에게만 보인다.
```

- [ ] **Step 3: SOMOIM_AUTOMATION.md에 자동 트리거 절 추가**

"Job 생성" 절 앞에 추가:

```markdown
## job이 만들어지는 경로

웹에서 모임을 만들면 서버가 자동으로 job을 만든다. 운영진이 아닌 멤버도 모임을 열 수
있게 하는 것이 이 자동화의 목적이다. 관리자 화면의 요청 폼은 실패한 요청을 확인하고
수동으로 재시도하는 용도로 남는다.

자동 트리거는 `SOMOIM_AUTOMATION_ALLOW_SUBMIT=true`일 때만 동작한다. 꺼져 있으면
서버가 아예 구독하지 않아 모임 생성이 기존과 동일하게 끝난다.
```

- [ ] **Step 4: README.md Features의 Meetups 항목 갱신**

```markdown
- **Meetups** — 예정 모임 목록, 모임 만들기, 장소 검색, 참여/취소.
  모임을 만들면 Bot이 소모임 앱에도 정모를 자동 등록(등록 중에는 참여 불가)
```

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md DEVELOPMENT.md SOMOIM_AUTOMATION.md README.md
git commit -F - <<'EOF'
docs(somoim-automation): describe the meetup-triggered somoim registration

Why: 훅이라는 새 feature 간 통신 수단과 somoim_state가 생겼는데 어느 문서에도
없었다. 자동화 트리거가 관리자 수동 요청이라고 적혀 있던 부분도 실제와 어긋났다.

🤖 Generated with Claude Code / claude-opus-5

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

## 최종 검증

- [ ] `npm run check:js` 통과
- [ ] `node --test` 통과 (DB 통합 테스트는 로컬 skip)
- [ ] `npm run build` 통과
- [ ] 푸시 후 CI에서 통합 테스트가 skip 0으로 실행되는지 확인
- [ ] `SOMOIM_AUTOMATION_ALLOW_SUBMIT`이 꺼진 상태에서 모임을 만들어 `somoim_state='none'`으로 남고 기존과 동일하게 참가되는지 확인

---

## 실행 후 기록: 이 계획의 결함

실제로 실행해 보니 계획 자체에 문제가 있었다. 같은 실수를 반복하지 않도록 남긴다.
위 본문의 명백한 오류는 고쳐 두었고, 여기에는 구조적인 것만 적는다.

### 스펙의 요구사항 하나에 태스크가 없었다

스펙은 `registered` 상태를 정의하고 "성공하면 웹 모임이 정상 상태가 되고 참가
버튼이 열린다"고 명시했는데, **11개 태스크 중 그 전이를 구현하는 태스크가
없었다.** Task 8이 실패 경로만 다뤘다.

결과는 치명적이었다. worker가 소모임 등록에 성공해도 모임이 영원히 `pending`에
남아 아무도 참가할 수 없었다. 실패 경로는 완성됐는데 성공 경로가 끊긴 상태로
11개 태스크가 전부 "리뷰 통과"로 닫혔다 — 어느 태스크도 그 전이를 자기 책임으로
갖지 않았기 때문에 태스크별 리뷰로는 잡을 수 없었다.

계획을 쓸 때 "스펙의 각 요구사항마다 그것을 구현하는 태스크를 짚을 수 있는가"를
점검했지만 놓쳤다. **상태 기계를 설계했다면 전이 하나하나에 태스크를 대응시켜
표로 확인해야 한다.**

### 테스트 지시가 검증하지 못하는 테스트를 만들었다

브리프에 넣은 테스트 코드가 짧게 쓰려고 검증 대상을 가짜 객체로 주입하는 형태였다.
Task 5·6이 연달아 그 이유로 되돌아왔고, 두 번 다 "구현은 맞는데 테스트가 그 구현을
실행하지 않는다"였다.

더 나빴던 것은 그 습관이 만든 이음매다. 브랜치 전체 리뷰가 찾은 Critical 두 개가
정확히 거기 숨어 있었다.

- 재시도가 100% 실패했다. `getMeetupById`가 `title`/`location`을 반환하지 않아
  리스너가 예외를 던졌고, 훅이 그것을 삼켜 개설자는 원인과 무관한 503을 받았다.
  Task 9는 `hooks.emit`을, Task 5는 `getMeetupById`를 각각 가짜로 대체해서
  둘을 잇는 실제 경로가 어떤 테스트에서도 실행되지 않았다.
- `meetup.hooks.js`와 `markSomoimFailedByJob`에 테스트가 없어 "모임이 상태를
  바꾼다"는 사용자 가시 동작 전체가 자동 검증 밖이었다.

**태스크를 쪼개 각각 리뷰하면, 태스크 사이의 계약은 아무도 검증하지 않는다.**
계획에 태스크별 단위 테스트만 넣지 말고, 흐름 하나를 끝에서 끝까지 걷는 테스트를
명시적인 태스크로 둬야 한다.

### 브리프의 사실을 확인하지 않고 썼다

`listMeetups`에 `WHERE`가 없다고 적었지만 있었고(구현자가 발견해 기존 절에
조건을 더했다), 커밋 메시지 예시를 `docs:`로 적어 저장소 자신의
`<type>(<scope>):` 규칙을 어겼다(리뷰가 잡아 amend로 고쳤다).

구현자는 브리프를 요구사항으로 받고 그대로 따른다. **브리프에 코드를 인용할 때는
파일을 열어 확인하고 쓴다.**
