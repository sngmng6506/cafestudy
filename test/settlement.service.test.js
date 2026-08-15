import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSettlementService } from '../src/features/settlements/settlement.service.js';

const USER = '00000000-0000-0000-0000-000000000001';
const SETTLEMENT = '00000000-0000-0000-0000-000000000002';

function serviceWith(overrides = {}) {
  const calls = [];
  const queries = {
    async getPaymentMethod() { return null; },
    async upsertPaymentMethod(method) {
      calls.push(['upsertPaymentMethod', method]);
      return { ...method, updatedAt: new Date('2026-08-15T00:00:00.000Z') };
    },
    async markParticipantPaid() { return { settlementId: SETTLEMENT, userId: USER, paidAt: new Date() }; },
    async unmarkParticipantPaid() { return { settlementId: SETTLEMENT, userId: USER, paidAt: null }; },
    async createSettlement(payload) { return { id: SETTLEMENT, ...payload, participants: [] }; },
    async updateSettlement(payload) { return { id: SETTLEMENT, ...payload, participants: [] }; },
    ...overrides,
  };
  return {
    calls,
    service: createSettlementService({ settlementQueries: queries }),
  };
}

test('payment method allows empty bank fields and trims blank strings to null', async () => {
  const { service, calls } = serviceWith();
  const result = await service.setPaymentMethod({
    userId: USER,
    bankName: ' ',
    bankAccountNumber: '',
    accountHolderName: undefined,
    kakaopayLink: ' ',
  });

  assert.equal(result.bankName, null);
  assert.equal(result.bankAccountNumber, null);
  assert.equal(result.accountHolderName, null);
  assert.equal(result.kakaopayLink, null);
  assert.deepEqual(calls[0][1], {
    userId: USER,
    bankName: null,
    bankAccountNumber: null,
    accountHolderName: null,
    kakaopayLink: null,
  });
});

test('payment method allows kakaopay link without bank fields', async () => {
  const { service } = serviceWith();
  const result = await service.setPaymentMethod({
    userId: USER,
    kakaopayLink: ' https://qr.kakaopay.com/test ',
  });

  assert.equal(result.bankName, null);
  assert.equal(result.bankAccountNumber, null);
  assert.equal(result.accountHolderName, null);
  assert.equal(result.kakaopayLink, 'https://qr.kakaopay.com/test');
});

test('payment method rejects partial bank fields', async () => {
  const { service } = serviceWith();
  await assert.rejects(
    () => service.setPaymentMethod({
      userId: USER,
      bankName: '카페은행',
      bankAccountNumber: '123-456',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('payment method rejects fields over configured length', async () => {
  const { service } = serviceWith();
  await assert.rejects(
    () => service.setPaymentMethod({
      userId: USER,
      bankName: 'a'.repeat(41),
      bankAccountNumber: '123',
      accountHolderName: '홍길동',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );

  await assert.rejects(
    () => service.setPaymentMethod({
      userId: USER,
      kakaopayLink: 'a'.repeat(301),
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('markPaid throws not found when current user is not a participant', async () => {
  const { service } = serviceWith({
    async markParticipantPaid() { return null; },
  });

  await assert.rejects(
    () => service.markPaid({ settlementId: SETTLEMENT, userId: USER }),
    (error) => error.statusCode === 404 && error.code === 'SETTLEMENT_PARTICIPANT_NOT_FOUND',
  );
});

test('unmarkPaid throws not found when current user is not a participant', async () => {
  const { service } = serviceWith({
    async unmarkParticipantPaid() { return null; },
  });

  await assert.rejects(
    () => service.unmarkPaid({ settlementId: SETTLEMENT, userId: USER }),
    (error) => error.statusCode === 404 && error.code === 'SETTLEMENT_PARTICIPANT_NOT_FOUND',
  );
});

test('create rejects participant amounts that do not add up to total', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.create({
      meetupId: 'meetup-1',
      creatorId: USER,
      totalAmount: 10000,
      participantAmounts: [
        { userId: USER, amountDue: 7000 },
        { userId: '00000000-0000-0000-0000-000000000003', amountDue: 2000 },
      ],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('create forwards custom participant amounts to queries', async () => {
  const { service, calls } = serviceWith({
    async createSettlement(payload) {
      calls.push(['createSettlement', payload]);
      return { id: SETTLEMENT, ...payload };
    },
  });

  await service.create({
    meetupId: 'meetup-1',
    creatorId: USER,
    totalAmount: 10000,
    participantAmounts: [
      { userId: USER, amountDue: 7000 },
      { userId: '00000000-0000-0000-0000-000000000003', amountDue: 3000 },
    ],
  });

  assert.deepEqual(calls[0][1].participantAmounts, [
    { userId: USER, amountDue: 7000 },
    { userId: '00000000-0000-0000-0000-000000000003', amountDue: 3000 },
  ]);
});

test('update rejects participant amounts that do not add up to total', async () => {
  const { service } = serviceWith();

  await assert.rejects(
    () => service.update({
      settlementId: SETTLEMENT,
      userId: USER,
      totalAmount: 10000,
      participantAmounts: [
        { userId: USER, amountDue: 9000 },
      ],
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('update throws not found when settlement cannot be edited', async () => {
  const { service } = serviceWith({
    async updateSettlement() { return null; },
  });

  await assert.rejects(
    () => service.update({
      settlementId: SETTLEMENT,
      userId: USER,
      totalAmount: 10000,
      participantAmounts: [
        { userId: USER, amountDue: 10000 },
      ],
    }),
    (error) => error.statusCode === 404 && error.code === 'SETTLEMENT_NOT_FOUND',
  );
});
