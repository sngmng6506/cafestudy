import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchPlaces } from '../src/features/places/places.service.js';

const creds = { clientId: 'id', clientSecret: 'secret' };

test('searchPlaces maps NAVER items and strips HTML tags from the name', async () => {
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          title: '스타벅스 <b>강남</b>R점',
          address: '서울특별시 강남구 역삼동 1',
          roadAddress: '서울특별시 강남구 테헤란로 1',
          mapx: '1270200000',
          mapy: '375000000',
        },
      ],
    }),
  });

  const result = await searchPlaces('스타벅스', { fetchImpl, ...creds });
  assert.deepEqual(result, [
    {
      placeName: '스타벅스 강남R점',
      address: '서울특별시 강남구 역삼동 1',
      roadAddress: '서울특별시 강남구 테헤란로 1',
      lat: 37.5,
      lng: 127.02,
    },
  ]);
});

test('searchPlaces throws 503 when credentials are missing', async () => {
  await assert.rejects(
    () => searchPlaces('x', { fetchImpl: async () => ({}), clientId: '', clientSecret: '' }),
    (err) => err.statusCode === 503 && err.code === 'PLACES_NOT_CONFIGURED',
  );
});

test('searchPlaces throws 502 on an upstream failure', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });

  await assert.rejects(
    () => searchPlaces('x', { fetchImpl, ...creds }),
    (err) => err.statusCode === 502 && err.code === 'PLACES_SEARCH_FAILED',
  );
});
