import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSomoimAutomationService } from '../src/features/somoim-automation/somoim-automation.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const JOB_ID = '11111111-1111-1111-1111-111111111111';

// scheduledAt must be in the future (see normalizeScheduledAt), so tests build it
// relative to "now" instead of a fixed date. Returns both a +09:00-offset input
// string (to exercise the KST-to-UTC conversion) and the equivalent UTC ISO string.
function futureScheduledAt(hoursFromNow = 24) {
  // Round to the second so stripping milliseconds for the +09:00 input below
  // doesn't drift the parsed instant away from the expected ISO string.
  const instant = new Date(Math.floor((Date.now() + hoursFromNow * 60 * 60 * 1000) / 1000) * 1000);
  const kstOffsetInput = new Date(instant.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '+09:00');
  return { input: kstOffsetInput, iso: instant.toISOString() };
}

function serviceWith({ allowSubmit = false, job = null, jobs = [], recovered = [], ...options } = {}) {
  const calls = {
    created: [],
    completed: [],
    failed: [],
    listed: [],
    requeued: [],
    jobRequeues: [],
    order: [],
  };
  const queries = {
    async requeueStaleJobs(input) {
      calls.requeued.push(input);
      calls.order.push('requeueStaleJobs');
      return recovered;
    },
    async listJobs(input) {
      calls.listed.push(input);
      return jobs.slice(input.offset, input.offset + input.limit);
    },
    async createJob(input) {
      calls.created.push(input);
      return {
        id: JOB_ID,
        requestedBy: input.requestedBy,
        type: input.type,
        payload: input.payload,
        status: 'pending',
        createdAt: '2026-07-17T00:00:00.000Z',
      };
    },
    async getJob(id) {
      return id === JOB_ID ? job : null;
    },
    async claimNextJob() {
      calls.order.push('claimNextJob');
      return job;
    },
    async completeJob(input) {
      calls.completed.push(input);
      return job;
    },
    async failJob(input) {
      calls.failed.push(input);
      return job;
    },
    async requeueJob(id, errorMessage) {
      calls.jobRequeues.push({ id, errorMessage });
      return { ...job, status: 'pending' };
    },
  };

  return {
    service: createSomoimAutomationService({ queries, allowSubmit, ...options }),
    calls,
  };
}

test('createMeetupJob: normalizes payload as dry-run by default', async () => {
  const { service, calls } = serviceWith();
  const scheduledAt = futureScheduledAt();

  const result = await service.createMeetupJob({
    requestedBy: USER_ID,
    input: {
      title: '  토요일   카페 스터디 ',
      scheduledAt: scheduledAt.input,
      location: ' 강남역 스타벅스 ',
      capacity: '8',
      description: ' 각자 할 일 ',
      cost: '각자 음료',
    },
  });

  assert.equal(result.jobId, JOB_ID);
  assert.equal(result.status, 'pending');
  assert.deepEqual(calls.created[0], {
    requestedBy: USER_ID,
    type: 'create_meetup',
    payload: {
      title: '토요일 카페 스터디',
      scheduledAt: scheduledAt.iso,
      location: '강남역 스타벅스',
      capacity: 8,
      description: '각자 할 일',
      cost: '각자 음료',
      dryRun: true,
      submit: false,
    },
  });
});

test('createMeetupJob: rejects a scheduledAt that has already passed', async () => {
  const { service, calls } = serviceWith();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await assert.rejects(
    () => service.createMeetupJob({
      requestedBy: USER_ID,
      input: { title: '스터디', scheduledAt: past, location: '강남' },
    }),
    /scheduledAt must be in the future/,
  );
  assert.deepEqual(calls.created, [], '지난 시각은 job으로 만들지 않는다');
});

test('createMeetupJob: blocks final submit unless explicitly enabled', async () => {
  const { service } = serviceWith({ allowSubmit: false });

  await assert.rejects(
    () => service.createMeetupJob({
      requestedBy: USER_ID,
      input: {
        title: '스터디',
        scheduledAt: futureScheduledAt().input,
        location: '강남',
        submit: true,
      },
    }),
    /Final submit is disabled/,
  );
});

test('createMeetupJob: allows final submit only when configured', async () => {
  const { service, calls } = serviceWith({ allowSubmit: true });

  await service.createMeetupJob({
    requestedBy: USER_ID,
    input: {
      title: '스터디',
      scheduledAt: futureScheduledAt().input,
      location: '강남',
      submit: true,
    },
  });

  assert.equal(calls.created[0].payload.dryRun, false);
  assert.equal(calls.created[0].payload.submit, true);
});

