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

// job payload가 담을 수 있는 크기다. 소모임 앱 화면이 실제로 받아주는 길이와는
// 다르다 — 앱은 장소를 20자, 지도 URL을 100자에서 말없이 자른다. 그 값들은 화면을
// 조작하는 쪽만 알면 되므로 worker/handlers/create-meetup.js에 있고, worker가
// 제출 직전에 payload를 그 길이에 맞춘다. 여기 숫자를 앱 한계로 읽으면 안 된다.
export const SOMOIM_AUTOMATION_LIMITS = Object.freeze({
  meetupTitleMaxLength: 80,
  locationMaxLength: 120,
  descriptionMaxLength: 1000,
  costMaxLength: 80,
  defaultCapacity: 8,
  maxCapacity: MEETUP_LIMITS.maxCapacity,
});

export const SETTLEMENT_LIMITS = Object.freeze({
  minTotalAmount: 1,
  maxTotalAmount: 100_000_000,
  bankNameMaxLength: 40,
  bankAccountNumberMaxLength: 40,
  accountHolderNameMaxLength: 40,
  kakaopayLinkMaxLength: 300,
});
