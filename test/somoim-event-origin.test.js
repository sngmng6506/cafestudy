import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOT_FROM_APP_MEETUP } from '../src/shared/somoim-event-origin.js';
import { createMembersQueries } from '../src/features/members/members.queries.js';
import { createCafesQueries } from '../src/features/cafes/cafes.queries.js';
import { createSettlementQueries } from '../src/features/settlements/settlement.queries.js';

// SQL을 실제로 실행해보는 건 DB 통합 테스트 몫이다(DATABASE_URL 없으면 skip).
// 여기서는 쿼리에 조건이 실려 나가는지만 본다 — 한 곳에서 빠지면 그 화면에서만
// 중복이 되살아나고, 눈에 띄기까지 오래 걸린다.
function recordingDb() {
  const statements = [];
  return {
    statements,
    async query(sql) {
      statements.push(sql);
      return { rows: [], rowCount: 0 };
    },
    async transaction(run) {
      return run({
        async query(sql) {
          statements.push(sql);
          return { rows: [], rowCount: 0 };
        },
      });
    },
  };
}

test('조건은 somoim_events를 e로 별칭한 쿼리에서만 쓸 수 있다', () => {
  // 다른 별칭을 쓰는 쿼리에 붙이면 조용히 엉뚱한 행을 참조하거나 터진다.
  assert.match(NOT_FROM_APP_MEETUP, /e\.title/);
  assert.match(NOT_FROM_APP_MEETUP, /e\.scheduled_at/);
  // meetups 쪽 별칭은 붙이는 쿼리의 별칭과 겹치면 안 된다.
  assert.match(NOT_FROM_APP_MEETUP, /FROM meetups origin/);
});

test('등록된 앱 모임만 짝으로 본다', () => {
  // pending이나 failed는 소모임에 정모가 없으니 크롤링으로 돌아올 것도 없다.
  assert.match(NOT_FROM_APP_MEETUP, /origin\.somoim_state = 'registered'/);
  // materialize된 source_type='somoim' 행을 짝으로 잡으면 자기 자신과 비교하게 된다.
  assert.match(NOT_FROM_APP_MEETUP, /origin\.source_type = 'app'/);
});

test('제목은 공백을 접어서 비교한다', () => {
  // 앱 모임 제목은 입력 그대로 저장되고, 등록 job은 normalizeText로 연속 공백을
  // 줄여 앱에 넣는다. 크롤러가 읽는 건 줄어든 쪽이라 원문끼리 비교하면 어긋난다.
  assert.match(NOT_FROM_APP_MEETUP, /regexp_replace\(btrim\(origin\.title\)/);
  assert.match(NOT_FROM_APP_MEETUP, /regexp_replace\(btrim\(e\.title\)/);
  // JS 문자열을 거쳐 Postgres에 \s+가 그대로 도착해야 한다.
  assert.ok(NOT_FROM_APP_MEETUP.includes("'\\s+'"), '이스케이프가 한 겹 벗겨져야 한다');
});

test('일시는 분 단위로 비교한다', () => {
  // 초가 어긋나면 짝을 못 찾고 중복이 되살아난다 — 실패가 조용해서 명시해 둔다.
  assert.match(NOT_FROM_APP_MEETUP, /date_trunc\('minute', origin\.scheduled_at\)/);
  assert.match(NOT_FROM_APP_MEETUP, /date_trunc\('minute', e\.scheduled_at\)/);
});

test('정모 목록은 앱 모임에서 온 정모를 빼고 조회한다', async () => {
  const db = recordingDb();
  await createMembersQueries(db).listEvents();

  assert.equal(db.statements.length, 1);
  assert.ok(
    db.statements[0].includes('FROM meetups origin'),
    '앱 모임과 겹치는 정모를 걸러야 예정 목록에 두 장 뜨지 않는다',
  );
});

test('프로필의 "앱 모임 참여"는 앱 모임만 센다', async () => {
  const db = recordingDb();
  await createMembersQueries(db).getMemberStats('user-1');

  const sql = db.statements[0];
  assert.match(sql, /m\.source_type = 'app'/, '라벨이 "앱 모임 참여"다');
  assert.match(sql, /FROM somoim_event_attendees/, '"정모 참석"은 그대로 크롤링 기준이다');
});

test('카페 방문은 앱 모임과 크롤링 정모를 겹치지 않게 센다', async () => {
  const db = recordingDb();
  const queries = createCafesQueries(db);
  await queries.listInternalCafeVisits('user-1');
  await queries.listSomoimCafeVisits('user-1');

  const [internal, somoim] = db.statements;
  // 앱 쪽: materialize된 소모임 행을 빼야 크롤링 쪽과 합산해도 두 번 세지 않는다.
  assert.match(internal, /m\.source_type = 'app'/);
  // 크롤링 쪽: 앱 모임에서 나간 정모를 빼야 위와 겹치지 않는다.
  assert.ok(somoim.includes('FROM meetups origin'));
});

test('카페 코멘트 권한은 좁히지 않는다', async () => {
  // 방문 "횟수"는 겹치면 안 되지만, 방문 "여부"는 소모임으로만 참석한 사람도
  // true여야 한다. EXISTS OR EXISTS라 중복 계수 문제가 없으니 건드리지 않는다.
  const db = recordingDb();
  await createCafesQueries(db).hasVisitedCafe({ userId: 'user-1', location: '스타벅스' });

  const sql = db.statements[0];
  assert.ok(!sql.includes('FROM meetups origin'), '권한 판정에는 제외 조건을 넣지 않는다');
  assert.match(sql, /FROM somoim_events e/, '소모임으로만 참석한 사람도 코멘트할 수 있다');
});

test('정산은 앱 모임에서 나간 정모를 다시 모임으로 만들지 않는다', async () => {
  const db = recordingDb();
  await createSettlementQueries(db).syncSomoimEventsToMeetups();

  const upsert = db.statements[0];
  assert.ok(
    upsert.includes('FROM meetups origin'),
    '앱 행이 이미 있는 모임을 materialize하면 정산 목록에 두 번 나온다',
  );
});
