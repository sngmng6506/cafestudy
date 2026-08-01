export const MEETUP_LIMITS = Object.freeze({
  minLeadMs: 30 * 60 * 1000,
  defaultCapacity: 6,
  maxCapacity: 100,
  capacityChoiceCount: 20,
});

export const BADGE_LIMITS = Object.freeze({
  maxPerUser: 5,
  maxPromptLength: 200,
  maxTitleLength: 40,
});

export const SOMOIM_AUTOMATION_LIMITS = Object.freeze({
  meetupTitleMaxLength: 80,
  locationMaxLength: 120,
  descriptionMaxLength: 1000,
  costMaxLength: 80,
  defaultCapacity: 8,
  maxCapacity: MEETUP_LIMITS.maxCapacity,
});