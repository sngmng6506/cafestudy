import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSomoimAutomationService } from '../src/features/somoim-automation/somoim-automation.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const JOB_ID = '11111111-1111-1111-1111-111111111111';

function serviceWith({ allowSubmit = false, job = null, jobs = [] } = {}) {
  const calls = {
    created: [],
    completed: [],
    failed: [],
    listed: [],
  };
  const queries = {
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
  };

  return {
    service: createSomoimAutomationService({ queries, allowSubmit }),
    calls,
  };
}

test('createMeetupJob: normalizes payload as dry-run by default', async () => {
  const { service, calls } = serviceWith();

  const result = await service.createMeetupJob({
    requestedBy: USER_ID,
    input: {
      title: '  토요일   카페 스터디 ',
      scheduledAt: '2026-07-25T14:00:00+09:00',
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
      scheduledAt: '2026-07-25T05:00:00.000Z',
      location: '강남역 스타벅스',
      capacity: 8,
      description: '각자 할 일',
      cost: '각자 음료',
      dryRun: true,
      submit: false,
    },
  });
});

test('createMeetupJob: blocks final submit unless explicitly enabled', async () => {
  const { service } = serviceWith({ allowSubmit: false });

  await assert.rejects(
    () => service.createMeetupJob({
      requestedBy: USER_ID,
      input: {
        title: '스터디',
        scheduledAt: '2026-07-25T14:00:00+09:00',
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
      scheduledAt: '2026-07-25T14:00:00+09:00',
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
        scheduledAt: '2026-07-25T14:00:00+09:00',
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
        scheduledAt: '2026-07-25T14:00:00+09:00',
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

  assert.deepEqual(await service.claimNextJob(), { job: claimed });
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
