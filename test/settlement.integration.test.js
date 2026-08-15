import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { createDb } from '../src/core/db.js';
import { createSettlementQueries } from '../src/features/settlements/settlement.queries.js';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const run = connectionString ? test : test.skip;
let pool;
let db;
let queries;

before(() => {
  if (!connectionString) return;
  pool = new Pool({ connectionString });
  db = createDb({ connectionString });
  queries = createSettlementQueries(db);
});

after(async () => {
  await db?.close();
  await pool?.end();
});

async function cleanup({ meetupId, userIds }) {
  await pool.query('DELETE FROM participants WHERE meetup_id = $1', [meetupId]);
  await pool.query('DELETE FROM meetups WHERE id = $1', [meetupId]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
}

run('settlement payment method is snapshotted and paid status is listed', async () => {
  const suffix = `${Date.now()}-${Math.random()}`;
  const userResult = await pool.query(
    `INSERT INTO users (nickname)
     VALUES ($1), ($2), ($3), ($4)
     RETURNING id`,
    [
      `settlement-creator-${suffix}`,
      `settlement-a-${suffix}`,
      `settlement-b-${suffix}`,
      `settlement-outsider-${suffix}`,
    ],
  );
  const [creator, participantA, participantB, outsider] = userResult.rows;

  const meetupResult = await pool.query(
    `INSERT INTO meetups (host_id, title, location, scheduled_at, capacity, status)
     VALUES ($1, $2, $3, now() + interval '2 hours', 4, 'open')
     RETURNING id`,
    [creator.id, `settlement-${suffix}`, 'test cafe'],
  );
  const meetupId = meetupResult.rows[0].id;

  try {
    await pool.query(
      `INSERT INTO participants (meetup_id, user_id)
       VALUES ($1, $2), ($1, $3), ($1, $4)`,
      [meetupId, creator.id, participantA.id, participantB.id],
    );

    await queries.upsertPaymentMethod({
      userId: creator.id,
      bankName: '첫은행',
      bankAccountNumber: '111-222',
      accountHolderName: '첫예금주',
      kakaopayLink: 'https://pay.example/first',
    });

    const first = await queries.createSettlement({
      meetupId,
      creatorId: creator.id,
      participantIds: [creator.id, participantA.id, participantB.id],
      totalAmount: 30000,
    });
    assert.equal(first.payerBankName, '첫은행');
    assert.equal(first.payerBankAccountNumber, '111-222');
    assert.equal(first.payerAccountHolderName, '첫예금주');
    assert.equal(first.payerKakaopayLink, 'https://pay.example/first');

    await queries.upsertPaymentMethod({
      userId: creator.id,
      bankName: '다음은행',
      bankAccountNumber: '333-444',
      accountHolderName: '다음예금주',
      kakaopayLink: 'https://pay.example/next',
    });

    const second = await queries.createSettlement({
      meetupId,
      creatorId: creator.id,
      participantIds: [creator.id, participantA.id],
      totalAmount: 20000,
    });
    assert.equal(second.payerBankName, '다음은행');

    let listed = await queries.listSettlementsForUser(participantA.id);
    const listedFirst = listed.find((round) => round.id === first.id);
    const listedSecond = listed.find((round) => round.id === second.id);
    assert.equal(listedFirst.payerBankName, '첫은행');
    assert.equal(listedFirst.payerBankAccountNumber, '111-222');
    assert.equal(listedFirst.fullySettled, false);
    assert.equal(listedSecond.payerBankName, '다음은행');

    const paidA = await queries.markParticipantPaid({ settlementId: first.id, userId: participantA.id });
    assert.equal(paidA.userId, participantA.id);
    assert.ok(paidA.paidAt);
    assert.equal(
      await queries.markParticipantPaid({ settlementId: first.id, userId: outsider.id }),
      null,
    );

    listed = await queries.listSettlementsForUser(participantA.id);
    assert.equal(listed.find((round) => round.id === first.id).fullySettled, false);

    await queries.markParticipantPaid({ settlementId: first.id, userId: participantB.id });
    listed = await queries.listSettlementsForUser(participantA.id);
    const fullySettledRound = listed.find((round) => round.id === first.id);
    assert.equal(fullySettledRound.fullySettled, true);
    assert.ok(fullySettledRound.participants.find((participant) => participant.id === participantA.id).paidAt);

    const unpaidA = await queries.unmarkParticipantPaid({ settlementId: first.id, userId: participantA.id });
    assert.equal(unpaidA.paidAt, null);
    listed = await queries.listSettlementsForUser(participantA.id);
    assert.equal(listed.find((round) => round.id === first.id).fullySettled, false);
    assert.equal(
      await queries.unmarkParticipantPaid({ settlementId: first.id, userId: outsider.id }),
      null,
    );
  } finally {
    await cleanup({ meetupId, userIds: [creator.id, participantA.id, participantB.id, outsider.id] });
  }
});
