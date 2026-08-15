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
           s.payer_bank_name AS "payerBankName",
           s.payer_bank_account_number AS "payerBankAccountNumber",
           s.payer_account_holder_name AS "payerAccountHolderName",
           s.payer_kakaopay_link AS "payerKakaopayLink",
           s.created_at AS "createdAt",
           bool_and(sp.user_id = s.created_by OR sp.paid_at IS NOT NULL) AS "fullySettled",
           json_agg(
             json_build_object('id', u.id, 'name', u.nickname, 'amountDue', sp.amount_due, 'paidAt', sp.paid_at)
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

    async getPaymentMethod(userId) {
      const result = await db.query(
        `SELECT
           user_id AS "userId",
           bank_name AS "bankName",
           bank_account_number AS "bankAccountNumber",
           account_holder_name AS "accountHolderName",
           kakaopay_link AS "kakaopayLink",
           updated_at AS "updatedAt"
         FROM settlement_payment_methods
         WHERE user_id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },

    async upsertPaymentMethod({ userId, bankName, bankAccountNumber, accountHolderName, kakaopayLink }) {
      const result = await db.query(
        `INSERT INTO settlement_payment_methods (
           user_id,
           bank_name,
           bank_account_number,
           account_holder_name,
           kakaopay_link
         )
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
           bank_name = EXCLUDED.bank_name,
           bank_account_number = EXCLUDED.bank_account_number,
           account_holder_name = EXCLUDED.account_holder_name,
           kakaopay_link = EXCLUDED.kakaopay_link,
           updated_at = now()
         RETURNING
           user_id AS "userId",
           bank_name AS "bankName",
           bank_account_number AS "bankAccountNumber",
           account_holder_name AS "accountHolderName",
           kakaopay_link AS "kakaopayLink",
           updated_at AS "updatedAt"`,
        [userId, bankName, bankAccountNumber, accountHolderName, kakaopayLink],
      );
      return result.rows[0];
    },

    async createSettlement({ meetupId, creatorId, participantAmounts, totalAmount }) {
      return db.transaction(async (client) => {
        await client.query(`SELECT id FROM meetups WHERE id = $1 FOR UPDATE`, [meetupId]);

        const membership = await client.query(
          `SELECT user_id AS id FROM participants WHERE meetup_id = $1`,
          [meetupId],
        );
        const memberIds = new Set(membership.rows.map((row) => row.id));
        if (!memberIds.has(creatorId)) return { error: 'NOT_PARTICIPANT' };
        if (participantAmounts.some((participant) => !memberIds.has(participant.userId))) return { error: 'INVALID_PARTICIPANT' };

        const next = await client.query(
          `SELECT COALESCE(MAX(round_no), 0) + 1 AS next_round
             FROM meetup_settlements
            WHERE meetup_id = $1`,
          [meetupId],
        );
        const roundNo = Number(next.rows[0].next_round);

        const paymentMethod = await client.query(
          `SELECT
             bank_name,
             bank_account_number,
             account_holder_name,
             kakaopay_link
           FROM settlement_payment_methods
           WHERE user_id = $1`,
          [creatorId],
        );
        const payer = paymentMethod.rows[0] ?? {};

        const inserted = await client.query(
          `INSERT INTO meetup_settlements (
             meetup_id,
             round_no,
             total_amount,
             created_by,
             payer_bank_name,
             payer_bank_account_number,
             payer_account_holder_name,
             payer_kakaopay_link
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, meetup_id AS "meetupId", round_no AS "roundNo",
                     total_amount AS "totalAmount", created_by AS "createdBy",
                     payer_bank_name AS "payerBankName",
                     payer_bank_account_number AS "payerBankAccountNumber",
                     payer_account_holder_name AS "payerAccountHolderName",
                     payer_kakaopay_link AS "payerKakaopayLink",
                     created_at AS "createdAt"`,
          [
            meetupId,
            roundNo,
            totalAmount,
            creatorId,
            payer.bank_name ?? null,
            payer.bank_account_number ?? null,
            payer.account_holder_name ?? null,
            payer.kakaopay_link ?? null,
          ],
        );
        const settlement = inserted.rows[0];

        const values = participantAmounts
          .map((_, index) => `($1, $${index * 2 + 2}, $${index * 2 + 3})`)
          .join(', ');
        await client.query(
          `INSERT INTO meetup_settlement_participants (settlement_id, user_id, amount_due) VALUES ${values}`,
          [
            settlement.id,
            ...participantAmounts.flatMap((participant) => [participant.userId, participant.amountDue]),
          ],
        );

        return settlement;
      });
    },

    async markParticipantPaid({ settlementId, userId }) {
      const result = await db.query(
        `UPDATE meetup_settlement_participants
            SET paid_at = now()
          WHERE settlement_id = $1 AND user_id = $2
          RETURNING settlement_id AS "settlementId", user_id AS "userId", paid_at AS "paidAt"`,
        [settlementId, userId],
      );
      return result.rows[0] ?? null;
    },

    async unmarkParticipantPaid({ settlementId, userId }) {
      const result = await db.query(
        `UPDATE meetup_settlement_participants
            SET paid_at = NULL
          WHERE settlement_id = $1 AND user_id = $2
          RETURNING settlement_id AS "settlementId", user_id AS "userId", paid_at AS "paidAt"`,
        [settlementId, userId],
      );
      return result.rows[0] ?? null;
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
