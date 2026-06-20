export function createVerificationQueries(db) {
  return {
    async getMeetupHost(meetupId) {
      const result = await db.query(
        `SELECT host_id AS "hostId" FROM meetups WHERE id = $1`,
        [meetupId],
      );

      return result.rows[0];
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
