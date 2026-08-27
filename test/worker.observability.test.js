import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyError, createWorkerLogger, normalizeJobFailure } from '../worker/observability.js';

test('worker 로그는 공통 필드를 가진 JSON 한 줄로 기록된다', () => {
  const lines = [];
  const log = createWorkerLogger({
    write: (line) => lines.push(line),
    now: () => new Date('2026-08-27T00:00:00.000Z'),
  });

  log('error', 'job_failed', { jobId: 'job-1', errorCode: 'DEVICE_UNAVAILABLE' });

  assert.deepEqual(JSON.parse(lines[0]), {
    timestamp: '2026-08-27T00:00:00.000Z',
    level: 'error',
    service: 'somoim-worker',
    event: 'job_failed',
    jobId: 'job-1',
    errorCode: 'DEVICE_UNAVAILABLE',
  });
});

test('job 실패를 검색 가능한 공통 필드와 오류 코드로 정규화한다', () => {
  const failure = normalizeJobFailure({
    job: { id: 'job-1', type: 'create_meetup', attempts: 2 },
    outcome: {
      errorMessage: 'ADB device is offline',
      needsManualReview: false,
      result: { stage: 'resolve-device' },
    },
    reportedJob: { requeued: true },
  });

  assert.deepEqual(failure, {
    jobId: 'job-1',
    jobType: 'create_meetup',
    stage: 'resolve-device',
    attempt: 2,
    errorCode: 'DEVICE_UNAVAILABLE',
    message: 'ADB device is offline',
    retryable: true,
    needsManualReview: false,
    submitAttempted: false,
  });
});

test('알 수 없는 실패도 안정적인 fallback 코드로 정규화한다', () => {
  const failure = normalizeJobFailure({
    job: { id: 'job-2', type: 'delete_meetup' },
    outcome: { errorMessage: 'unexpected', needsManualReview: true, result: {} },
    reportedJob: { requeued: false },
  });
  assert.equal(failure.errorCode, 'WORKER_JOB_FAILED');
  assert.equal(failure.retryable, false);
});

// --- stage → 오류 코드 ---

test('handler가 실제로 던지는 stage는 모두 코드가 있다', async () => {
  // 이 테스트가 이 방식의 핵심이다. stage를 새로 만들고 매핑을 빼먹으면 그 실패는
  // 전부 WORKER_JOB_FAILED로 뭉쳐 Discord 알림의 중복 제거까지 뭉갠다.
  const { readdir, readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  const files = [];
  for (const dir of ['worker', 'worker/handlers']) {
    for (const name of await readdir(dir)) {
      if (name.endsWith('.js')) files.push(path.join(dir, name));
    }
  }

  const stages = new Set();
  for (const file of files) {
    for (const [, stage] of (await readFile(file, 'utf8')).matchAll(/stage: '([a-z_]+)'/g)) {
      stages.add(stage);
    }
  }
  assert.ok(stages.size > 10, `stage를 못 찾았다(${stages.size}개) — 정규식이 낡았는지 본다`);

  const unmapped = [...stages].filter(
    (stage) => classifyError({ stage, message: '' }) === 'WORKER_JOB_FAILED',
  );
  assert.deepEqual(unmapped, [], '이 stage들에 오류 코드를 붙인다');
});

test('코드는 메시지 문구가 아니라 stage에서 나온다', () => {
  // 문구는 자주 다듬어진다. 같은 stage면 메시지가 어떻게 바뀌어도 코드는 같아야 한다.
  const codes = [
    'Filled form does not match the requested payload',
    '폼 값이 payload와 다릅니다',
    '',
  ].map((message) => classifyError({ stage: 'verify_form', message }));

  assert.deepEqual(codes, ['FORM_VALUE_MISMATCH', 'FORM_VALUE_MISMATCH', 'FORM_VALUE_MISMATCH']);
});

test('서로 다른 실패가 한 코드로 뭉치지 않는다', () => {
  // 제출 확인 실패와 시간 입력 실패가 같은 코드면 알림을 봐도 어디를 볼지 모른다.
  const submit = classifyError({ stage: 'submit', message: 'could not confirm the submit' });
  const time = classifyError({ stage: 'set_time', message: 'Typed time did not land' });
  const form = classifyError({ stage: 'verify_form', message: 'does not match' });

  assert.equal(new Set([submit, time, form]).size, 3);
});

test('stage가 없으면 메시지에서 기기 문제만 가려낸다', () => {
  // adb 명령 자체가 깨진 경우다. 남는 단서가 메시지뿐이라 여기서만 문장을 본다.
  assert.equal(
    classifyError({ message: 'Command failed: adb -s 1.2.3.4:5555 shell uiautomator dump' }),
    'DEVICE_UNAVAILABLE',
  );
  assert.equal(classifyError({ message: 'Device X is unauthorized' }), 'DEVICE_UNAUTHORIZED');
  assert.equal(classifyError({ message: '알 수 없는 실패' }), 'WORKER_JOB_FAILED');
});
