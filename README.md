# 멍케어 Lab v0.8

반려견 사료·영양제 **96종**을 제품명·브랜드·제조사·성분·8개 건강 카테고리로 찾고,
확인된 가격과 성분 근거를 비교하는 정적 웹앱입니다. 로그인·설치 없이 동작합니다.

- 라이브: https://mungcare-lab.github.io/mungcare-lab/
- 배포: GitHub Pages (`gh-pages` 브랜치 루트), 소스는 `main`

## v0.8에서 달라진 점 — 법적 고지·면책 안내 개편

1. **신규 페이지 3종** — `disclaimer.html`(서비스 이용 안내 및 책임 범위, 제1조~제8조),
   `terms.html`(이용약관), `privacy.html`(개인정보 처리방침). 세 페이지 모두 같은 디자인 토큰과
   상단 문서 내비게이션을 쓰고, 모바일 390px에서 가로 스크롤이 없습니다.
2. **공통 푸터 3개 링크** — 모든 페이지(`index`·`disclaimer`·`terms`·`privacy`) 하단에
   서비스 이용 안내 · 이용약관 · 개인정보 처리방침. 연락처(이메일·문의 링크)는 두지 않았습니다.
3. **기능별 안내 박스** — 연한 회색 박스 + 정보 아이콘 + `자세한 이용 안내 보기`(→ `disclaimer.html`).
   급여량 계산기, 중복 검사 결과 아래, 제품 추천 목록 아래, 외부 쇼핑몰 버튼 옆에 배치했습니다.
4. **안전 단정 제거** — `완전히 안전`·`모두 이상 없음`·`과다 복용` 단정·`법적·금전적 책임을 지지 않습니다`
   표현을 걷어내고, "중복 신호 없음 / 병용 안전성이 보장되는 것은 아님 / 고의·중과실 책임은 면제되지 않음"으로 바꿨습니다.
   함량(mg) 표기가 완전하지 않은 제품이 조합에 있으면 **`정확한 위험 평가 불가`**를 함께 표시합니다.
5. **개인정보 처리방침은 실제 구현 기준** — 회원가입·서버 DB 없음, 입력값은 `localStorage`
   (`mc_state_v1`, `mc_requests_v1`)에만 저장, 쿠키·애널리틱스·제휴 링크 없음, GitHub Pages 접속 기록 가능성,
   외부 쇼핑몰 이동 시 해당 사업자 정책 적용을 그대로 적었습니다.

## v0.7에서 달라진 점

1. **통합 검색창을 사이트 상단으로** — 앱바 바로 아래, 탭 위에 항상 있습니다. 제품명·브랜드명(부분 일치, 한글/영문,
   띄어쓰기·대소문자 무시)으로 내부 DB를 먼저 찾고, 결과는 `통합 검색` 탭에 필터·정렬과 함께 표시합니다.
2. **외부 쇼핑몰은 검색 링크만** — API 키도, 크롤링도 쓰지 않습니다. 검색어를 인코딩해
   `네이버 쇼핑 검색`(`search.shopping.naver.com/search/all?query=…`)과 `쿠팡 검색`
   (`coupang.com/np/search?q=…`)을 새 탭(`target="_blank" rel="noopener"`)으로 엽니다.
3. **검색 결과 없음 안내** — 다음 문구를 그대로 보여주고, 같은 화면에서 두 쇼핑몰 검색과 등록 요청으로 이어집니다.
   > 아직 멍케어 Lab에 등록되지 않은 제품입니다. 아래 쇼핑몰에서 판매 여부를 확인할 수 있습니다.
4. **제품 직접 등록 요청 폼** — 제품명(필수)·브랜드명·상세 URL을 받아 **이 기기(localStorage)에만** 저장하고,
   복사할 수 있는 요청서 텍스트를 만듭니다. 정적 호스팅이라 **관리자에게 자동 전송되지 않습니다**(화면에 명시).
   실제 접수에는 별도 폼 서비스나 백엔드 연결이 필요합니다.
5. **데이터를 `data/*.json` 8개로 분리** — HTML 안의 인라인 데이터를 없애고 `fetch`로 불러옵니다.
6. **유료 모듈 분리** — `config.js`의 `ENABLE_PREMIUM = false`이면 `premium.js`는 정의만 있고
   유료 메뉴·배너·결제·가격표를 전혀 만들지 않습니다.

기존 기능(8개 부위 추천, 급여량 계산기, 96종 중복 진단 + 직접 추가, 맞춤 리포트·알러지 자동 제외·PDF/인쇄,
면책 고지)은 그대로 유지되며, v0.6 대비 카드·진단·리포트 HTML이 동일한지 문자열 대조로 확인했습니다
(`.build/test_parity.py`).

## 구조

