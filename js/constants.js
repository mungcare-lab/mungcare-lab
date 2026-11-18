/* 멍케어 Lab v0.7 — 화면 공통 상수
   8개 건강 카테고리 · 알러지 원료 · 종류/카테고리 라벨 */
"use strict";

const CATS = {
  joint: {label:'관절·뼈', short:'관절', emoji:'🦴', note:'슬개골·고관절이 신경 쓰인다면. 단, 슬개골 탈구는 영양제로 등급이 돌아오지 않습니다. 체중 관리가 먼저입니다.'},
  skin:  {label:'피부·알레르기', short:'피부', emoji:'🌿', note:'가려움·각질·장벽. 2주 이상 지속되는 가려움, 진물, 원형 탈모는 영양제보다 진료가 먼저입니다.'},
  eye:   {label:'눈·눈물', short:'눈', emoji:'👁️', note:'개는 사람과 달리 황반이 없어 루테인의 “황반 보호” 논리는 그대로 적용되지 않습니다. 눈물자국은 영양제로 없어지지 않고 원인 감별이 우선입니다.'},
  coat:  {label:'털·피모', short:'털', emoji:'✨', note:'모낭 주기가 4~6주라 변화 체감은 최소 6~8주. 급여량은 체중당 EPA+DHA로 계산해야 합니다.'},
  gut:   {label:'장·소화', short:'장', emoji:'🌾', note:'설사·구토가 이틀을 넘으면 유산균을 바꾸기 전에 진료가 먼저입니다. 혈변·검은 변은 바로 병원입니다.'},
  heart: {label:'심장', short:'심장', emoji:'❤️', note:'심장 영양제는 처방약을 대신하지 않습니다. 기침·헥헥거림이 이어지면 심장초음파가 먼저이고, 사상충 예방약과는 완전히 다른 제품입니다.'},
  oral:  {label:'구강·치아', short:'구강', emoji:'🦷', note:'양치가 1차, 덴탈껌·구강 유산균은 보조입니다. 이미 단단하게 붙은 치석은 스케일링 상담이 필요합니다.'},
  weight:{label:'체중 관리', short:'체중', emoji:'⚖️', note:'1차 수단은 급량 조절과 고단백·고섬유 사료입니다. 주 1~2% 감량이 안전하고, 그보다 빠르면 지방간 위험이 있습니다.'}
};

const CAT_ORDER = ['joint','skin','eye','coat','gut','heart','oral','weight'];

/* 화면 라벨 */
const KIND_KO = {supplement:'영양제', food:'사료', generic:'일반 항목'};
const CATEGORY_KO = {
  joint:'관절·뼈', skin:'피부·알레르기', eye:'눈·눈물', coat:'털·피모',
  gut:'장·소화', heart:'심장', oral:'구강·치아', weight:'체중 관리',
  food:'사료', extra:'종합·신장·간'
};

const ALLERGIES = ['닭고기','소고기','곡물','유제품','없음'];
const ALLERGY_KEYS = ['닭고기','소고기','곡물','유제품'];

/* 확인되지 않은 값의 표기 — 데이터가 null 이면 화면은 이 문구를 쓴다 */
const UNKNOWN = {
  price: '가격 미확인',
  review: '리뷰 정보 없음',
  evidence: '근거 자료 부족',
  info: '정보 미확인',
  seller: '판매처 미확인',
  checked: '확인일 미확인'
};
