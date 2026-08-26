import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkerConfig } from '../worker/config.js';

const REQUIRED = {
  CAFESTUDY_SERVER_URL: 'https://example.test',
  INTERNAL_API_KEY: 'key',
};

test('멤버 알림은 기본으로 꺼져 있다', () => {
  // 클럽 124명에게 나가는 알림은 되돌릴 수 없다. 자동 등록은 아무도 안 보는
  // 시각에 돌고 재시도마다 반복되므로, 설정을 깜빡한 쪽이 조용한 편이어야 한다.
  assert.equal(createWorkerConfig(REQUIRED).notifyMembers, false);
});

test('멤버 알림은 명시적으로 켤 때만 켜진다', () => {
  assert.equal(
    createWorkerConfig({ ...REQUIRED, SOMOIM_NOTIFY_MEMBERS: 'true' }).notifyMembers,
    true,
  );
  // 오타나 애매한 값은 켜짐으로 해석하지 않는다.
  for (const value of ['false', 'TRUE', '1', 'yes', '']) {
    assert.equal(
      createWorkerConfig({ ...REQUIRED, SOMOIM_NOTIFY_MEMBERS: value }).notifyMembers,
      false,
      `"${value}"는 켜짐이 아니다`,
    );
  }
});

test('제출도 명시적으로 켤 때만 켜진다', () => {
  assert.equal(createWorkerConfig(REQUIRED).allowSubmit, false);
  assert.equal(
    createWorkerConfig({ ...REQUIRED, ALLOW_SOMOIM_SUBMIT: 'true' }).allowSubmit,
    true,
  );
});

test('서버 주소와 내부 키가 없으면 뜨지 않는다', () => {
  assert.throws(() => createWorkerConfig({ INTERNAL_API_KEY: 'key' }), /CAFESTUDY_SERVER_URL/);
  assert.throws(
    () => createWorkerConfig({ CAFESTUDY_SERVER_URL: 'https://example.test' }),
    /INTERNAL_API_KEY/,
  );
});
