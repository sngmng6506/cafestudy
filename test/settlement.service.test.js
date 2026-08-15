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
