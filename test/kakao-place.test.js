import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeKakaoPlaceId, normalizeKakaoPlaceUrl } from '../src/shared/kakao-place.js';

// 이 값은 소모임 정모의 "지도 URL" 칸에 그대로 들어가고, 그걸 누르는 건 모임
// 멤버들이다. 사용자가 보내는 값이라 여기가 유일한 관문이다.

test('카카오 장소 상세페이지만 통과시킨다', () => {
  assert.equal(
    normalizeKakaoPlaceUrl('https://place.map.kakao.com/1095339694'),
    'https://place.map.kakao.com/1095339694',
  );
});

test('다른 곳으로 데려가는 링크는 버린다', () => {
  for (const url of [
    'https://evil.example/1095339694',
    // 서브도메인·접두사를 흉내 낸 것들
    'https://place.map.kakao.com.evil.example/1',
    'https://notplace.map.kakao.com/1',
    'https://place.map.kakao.com@evil.example/1',
    // 스킴을 바꾼 것
    'http://place.map.kakao.com/1',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    // 경로가 장소 id가 아닌 것
    'https://place.map.kakao.com/',
    'https://place.map.kakao.com/1/../../x',
    'https://place.map.kakao.com/1?next=https://evil.example',
    'https://place.map.kakao.com/1#x',
  ]) {
    assert.equal(normalizeKakaoPlaceUrl(url), null, `${url}는 통과하면 안 된다`);
  }
});

test('값이 없으면 null이다', () => {
  for (const value of ['', '   ', null, undefined]) {
    assert.equal(normalizeKakaoPlaceUrl(value), null);
  }
});

test('앞뒤 공백은 다듬어서 받는다', () => {
  assert.equal(
    normalizeKakaoPlaceUrl('  https://place.map.kakao.com/1095339694  '),
    'https://place.map.kakao.com/1095339694',
  );
});

// 장소 ID는 URL과 모양이 다르다. 한 함수로 둘을 받던 시절엔 URL 규칙만 검사해서
// id 쪽은 사실상 아무 문자열이나 통과했다.
test('장소 ID는 숫자 문자열만 받는다', () => {
  assert.equal(normalizeKakaoPlaceId('1095339694'), '1095339694');
  assert.equal(normalizeKakaoPlaceId(1095339694), '1095339694');

  for (const value of ['abc', '10953 96', '109-53', "1'; DROP TABLE meetups; --", '1'.repeat(21), '']) {
    assert.equal(normalizeKakaoPlaceId(value), null, `${value}는 통과하면 안 된다`);
  }
});

test('URL을 장소 ID로 넘겨도 통과하지 않는다', () => {
  assert.equal(normalizeKakaoPlaceId('https://place.map.kakao.com/1095339694'), null);
});
