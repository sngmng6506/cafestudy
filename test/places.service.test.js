import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchPlaces } from '../src/features/places/places.service.js';

const creds = { restApiKey: 'rest-key' };

// 실기기 확인 응답을 그대로 줄인 것. 카카오는 x가 경도, y가 위도다.
const KAKAO_DOCUMENT = {
  id: '1095339694',
  place_name: '아비아채 서울홍대점',
  address_name: '서울 마포구 서교동 402-8',
  road_address_name: '서울 마포구 와우산로37길 52',
  x: '126.92834622902',
  y: '37.5569709129233',
  place_url: 'http://place.map.kakao.com/1095339694',
};

test('searchPlaces가 장소 ID와 상세페이지 URL을 함께 돌려준다', async () => {
  // 카카오로 옮긴 이유가 이 두 값이다. 네이버 지역 검색에는 둘 다 없어서 같은
  // 카페를 식별할 수도, 진짜 장소 링크를 만들 수도 없었다.
  const fetchImpl = async () => ({ ok: true, json: async () => ({ documents: [KAKAO_DOCUMENT] }) });

  const [place] = await searchPlaces('아비아채', { fetchImpl, ...creds });

  assert.equal(place.placeId, '1095339694');
  assert.equal(place.placeUrl, 'https://place.map.kakao.com/1095339694');
  assert.equal(place.placeName, '아비아채 서울홍대점');
  assert.equal(place.roadAddress, '서울 마포구 와우산로37길 52');
});

test('searchPlaces가 좌표를 뒤집지 않는다', async () => {
  // 카카오는 x=경도, y=위도라 순서가 흔한 관례와 반대다. 뒤집으면 지도가 엉뚱한
  // 곳을 가리키는데, 값이 둘 다 있어서 조용히 틀린다.
  const fetchImpl = async () => ({ ok: true, json: async () => ({ documents: [KAKAO_DOCUMENT] }) });

  const [place] = await searchPlaces('아비아채', { fetchImpl, ...creds });

  assert.ok(place.lat > 37 && place.lat < 38, `위도가 아니다: ${place.lat}`);
  assert.ok(place.lng > 126 && place.lng < 128, `경도가 아니다: ${place.lng}`);
});

test('searchPlaces가 http 상세 URL을 https로 맞춘다', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ documents: [{ ...KAKAO_DOCUMENT, place_url: 'http://place.map.kakao.com/1' }] }),
  });

  const [place] = await searchPlaces('x', { fetchImpl, ...creds });

  assert.equal(place.placeUrl, 'https://place.map.kakao.com/1');
});

test('searchPlaces가 빈 결과를 그대로 돌려준다', async () => {
  // 카카오는 확신이 없으면 아무것도 주지 않는다("정기모임장소 근처" 등). 그 경우
  // 그 장소는 합치지 않고 원본 문자열로 남긴다 — 억지로 좌표를 붙이지 않는다.
  const fetchImpl = async () => ({ ok: true, json: async () => ({ documents: [] }) });

  assert.deepEqual(await searchPlaces('정기모임장소 근처', { fetchImpl, ...creds }), []);
});

test('searchPlaces가 키 없이는 503을 던진다', async () => {
  await assert.rejects(
    () => searchPlaces('x', { fetchImpl: async () => ({}), restApiKey: '' }),
    (err) => err.statusCode === 503 && err.code === 'PLACES_NOT_CONFIGURED',
  );
});

test('searchPlaces가 상류 실패에 502를 던진다', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

  await assert.rejects(
    () => searchPlaces('x', { fetchImpl, ...creds }),
    (err) => err.statusCode === 502 && err.code === 'PLACES_SEARCH_FAILED',
  );
});
