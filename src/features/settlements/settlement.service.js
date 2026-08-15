import { createSettlementQueries } from './settlement.queries.js';
import { throwForbidden, throwNotFound, throwValidation } from '../../shared/errors.js';
import { SETTLEMENT_LIMITS } from '../../../shared/domain-constraints.js';

export function createSettlementService({ db, settlementQueries }) {
  const queries = settlementQueries ?? createSettlementQueries(db);

  return {
    async listForUser(userId) {
      await queries.syncSomoimEventsToMeetups();
      const [meetups, settlements] = await Promise.all([
        queries.listUserMeetups(userId),
        queries.listSettlementsForUser(userId),
      ]);
      const byMeetup = settlements.reduce((map, settlement) => {
        (map[settlement.meetupId] ??= []).push(withShare(settlement));
        return map;
      }, {});
      return meetups.map((meetup) => ({ ...meetup, settlements: byMeetup[meetup.id] ?? [] }));
    },

    async getMyPaymentMethod(userId) {
      return (await queries.getPaymentMethod(userId)) ?? emptyPaymentMethod(userId);
    },

    async setPaymentMethod({ userId, bankName, bankAccountNumber, accountHolderName, kakaopayLink }) {
      const paymentMethod = normalizePaymentMethod({
        userId,
        bankName,
        bankAccountNumber,
        accountHolderName,
        kakaopayLink,
      });
      return queries.upsertPaymentMethod(paymentMethod);
    },

    async create({ meetupId, creatorId, participantIds, participantAmounts, totalAmount }) {
      const amount = Number(totalAmount);
      validateTotalAmount(amount);
      if (!meetupId) throwValidation('모임을 선택해 주세요.');
      const shares = normalizeParticipantAmounts({ participantIds, participantAmounts, totalAmount: amount });
      if (shares.length === 0) throwValidation('정산 참여자를 한 명 이상 선택해 주세요.');

      const result = await queries.createSettlement({
        meetupId,
        creatorId,
        participantAmounts: shares,
        totalAmount: amount,
      });
      if (result?.error === 'NOT_PARTICIPANT') {
        throwForbidden('SETTLEMENT_FORBIDDEN', '이 모임 참여자만 정산을 추가할 수 있어요.');
      }
      if (result?.error === 'INVALID_PARTICIPANT') {
        throwValidation('모임에 참여하지 않은 사람이 포함되어 있어요.');
      }
      return { ...result, participantCount: shares.length, amountPerPerson: Math.floor(amount / shares.length) };
    },

    async update({ settlementId, userId, isAdmin, participantAmounts, totalAmount }) {
      const amount = Number(totalAmount);
      validateTotalAmount(amount);
      const shares = normalizeParticipantAmounts({ participantAmounts, totalAmount: amount });
      if (shares.length === 0) throwValidation('정산 참여자를 한 명 이상 선택해 주세요.');

      const result = await queries.updateSettlement({
        settlementId,
        userId,
        isAdmin,
        participantAmounts: shares,
        totalAmount: amount,
      });
      if (result?.error === 'INVALID_PARTICIPANT') {
        throwValidation('모임에 참여하지 않은 사람이 포함되어 있어요.');
      }
      if (!result) throwNotFound('SETTLEMENT_NOT_FOUND', '수정할 수 있는 정산을 찾지 못했어요.');
      return { ...result, participantCount: shares.length, amountPerPerson: Math.floor(amount / shares.length) };
    },

    async markPaid({ settlementId, userId }) {
      const row = await queries.markParticipantPaid({ settlementId, userId });
      if (!row) {
        throwNotFound('SETTLEMENT_PARTICIPANT_NOT_FOUND', '내가 참여한 정산을 찾지 못했어요.');
      }
      return row;
    },

    async unmarkPaid({ settlementId, userId }) {
      const row = await queries.unmarkParticipantPaid({ settlementId, userId });
      if (!row) {
        throwNotFound('SETTLEMENT_PARTICIPANT_NOT_FOUND', '내가 참여한 정산을 찾지 못했어요.');
      }
      return row;
    },

    async remove({ settlementId, userId, isAdmin }) {
      const deleted = await queries.deleteSettlement({ settlementId, userId, isAdmin });
      if (!deleted) throwNotFound('SETTLEMENT_NOT_FOUND', '삭제할 수 있는 정산을 찾지 못했어요.');
      return { id: deleted.id, deleted: true };
    },
  };
}

