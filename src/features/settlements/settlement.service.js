import { createSettlementQueries } from './settlement.queries.js';
import { throwForbidden, throwNotFound, throwValidation } from '../../shared/errors.js';

export function createSettlementService({ db }) {
  const queries = createSettlementQueries(db);

  return {
    async listForUser(userId) {
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

    async create({ meetupId, creatorId, participantIds, totalAmount }) {
      const amount = Number(totalAmount);
      if (!meetupId) throwValidation('모임을 선택해 주세요.');
      if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000_000) {
        throwValidation('총액은 1원부터 1억원 사이의 정수로 입력해 주세요.');
      }
      const uniqueIds = [...new Set(Array.isArray(participantIds) ? participantIds.filter(Boolean) : [])];
      if (uniqueIds.length === 0) throwValidation('정산 참여자를 한 명 이상 선택해 주세요.');

      const result = await queries.createSettlement({
        meetupId,
        creatorId,
        participantIds: uniqueIds,
        totalAmount: amount,
      });
      if (result?.error === 'NOT_PARTICIPANT') {
        throwForbidden('SETTLEMENT_FORBIDDEN', '이 모임 참여자만 정산을 추가할 수 있어요.');
      }
      if (result?.error === 'INVALID_PARTICIPANT') {
        throwValidation('모임에 참여하지 않은 사람이 포함되어 있어요.');
      }
      return { ...result, participantCount: uniqueIds.length, amountPerPerson: Math.floor(amount / uniqueIds.length) };
    },

    async remove({ settlementId, userId, isAdmin }) {
      const deleted = await queries.deleteSettlement({ settlementId, userId, isAdmin });
      if (!deleted) throwNotFound('SETTLEMENT_NOT_FOUND', '삭제할 수 있는 정산을 찾지 못했어요.');
      return { id: deleted.id, deleted: true };
    },
  };
}

function withShare(settlement) {
  const count = settlement.participants.length;
  return {
    ...settlement,
    participantCount: count,
    amountPerPerson: count ? Math.floor(settlement.totalAmount / count) : 0,
    remainder: count ? settlement.totalAmount % count : 0,
  };
}
