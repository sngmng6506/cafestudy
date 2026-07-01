export function createVerificationQueries(db) {
  return {
    async getMeetupForVerify(meetupId) {
      const result = await db.query(
        `SELECT host_id AS "hostId", scheduled_at AS "scheduledAt" FROM meetups WHERE id = $1`,
        [meetupId],
      );

      return result.rows[0];
    },

    async listByUser(userId) {
      const result = await db.query(
        `
          SELECT
            v.id,
            v.meetup_id AS "meetupId",
            v.photo_url AS "photoUrl",
            v.points_awarded AS "pointsAwarded",
            v.created_at AS "createdAt",
            m.title AS "meetupTitle",
            m.scheduled_at AS "meetupScheduledAt"
          FROM verifications v
          JOIN meetups m ON m.id = v.meetup_id
          WHERE v.user_id = $1
          ORDER BY v.created_at DESC
        `,
        [userId],
      );

      return result.rows;
    },

    async listApprovedPhotos() {
      const result = await db.query(
        `
          SELECT
            v.id,
            v.meetup_id AS "meetupId",
            v.photo_url AS "photoUrl",
            v.points_awarded AS "pointsAwarded",
            v.created_at AS "createdAt",
            m.title AS "meetupTitle",
            m.scheduled_at AS "meetupScheduledAt"
          FROM verifications v
          JOIN meetups m ON m.id = v.meetup_id
          WHERE v.status = 'approved'
          ORDER BY v.created_at DESC
        `,
      );

      return result.rows;
    },

    createVerificationWithPoints({ userId, meetupId, photoUrl, points }) {
      return db.transaction(async (client) => {
        const verificationResult = await client.query(
          `
            INSERT INTO verifications (meetup_id, user_id, photo_url, points_awarded, status)
            VALUES ($1, $2, $3, $4, 'approved')
            RETURNING
              id,
              meetup_id AS "meetupId",
              user_id AS "userId",
              photo_url AS "photoUrl",
              points_awarded AS "pointsAwarded",
              status,
              created_at AS "createdAt"
          `,
          [meetupId, userId, photoUrl, points],
        );

        const verification = verificationResult.rows[0];

        await client.query(
          `
            INSERT INTO point_logs (user_id, source, ref_id, amount)
            VALUES ($1, 'verify', $2, $3)
          `,
          [userId, verification.id, points],
        );

        await client.query(
          `
            UPDATE users
            SET total_points = total_points + $1
            WHERE id = $2
          `,
          [points, userId],
        );

        return verification;
      });
    },
  };
}