test('createMeetupJob: validates required fields and capacity', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.createMeetupJob({
      requestedBy: USER_ID,
      input: {
        title: '',
        scheduledAt: futureScheduledAt().input,
        location: '강남',
      },
    }),
    /title is required/,
  );

  await assert.rejects(
    () => service.createMeetupJob({
      requestedBy: USER_ID,
      input: {
        title: '스터디',
        scheduledAt: futureScheduledAt().input,
        location: '강남',
        capacity: 101,
      },
    }),
    /capacity must be an integer/,
  );
});

test('listJobs: reads one extra row to report hasMore without a count query', async () => {
  const jobs = Array.from({ length: 5 }, (_, index) => ({ id: `job-${index}` }));
  const { service, calls } = serviceWith({ jobs });

  const page = await service.listJobs({ limit: 2 });

  assert.deepEqual(calls.listed[0], { statuses: null, limit: 3, offset: 0 });
  assert.deepEqual(page.items, [{ id: 'job-0' }, { id: 'job-1' }]);
  assert.equal(page.hasMore, true);
  assert.equal(page.nextOffset, 2);
});

test('listJobs: reports the last page without a next offset jump', async () => {
  const { service } = serviceWith({ jobs: [{ id: 'job-0' }, { id: 'job-1' }] });

  const page = await service.listJobs({ limit: 20, offset: 0 });

  assert.equal(page.items.length, 2);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextOffset, 2);
});

test('listJobs: accepts a comma separated status filter and drops duplicates', async () => {
  const { service, calls } = serviceWith();

  await service.listJobs({ status: 'pending, claimed ,pending' });

  assert.deepEqual(calls.listed[0].statuses, ['pending', 'claimed']);
});

test('listJobs: treats an empty status filter as no filter', async () => {
  const { service, calls } = serviceWith();

  await service.listJobs({ status: '' });
  await service.listJobs({});

  assert.equal(calls.listed[0].statuses, null);
  assert.equal(calls.listed[1].statuses, null);
});

test('listJobs: rejects unknown statuses and out of range paging', async () => {
  const { service, calls } = serviceWith();

  await assert.rejects(() => service.listJobs({ status: 'deleted' }), /status must be one of/);
  await assert.rejects(() => service.listJobs({ limit: 0 }), /limit must be an integer/);
  await assert.rejects(() => service.listJobs({ limit: 51 }), /limit must be an integer/);
  await assert.rejects(() => service.listJobs({ limit: 1.5 }), /limit must be an integer/);
  await assert.rejects(() => service.listJobs({ offset: -1 }), /offset must be an integer/);
  await assert.rejects(() => service.listJobs({ offset: Number.NaN }), /offset must be an integer/);

  assert.deepEqual(calls.listed, [], 'invalid input must never reach the database');
});

test('claimNextJob: returns a stable job envelope', async () => {
  const claimed = { id: JOB_ID, status: 'claimed' };
  const { service } = serviceWith({ job: claimed });

  assert.deepEqual(await service.claimNextJob(), { job: claimed, recovered: 0, exhausted: [] });
});

test('claimNextJob: surfaces recovered jobs handed to a human as exhausted', async () => {
  const recovered = [
    { id: 'job-1', status: 'pending' },
    { id: 'job-2', status: 'needs_manual_review' },
    { id: 'job-3', status: 'needs_manual_review' },
  ];
  const { service } = serviceWith({ job: null, recovered });

  const outcome = await service.claimNextJob();
  assert.equal(outcome.recovered, 3, 'recovered stays a count for the documented worker contract');
  assert.deepEqual(outcome.exhausted, [
    { id: 'job-2', status: 'needs_manual_review' },
    { id: 'job-3', status: 'needs_manual_review' },
  ]);
});

test('claimNextJob: recovers stale claims before handing out the next job', async () => {
  const { service, calls } = serviceWith({ job: null });

  await service.claimNextJob();

  assert.deepEqual(calls.order, ['requeueStaleJobs', 'claimNextJob'],
    'a stale job must be requeued before the claim query runs');
  assert.deepEqual(calls.requeued[0], {
    staleAfterSeconds: 900,
    maxAttempts: 3,
    exhaustedMessage: 'Worker stopped responding before reporting a result',
  });
});

