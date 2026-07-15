export function createSettlementQueries(db) {
  return {
    async listUserMeetups(userId) {
      const result = await db.query(
        `SELECT
           m.id,
           m.title,
           m.location,
           m.scheduled_at AS "scheduledAt",
           m.status,
           json_agg(
             json_build_object('id', u.id, 'name', u.nickname)
             ORDER BY u.nickname
           ) AS participants
         FROM meetups m
         JOIN participants mine ON mine.meetup_id = m.id AND mine.user_id = $1
         JOIN participants p ON p.meetup_id = m.id
         JOIN users u ON u.id = p.user_id
         GROUP BY m.id
         ORDER BY m.scheduled_at DESC`,
        [userId],
      );
      return result.rows;
    },

    async listSettlementsForUser(userId) {
      const result = await db.query(
        `SELECT
           s.id,
           s.meetup_id AS "meetupId",
           s.round_no AS "roundNo",
           s.total_amount AS "totalAmount",
           s.created_by AS "createdBy",
           creator.nickname AS "createdByName",
           s.created_at AS "createdAt",
           json_agg(
             json_build_object('id', u.id, 'name', u.nickname)
             ORDER BY u.nickname
           ) AS participants
         FROM meetup_settlements s
         JOIN participants mine ON mine.meetup_id = s.meetup_id AND mine.user_id = $1
         JOIN meetup_settlement_participants sp ON sp.settlement_id = s.id
         JOIN users u ON u.id = sp.user_id
         JOIN users creator ON creator.id = s.created_by
         GROUP BY s.id, creator.nickname
         ORDER BY s.meetup_id, s.round_no`,
        [userId],
      );
      return result.rows;
    },

    async createSettlement({ meetupId, creatorId, participantIds, totalAmount }) {
      return db.transaction(async (client) => {
        await client.query(`SELECT id FROM meetups WHERE id = $1 FOR UPDATE`, [meetupId]);

        const membership = await client.query(
          `SELECT user_id AS id FROM participants WHERE meetup_id = $1`,
          [meetupId],
        );
        const memberIds = new Set(membership.rows.map((row) => row.id));
        if (!memberIds.has(creatorId)) return { error: 'NOT_PARTICIPANT' };
        if (participantIds.some((id) => !memberIds.has(id))) return { error: 'INVALID_PARTICIPANT' };

        const next = await client.query(
          `SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round
             FROM meetup_settlements
            WHERE meetup_id = $1`,
          [meetupId],
        );
        const roundNo = Number(next.rows[0].next_round);

        const inserted = await client.query(
          `INSERT INTO meetup_settlements (meetup_id, round_no, total_amount, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id, meetup_id AS "meetupId", round_no AS "roundNo",
                     total_amount AS "totalAmount", created_by AS "createdBy",
                     created_at AS "createdAt"`,
          [meetupId, roundNo, totalAmount, creatorId],
        );
        const settlement = inserted.rows[0];

        const values = participantIds.map((_, index) => `($1, $${index + 2})`).join(', ');
        await client.query(
          `INSERT INTO meetup_settlement_participants (settlement_id, user_id) VALUES ${values}`,
          [settlement.id, ...participantIds],
        );

        return settlement;
      });
    },

    async deleteSettlement({ settlementId, userId, isAdmin }) {
      const result = await db.query(
        `DELETE FROM meetup_settlements
          WHERE id = $1 AND (created_by = $2 OR $3::boolean)
          RETURNING id`,
        [settlementId, userId, isAdmin === true],
      );
      return result.rows[0] ?? null;
    },
  };
}
