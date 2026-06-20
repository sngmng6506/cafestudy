import { createMeetupQueries } from './meetup.queries.js';

export function createMeetupService({ db }) {
  const queries = createMeetupQueries(db);

  return {
    listMeetups() {
      return queries.listMeetups();
    },

    createMeetup(input) {
      validateMeetupInput(input);
      return queries.createMeetup(input);
    },
  };
}

function validateMeetupInput(input) {
  const requiredFields = ['hostId', 'title', 'cafeName', 'location', 'scheduledAt'];

  for (const field of requiredFields) {
    if (!input[field]) {
      const error = new Error(`${field} is required`);
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
  }
}
