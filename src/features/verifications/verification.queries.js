export function createVerificationQueries(db) {
  return {
    async getMeetupForVerify(meetupId) {
      const result = await db.query(
        `SELECT host_id AS "hostId", scheduled_at AS "scheduledAt"
           FROM meetups
          WHERE id = $1`,
        [meetupId],
      );
      return result.rows[0];
    },

    async isParticipant(meetupId, userId) {
      const result = await db.query(
        `SELECT 1
           FROM participants
          WHERE meetup_id = $1 AND user_id = $2
          LIMIT 1`,
        [meetupId, userId],
      );
      return result.rows.length > 0;
    },

    async createUploadTicket({
      uploadId,
      userId,
      meetupId,
      objectKey,
      contentType,
      contentLength,
      expiresAt,
      maxPendingUploads,
      maxUploadsPerHour,
    }) {
      return db.transaction(async (client) => {
        await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);

        const counts = await client.query(
          `SELECT
             COUNT(*) FILTER (
               WHERE status IN ('pending', 'finalizing') AND expires_at > now()
             )::int AS "pendingCount",
             COUNT(*) FILTER (
               WHERE created_at > now() - interval '1 hour'
             )::int AS "hourlyCount"
           FROM verification_uploads
          WHERE user_id = $1`,
          [userId],
        );
        const row = counts.rows[0];
        if (row.pendingCount >= maxPendingUploads) return { outcome: 'too_many_pending' };
        if (row.hourlyCount >= maxUploadsPerHour) return { outcome: 'hourly_limit' };

        await client.query(
          `INSERT INTO verification_uploads
             (id, meetup_id, user_id, object_key, content_type, content_length, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uploadId, meetupId, userId, objectKey, contentType, contentLength, expiresAt],
        );
        return { outcome: 'created' };
      });
    },

    async claimUploadTicket({ uploadId, userId, meetupId }) {
      const result = await db.query(
        `UPDATE verification_uploads
            SET status = 'finalizing'
          WHERE id = $1
            AND user_id = $2
            AND meetup_id = $3
            AND status = 'pending'
            AND expires_at > now()
        RETURNING
          id,
          object_key AS "objectKey",
          content_type AS "contentType",
          content_length AS "contentLength"`,
        [uploadId, userId, meetupId],
      );
      return result.rows[0] ?? null;
    },

    async failUploadTicket(uploadId, reason) {
      await db.query(
        `UPDATE verification_uploads
            SET status = 'failed', failure_reason = $2
          WHERE id = $1 AND status <> 'consumed'`,
        [uploadId, String(reason ?? 'failed').slice(0, 120)],
      );
    },

    async listByUser(userId) {
      const result = await db.query(
        `SELECT
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
         ORDER BY v.created_at DESC`,
        [userId],
      );
      return result.rows;
    },

    async listApprovedPhotos(userId, limit = 60) {
      const result = await db.query(
        `SELECT
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
           AND (
             m.host_id = $1
             OR EXISTS (
               SELECT 1 FROM participants p
                WHERE p.meetup_id = m.id AND p.user_id = $1
             )
           )
         ORDER BY v.created_at DESC
         LIMIT $2`,
        [userId, limit],
      );
      return result.rows;
    },

    createVerificationWithPoints({ userId, meetupId, uploadId, photoUrl, points }) {
      return db.transaction(async (client) => {
        const consumed = await client.query(
          `UPDATE verification_uploads
              SET status = 'consumed', consumed_at = now()
            WHERE id = $1
              AND user_id = $2
              AND meetup_id = $3
              AND status = 'finalizing'
          RETURNING id`,
          [uploadId, userId, meetupId],
        );
        if (consumed.rowCount === 0) return { outcome: 'upload_not_claimed' };

        const verificationResult = await client.query(
          `INSERT INTO verifications (meetup_id, user_id, photo_url, points_awarded, status)
           VALUES ($1, $2, $3, $4, 'approved')
           RETURNING
             id,
             meetup_id AS "meetupId",
             user_id AS "userId",
             photo_url AS "photoUrl",
             points_awarded AS "pointsAwarded",
             status,
             created_at AS "createdAt"`,
          [meetupId, userId, photoUrl, points],
        );
        const verification = verificationResult.rows[0];

        await client.query(
          `INSERT INTO point_logs (user_id, source, ref_id, amount)
           VALUES ($1, 'verify', $2, $3)`,
          [userId, verification.id, points],
        );
        await client.query(
          `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
          [points, userId],
        );
        return verification;
      });
    },
  };
}
