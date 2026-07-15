import { throwNotFound, throwValidation } from '../../shared/errors.js';
import { createNoticesQueries } from './notices.queries.js';

const TITLE_MAX = 100;
const BODY_MAX = 5000;

export function createNoticesService({ db }) {
  const queries = createNoticesQueries(db);

  function validate({ title, body }) {
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanBody = typeof body === 'string' ? body.trim() : '';
    if (!cleanTitle) throwValidation('공지 제목을 입력해 주세요.');
    if (cleanTitle.length > TITLE_MAX) throwValidation(`공지 제목은 ${TITLE_MAX}자까지 입력할 수 있어요.`);
    if (!cleanBody) throwValidation('공지 내용을 입력해 주세요.');
    if (cleanBody.length > BODY_MAX) throwValidation(`공지 내용은 ${BODY_MAX}자까지 입력할 수 있어요.`);
    return { title: cleanTitle, body: cleanBody };
  }

  return {
    list: (userId) => queries.list(userId),
    unreadCount: (userId) => queries.unreadCount(userId),

    async create(input) {
      const values = validate(input);
      return queries.create({ ...values, isPinned: input.isPinned === true, createdBy: input.createdBy });
    },

    async update(id, input) {
      const existing = await queries.findById(id);
      if (!existing) throwNotFound('NOTICE_NOT_FOUND', '공지를 찾을 수 없어요.');
      const values = validate(input);
      return queries.update(id, { ...values, isPinned: input.isPinned === true });
    },

    async remove(id) {
      const removed = await queries.remove(id);
      if (!removed) throwNotFound('NOTICE_NOT_FOUND', '공지를 찾을 수 없어요.');
      return { id, deleted: true };
    },

    async markRead(id, userId) {
      const notice = await queries.findById(id);
      if (!notice) throwNotFound('NOTICE_NOT_FOUND', '공지를 찾을 수 없어요.');
      await queries.markRead(id, userId);
      return { id, isRead: true };
    },

    async markAllRead(userId) {
      await queries.markAllRead(userId);
      return { unreadCount: 0 };
    },
  };
}