test('claimNextJob: reports how many stale claims were recovered', async () => {
  const recovered = [{ id: 'job-1', status: 'pending' }, { id: 'job-2', status: 'needs_manual_review' }];
  const { service } = serviceWith({ job: null, recovered });

  assert.equal((await service.claimNextJob()).recovered, 2);
});

test('claimNextJob: honours configured stale window and attempt budget', async () => {
  const { service, calls } = serviceWith({ job: null, staleClaimSeconds: 120, maxAttempts: 1 });

  await service.claimNextJob();

  assert.equal(calls.requeued[0].staleAfterSeconds, 120);
  assert.equal(calls.requeued[0].maxAttempts, 1);
});

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

test('createJobForMeetup: 제목이 소모임 길이 제한을 넘으면 예외 대신 failed를 돌려준다', async () => {
  const { service, calls } = serviceWith({ allowSubmit: true });

  const result = await service.createJobForMeetup({
    id: 'meetup-1',
    hostId: USER_ID,
    title: '가'.repeat(81),
    description: null,
    location: '장소',
    scheduledAt: '2026-08-29T01:00:00.000Z',
    capacity: 6,
  });

  assert.deepEqual(result, { failed: true, reason: result.reason });
  assert.match(result.reason, /title must be/);
  assert.deepEqual(calls.created, [], '거부된 입력은 job으로 만들지 않는다');
});

test('completeJob/failJob: require a claimed job update to succeed', async () => {
  const { service } = serviceWith({ job: null });

  await assert.rejects(
    () => service.completeJob({ id: JOB_ID, result: {} }),
    /Only claimed jobs can be completed/,
  );

  await assert.rejects(
    () => service.failJob({ id: JOB_ID, errorMessage: '앱 화면 변경' }),
    /Only claimed jobs can be failed/,
  );
});

test('failJob: 일시적 장애면 시도 횟수가 남는 동안 다시 큐에 넣는다', async () => {
  const claimed = { id: JOB_ID, status: 'claimed', attempts: 1, payload: {} };
  const { service, calls } = serviceWith({ job: claimed, maxAttempts: 3 });

  const outcome = await service.failJob({
    id: JOB_ID,
    errorMessage: 'app launch timed out',
    needsManualReview: false,
  });

  assert.equal(outcome.requeued, true);
  assert.deepEqual(calls.jobRequeues, [{ id: JOB_ID, errorMessage: 'app launch timed out' }],
    '일시적 실패 사유도 requeueJob에 남겨야 admin 목록에서 볼 수 있다');
  assert.deepEqual(calls.failed, [], '아직 실패로 확정하지 않는다');
});

test('failJob: 일시적 장애라도 errorMessage 없이는 거부한다', async () => {
  const claimed = { id: JOB_ID, status: 'claimed', attempts: 1, payload: {} };
  const { service, calls } = serviceWith({ job: claimed, maxAttempts: 3 });

  await assert.rejects(
    () => service.failJob({ id: JOB_ID, errorMessage: '', needsManualReview: false }),
    /errorMessage is required/,
  );
  assert.deepEqual(calls.jobRequeues, [], '검증 실패 시 큐에 다시 넣으면 안 된다');
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

test('cancelJobForMeetup: 아직 집어가지 않은 job만 중단한다', async () => {
  let capturedSql = '';
  let capturedParams = null;
  const db = {
    async query(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [{ id: JOB_ID, status: 'failed' }] };
    },
  };
  const service = createSomoimAutomationService({ db });

  const result = await service.cancelJobForMeetup(JOB_ID);

  assert.equal(result.status, 'failed');
  assert.match(capturedSql, /status = 'pending'/, 'claim된 job은 건드리면 안 된다');
  assert.deepEqual(capturedParams, [JOB_ID, '모임이 취소되어 등록을 중단했어요']);
});

test('cancelJobForMeetup: 이미 claim된 job이면 아무것도 바꾸지 않는다', async () => {
  const db = { async query() { return { rows: [] }; } };
  const service = createSomoimAutomationService({ db });

  assert.equal(await service.cancelJobForMeetup(JOB_ID), null);
});

test('cancelJobForMeetup: jobId 형식을 검증한다', async () => {
  const service = createSomoimAutomationService({ db: {} });
  await assert.rejects(() => service.cancelJobForMeetup('not-a-uuid'), /jobId must be a valid UUID/);
});
