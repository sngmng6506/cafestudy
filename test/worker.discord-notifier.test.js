import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDeviceNotifier, createDiscordNotifier } from '../worker/discord-notifier.js';

const FAILURE = {
  jobId: 'job-1',
  jobType: 'create_meetup',
  stage: 'submit',
  attempt: 3,
  errorCode: 'EVENT_CREATION_UNCONFIRMED',
  message: '제출 후 생성 여부를 확인하지 못했습니다',
};

test('webhook URL이 없으면 외부 호출을 하지 않는다', async () => {
  let called = false;
  const notify = createDiscordNotifier({ fetchImpl: async () => { called = true; } });
  assert.deepEqual(await notify(FAILURE), { sent: false, reason: 'disabled' });
  assert.equal(called, false);
});

test('최종 실패를 Discord embed로 보내고 같은 실패는 중복 전송하지 않는다', async () => {
  const requests = [];
  const notify = createDiscordNotifier({
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 204 };
    },
  });

  assert.deepEqual(await notify(FAILURE), { sent: true });
  assert.deepEqual(await notify(FAILURE), { sent: false, reason: 'duplicate' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://discord.example/webhook');
  const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.embeds[0].title, '소모임 자동화 최종 실패');
  assert.match(payload.embeds[0].description, /생성 여부/);
  assert.doesNotMatch(requests[0].options.body, /webhookUrl|INTERNAL_API_KEY/);
});

test('Discord HTTP 오류를 호출자에게 전달한다', async () => {
  const notify = createDiscordNotifier({
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async () => ({ ok: false, status: 429 }),
  });
  await assert.rejects(() => notify(FAILURE), /HTTP 429/);
});

test('기기 단선과 복구를 서로 다른 embed로 보낸다', async () => {
  const requests = [];
  const notify = createDeviceNotifier({
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 204 };
    },
  });

  await notify({ type: 'device_lost', firstCheck: false, message: 'Device ... is not connected' });
  await notify({ type: 'device_recovered', deviceId: '192.168.200.147:5555', downtime: '30분' });

  assert.equal(requests[0].embeds[0].title, '태블릿 연결 끊김');
  assert.match(requests[0].embeds[0].description, /not connected/);
  assert.equal(requests[1].embeds[0].title, '태블릿 다시 연결됨');
  assert.ok(
    requests[1].embeds[0].fields.some((field) => field.value === '30분'),
    '복구 알림은 끊겨 있던 시간을 함께 보여준다',
  );
});

test('시작부터 기기가 없으면 제목으로 구분한다', async () => {
  const requests = [];
  const notify = createDeviceNotifier({
    webhookUrl: 'https://discord.example/webhook',
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 204 };
    },
  });

  await notify({ type: 'device_lost', firstCheck: true, message: 'No Android device is connected' });

  assert.equal(requests[0].embeds[0].title, '태블릿 없이 worker 시작됨');
});

test('기기 알림도 webhook이 없으면 외부 호출을 하지 않는다', async () => {
  let called = false;
  const notify = createDeviceNotifier({ fetchImpl: async () => { called = true; } });

  assert.deepEqual(await notify({ type: 'device_lost' }), { sent: false, reason: 'disabled' });
  assert.equal(called, false);
});
