const RANKING_LIMIT = 50;

export function createRankingQueries(db) {
  return {
    async getAllTimeRanking() {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            COALESCE(SUM(pl.amount), 0)::integer AS "points",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM users u
          LEFT JOIN badges b ON b.id = u.active_badge_id
          JOIN point_logs pl ON pl.user_id = u.id AND pl.source = 'verify'
          GROUP BY u.id, b.image_object_key
          ORDER BY "points" DESC, MIN(pl.created_at) ASC
          LIMIT $1
        `,
        [RANKING_LIMIT],
      );

      return withRank(result.rows);
    },

    async getMonthlyRanking({ start, end }) {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            COALESCE(SUM(pl.amount), 0)::integer AS "points",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM users u
          LEFT JOIN badges b ON b.id = u.active_badge_id
          JOIN point_logs pl ON pl.user_id = u.id
          WHERE pl.source = 'verify'
            AND pl.created_at >= $1
            AND pl.created_at < $2
          GROUP BY u.id, b.image_object_key
          ORDER BY "points" DESC, MIN(pl.created_at) ASC
          LIMIT $3
        `,
        [start, end, RANKING_LIMIT],
      );

      return withRank(result.rows);
    },
    // 정모 참석 횟수. 포인트 랭킹과 달리 point_logs가 아니라 크롤링한 참석 기록에서
    // 센다 — 실제로 모임에 나온 것은 소모임 앱이 기록하고, 앱 참여 버튼은 그것과
    // 별개이기 때문이다. face_id로 이어지지 않는 참석자(앱에만 있고 우리 users에는
    // 없는 사람)는 세지 않는다.
    //
    // start/end가 없으면 전체 기간이다. 같은 SQL을 쓰되 범위 조건만 비운다.
    async getAttendanceRanking({ start = null, end = null } = {}) {
      const result = await db.query(
        `
          SELECT
            u.id,
            u.nickname,
            COUNT(*)::integer AS "attendedCount",
            b.image_object_key AS "activeBadgeObjectKey"
          FROM somoim_event_attendees a
          JOIN somoim_events e ON e.id = a.event_id
          JOIN somoim_members sm ON sm.face_id = a.face_id
          JOIN users u ON u.id = sm.id
          LEFT JOIN badges b ON b.id = u.active_badge_id
          WHERE e.scheduled_at IS NOT NULL
            AND ($1::timestamptz IS NULL OR e.scheduled_at >= $1)
            AND ($2::timestamptz IS NULL OR e.scheduled_at < $2)
          GROUP BY u.id, b.image_object_key
          ORDER BY "attendedCount" DESC, MIN(e.scheduled_at) ASC
          LIMIT $3
        `,
        [start, end, RANKING_LIMIT],
      );

      return withRank(result.rows);
    },
  };
}

function withRank(rows) {
  return rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));
}