```
index.html               셸(스타일 + 마크업) · 스크립트는 아래 순서로 로드
disclaimer.html          서비스 이용 안내 및 책임 범위 (제1조~제8조)
terms.html               이용약관
privacy.html             개인정보 처리방침 (localStorage·호스팅 로그·외부 링크)
config.js                설정 (ENABLE_PREMIUM, DATA_BASE, 검색 상한)
premium.js               유료 기능 모듈 (분리 보관, 스위치 꺼짐 = UI 없음)
js/constants.js          8개 카테고리·알러지·미확인 표기 상수
js/data.js               data/*.json 로더 + 정규화 → 기존 렌더러용 뷰 재구성
js/app.js                급여량 계산 · 중복 진단 · 리포트 · 진단 입력 UI
js/search.js             통합 검색 · 필터 · 정렬 · 자동완성 · 상세 드로어 · 등록 요청
data/brands.json         브랜드 49 (한글/영문명, 제조사)
data/ingredients.json    성분 44 (한글/영문명, 별칭, 분류)
data/products.json       제품 96 (21 비교 카드 + 75 진단 전용)
data/product_ingredients.json  제품↔성분 209행 (표기명·함량·공개 여부·라벨/진단 유래 구분)
data/product_offers.json 판매처 32행 (가격·용량·평점·리뷰수·확인일, 없으면 null)
data/product_reviews.json     제품별 리뷰 요약 21행
data/evidence.json       연구자료 29건 (성분 단위 연구 / 라벨·2차 자료 구분)
data/data_sources.json   출처 레지스트리 + 데이터 정책
server/  (없음)           v0.7은 서버리스 프록시를 쓰지 않습니다(API 키 없는 구성).
```

## 데이터 정책 (정직성)

- **확인하지 못한 값은 `null`**로 저장하고 화면에서는 `가격 미확인` · `리뷰 정보 없음` · `정보 미확인` ·
  `근거 자료 부족`으로 표시합니다. 추정 가격·별점·효능 문구를 만들지 않습니다.
- **가격이 확인된 제품은 21종**뿐입니다. 나머지 67종은 이름·브랜드·카테고리·성분 축만 등록된 진단 DB 항목이며,
  카드에 `가격 미확인`으로 표시됩니다.
- 연구자료는 **성분 자체 연구**와 **완제품 임상연구**를 상세 화면에서 분리해 보여줍니다. 완제품 임상은
  확인된 것이 없어 모두 `근거 자료 부족`으로 표시합니다(제조사 주장은 공개 논문 확인 전까지 근거로 쓰지 않음).
- 사료 상세의 원재료·영양 성분은 **제조사 공식 페이지에서 확인한 제품만** 채웠습니다
  (로얄캐닌 미니 어덜트, 오리젠 오리지널). 나머지 사료는 `정보 미확인`입니다.
- 자동 크롤링으로 수집하지 않습니다. 확인 날짜는 `lastChecked` / `product_offers[].checkedAt`에 기록합니다.

## 로컬에서 열기

`fetch`로 JSON을 읽으므로 파일을 직접 열면(`file://`) 동작하지 않습니다. 정적 서버로 열어 주세요.

```bash
python3 -m http.server 8000   # http://localhost:8000/index.html
```

## 배포

정적 파일만 있으면 됩니다.

```bash
git add -A && git commit -m "..." && git push origin main
git checkout gh-pages && git checkout main -- index.html config.js premium.js js data && git commit -m "..." && git push origin gh-pages
```

GitHub Pages 설정: `Settings → Pages → Source: Deploy from a branch → gh-pages / (root)`.

## 테스트

`.build/` 참고(개발용, 배포 대상 아님). Node 없이 Python + Playwright 로 실행합니다.

```bash
cd .build
python3 test_v08.py            # v0.8 법적 고지·면책 지시서 8번 전체 (96 checks)
python3 test_v07.py            # v0.7 지시서 1~10 + 수정 지시서 항목 (91 checks)
python3 test_parity.py         # v0.6 대비 카드·진단·리포트 HTML 동일성
python3 test_prices.py         # 가격·용량 표기
python3 test_dx_db.py          # 진단 DB 96종·검색·직접 추가
python3 test_ev_sort.py        # 근거 등급 정렬
python3 test_report_inputs.py  # 리포트 폼(체중·나이·중성화) 동기화
python3 test_allergy_filter.py # 알러지 자동 제외
python3 test_pure_free.py      # 순수 무료 UI
python3 test_pure_free_logic.py
python3 test_live.py           # 배포 URL 검증 (배포 후, v0.8 페이지·푸터 포함)
```

`.build/obsolete/`는 v0.5 유료 UI 시절 테스트로, 해당 화면이 v0.6에서 제거되어 현재 코드에서는 실행 대상이 아닙니다.
