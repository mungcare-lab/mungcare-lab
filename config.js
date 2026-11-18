/* 멍케어 Lab v0.7 — 설정
   여기 값만 바꾸면 유료 모듈·외부 검색 연동을 켜고 끌 수 있습니다.
   비밀 키는 절대 이 파일(브라우저로 내려가는 코드)에 두지 마세요.
   실제 API 키는 server/.env (서버리스 프록시) 에만 둡니다. */
window.APP_CONFIG = Object.assign({
  APP_VERSION: 'v0.7',

  /* 유료 기능 스위치 — false 이면 premium.js 는 아무 UI·결제·가격도 만들지 않습니다. */
  ENABLE_PREMIUM: false,

  /* 외부 통합 검색(네이버 쇼핑 + 쿠팡 파트너스) 프록시 주소.
     null 이면 미연동 상태로, 내부 DB 검색만 동작하고 화면에 그 사실을 표시합니다.
     예: 'https://mungcare-search.example.workers.dev/search' */
  EXTERNAL_SEARCH_ENDPOINT: null,
  EXTERNAL_SEARCH_TIMEOUT_MS: 3500,
  EXTERNAL_SEARCH_MIN_CHARS: 2,

  /* 정적 데이터 위치 (GitHub Pages 하위 경로에서도 동작하도록 상대 경로) */
  DATA_BASE: 'data/',

  /* 검색 결과 표시 상한 */
  SEARCH_PAGE_SIZE: 60,

  /* 카드에 ‘확인 날짜’를 보여줄 기준 */
  SHOW_CHECKED_DATE: true
}, window.APP_CONFIG_OVERRIDE || {});
