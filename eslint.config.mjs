// 스타일이 아니라 "실행해봐야 아는 실수"를 잡는 것이 목적이다.
//
// 이 설정을 넣은 계기는 `REQUIRED_TIMEZONE is not defined`로 create_meetup이
// 실패한 일이다. 상수가 export되지 않았고 import도 없었는데, 그 참조가 실기기가
// 붙어야 닿는 경로라 테스트 481개를 전부 빠져나갔다. ESM은 없는 식별자를 모듈
// 로드 시점에 잡지 않는다 — 그 줄이 실행돼야 터진다. no-undef 하나면 잡혔다.
//
// 포맷팅 규칙은 넣지 않는다. 기존 코드 스타일이 이미 일관되고, 포맷터를 한 번
// 돌리면 전 파일이 diff로 뒤집혀 리뷰가 불가능해진다.
import js from '@eslint/js';
import globals from 'globals';

const unusedVars = ['error', {
  args: 'after-used',
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  // `({ avatarUrl, ...member }) => member`처럼 속성을 의도적으로 버리는 관용구를 허용한다
  ignoreRestSiblings: true,
  caughtErrors: 'none', // catch(error) { /* 무시 */ } 패턴을 허용한다
}];

export default [
  { ignores: ['node_modules/**', 'dist/**', 'client/dist/**', 'worker-artifacts/**', 'coverage/**'] },

  {
    // 서버·워커·스크립트·테스트 — Node ESM
    files: ['src/**/*.js', 'worker/**/*.js', 'scripts/**/*.js', 'test/**/*.js', 'shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': unusedVars,
      // == 비교는 0/''/null이 섞이는 검증 코드에서 실제 버그가 된다
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // 던지고 잊은 Promise
      'no-async-promise-executor': 'error',
    },
  },

  {
    // 크롤러는 Node에서 돌지만 page.evaluate() 안쪽은 puppeteer가 브라우저로
    // 보내 실행한다. 그 블록의 window·document는 진짜 전역이다.
    files: ['src/features/members/members.crawler.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  {
    // 손님·운영자 화면 — 브라우저 전역
    files: ['client/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': unusedVars,
    },
  },
];
