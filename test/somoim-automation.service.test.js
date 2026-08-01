import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSomoimAutomationService } from '../src/features/somoim-automation/somoim-automation.service.js';

const USER_ID = '00000000-0000-0000-0000-000000000001';
const JOB_ID = '11111111-1111-1111-1111-111111111111';

function serviceWith({ allowSubmit = false, job = null } = {}) {
  const calls = {
    created: [],
    completed: [],
    failed: [],
  };
  const queries = {
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