function normalizePaymentMethod({ userId, bankName, bankAccountNumber, accountHolderName, kakaopayLink }) {
  const method = {
    userId,
    bankName: cleanText(bankName),
    bankAccountNumber: cleanText(bankAccountNumber),
    accountHolderName: cleanText(accountHolderName),
    kakaopayLink: cleanText(kakaopayLink),
  };

  const bankFields = [method.bankName, method.bankAccountNumber, method.accountHolderName];
  const filledBankFields = bankFields.filter(Boolean).length;
  if (filledBankFields > 0 && filledBankFields < bankFields.length) {
    throwValidation('은행명, 계좌번호, 예금주를 모두 입력하거나 모두 비워 주세요.');
  }

  assertMaxLength(method.bankName, SETTLEMENT_LIMITS.bankNameMaxLength, '은행명');
  assertMaxLength(method.bankAccountNumber, SETTLEMENT_LIMITS.bankAccountNumberMaxLength, '계좌번호');
  assertMaxLength(method.accountHolderName, SETTLEMENT_LIMITS.accountHolderNameMaxLength, '예금주');
  assertMaxLength(method.kakaopayLink, SETTLEMENT_LIMITS.kakaopayLinkMaxLength, '카카오페이 링크');

  return method;
}

function cleanText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function assertMaxLength(value, maxLength, label) {
  if (value && value.length > maxLength) {
    throwValidation(`${label}은 ${maxLength}자 이하로 입력해 주세요.`);
  }
}

function emptyPaymentMethod(userId) {
  return {
    userId,
    bankName: null,
    bankAccountNumber: null,
    accountHolderName: null,
    kakaopayLink: null,
    updatedAt: null,
  };
}

function validateTotalAmount(amount) {
  if (
    !Number.isInteger(amount)
    || amount < SETTLEMENT_LIMITS.minTotalAmount
    || amount > SETTLEMENT_LIMITS.maxTotalAmount
  ) {
    throwValidation('총액은 1원부터 1억원 사이의 정수로 입력해 주세요.');
  }
}

function normalizeParticipantAmounts({ participantIds, participantAmounts, totalAmount }) {
  if (Array.isArray(participantAmounts)) {
    const seen = new Set();
    const shares = participantAmounts
      .map((entry) => ({
        userId: entry?.userId,
        amountDue: Number(entry?.amountDue),
      }))
      .filter((entry) => entry.userId);

    for (const share of shares) {
      if (seen.has(share.userId)) throwValidation('정산 참여자가 중복되어 있어요.');
      seen.add(share.userId);
      if (!Number.isInteger(share.amountDue) || share.amountDue < 0) {
        throwValidation('참여자별 정산 금액은 0원 이상의 정수로 입력해 주세요.');
      }
    }

    const sum = shares.reduce((total, share) => total + share.amountDue, 0);
    if (sum !== totalAmount) throwValidation('참여자별 정산 금액 합계가 총액과 같아야 해요.');
    return shares;
  }

  const uniqueIds = [...new Set(Array.isArray(participantIds) ? participantIds.filter(Boolean) : [])];
  const amountPerPerson = uniqueIds.length ? Math.floor(totalAmount / uniqueIds.length) : 0;
  return uniqueIds.map((userId) => ({ userId, amountDue: amountPerPerson }));
}

function withShare(settlement) {
  const count = settlement.participants.length;
  const firstAmount = settlement.participants[0]?.amountDue ?? 0;
  const sameAmount = settlement.participants.every((participant) => participant.amountDue === firstAmount);
  return {
    ...settlement,
    participantCount: count,
    amountPerPerson: count ? Math.floor(settlement.totalAmount / count) : 0,
    remainder: count ? settlement.totalAmount % count : 0,
    customSplit: count > 0 && !sameAmount,
  };
}
