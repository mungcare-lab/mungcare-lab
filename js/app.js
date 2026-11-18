/* 멍케어 Lab v0.7 — 앱 로직(급여량 계산·중복 진단·리포트·이벤트)
   데이터는 data/*.json (js/data.js 로더)에서 옵니다. */
"use strict";

/* =========================================================
   1. 데이터 — js/constants.js(상수) + js/data.js(data/*.json 로드)
   PRODUCTS(비교 카드 21) · EXTRAS(진단 75) · HOOKS 는 js/data.js 가 채웁니다.
   ========================================================= */


const EV_TXT = {strong:'근거 강함', mid:'근거 보통', weak:'근거 약함'};
/* 부위별 추천 정렬: 근거 강함(0) → 보통(1) → 약함(2). 같은 등급은 데이터 순서 유지 */
const EV_ORDER = {strong:0, mid:1, weak:2};
function evRank(ev){
  return Object.prototype.hasOwnProperty.call(EV_ORDER, ev) ? EV_ORDER[ev] : 3;
}
function evScore(ev){
  return ev === 'strong' ? 3 : (ev === 'mid' ? 2 : (ev === 'weak' ? 1 : 0));
}

/* ---------- 알러지 자동 제외 ---------- */
function activeAllergies(){
  return state.allergies.filter(function(x){ return ALLERGY_KEYS.indexOf(x) > -1; });
}
function conflictAllergens(p, alg){
  return (p.allergens || []).filter(function(a){ return (alg || activeAllergies()).indexOf(a) > -1; });
}
function isExcluded(p, alg){
  return conflictAllergens(p, alg).length > 0;
}
/* 전성분을 끝까지 확인하지 못해 "안전하다"고 단정할 수 없는 제품인지 */
function unverifiedLabel(p){
  if(!p.allergenNote) return false;
  return /미확인|미표기|미공개|확인하지 못|확인되지 않|표기되지|표기 부족/.test(p.allergenNote);
}
/* 부위별로 알러지 원료가 든 제품을 빼고, 남은 제품 중 근거 등급이 가장 높은 하나를 고른다 */
function comboPicks(){
  const alg = activeAllergies();
  return CAT_ORDER.map(function(c){
    const list = PRODUCTS.filter(function(p){ return p.cat === c; });
    let best = null;
    const excluded = [];
    list.forEach(function(p){
      if(isExcluded(p, alg)){ excluded.push(p); return; }
      if(!best || evScore(p.ev) > evScore(best.ev)) best = p;
    });
    return {cat:c, pick:best, excluded:excluded, total:list.length};
  });
}
const LEVEL_LABEL = {high:'주의', mid:'확인 필요', ok:'이상 없음', unk:'판단 보류'};

/* =========================================================
   2. 상태 · 저장
   ========================================================= */
const LS = 'mc_state_v1';

const state = {
  weight: 5.2,
  age: 'adult',
  neuter: true,
  concern: 'joint',
  cat: 'joint',
  view: 'products',
  foodKcal: 3600,
  diet: [],
  dx: null,
  breed: '',
  allergies: [],
  reportOpen: false,
  paidTab: 'dx',
  q: '',
  custom: [],
  customSeq: 1,
  addChips: []
};

function save(){
  try{
    localStorage.setItem(LS, JSON.stringify({
      weight:state.weight, age:state.age, neuter:state.neuter, concern:state.concern,
      foodKcal:state.foodKcal, diet:state.diet, breed:state.breed,
      allergies:state.allergies, custom:state.custom
    }));
  }catch(e){}
}
function load(){
  try{
    const raw = localStorage.getItem(LS);
    if(!raw) return;
    const o = JSON.parse(raw);
    if(typeof o.weight === 'number') state.weight = o.weight;
    if(o.age) state.age = o.age;
    if(typeof o.neuter === 'boolean') state.neuter = o.neuter;
    if(o.concern && CATS[o.concern]) state.concern = o.concern;
    if(o.foodKcal) state.foodKcal = o.foodKcal;
    if(Array.isArray(o.diet)) state.diet = o.diet.slice(0,3);
    if(typeof o.breed === 'string') state.breed = o.breed;
    if(Array.isArray(o.allergies)) state.allergies = o.allergies;
    if(Array.isArray(o.custom)){
      state.custom = o.custom.filter(function(c){ return c && c.id && c.name; }).map(function(c){
        return {id:c.id, name:String(c.name).slice(0,40), prof:c.prof || {disc:'none'}, search:c.search || c.name};
      });
      state.customSeq = state.custom.length + 1;
    }
  }catch(e){}
}

/* =========================================================
   3. 계산
   ========================================================= */
function rerOf(kg){ return 70 * Math.pow(kg, 0.75); }
function factorOf(age, neuter){
  if(age === 'puppy4') return 3.0;
  if(age === 'puppy')  return 2.0;
  if(age === 'senior') return 1.4;
  return neuter ? 1.6 : 1.8;
}
function ageLabel(age){
  return {puppy4:'퍼피 (4개월 미만)', puppy:'퍼피 (4~12개월)', adult:'성견 (1~7세)', senior:'노령견 (7세 이상)'}[age] || '성견';
}
function nf(n, digits){
  const d = (typeof digits === 'number') ? digits : 0;
  const parts = Number(n).toFixed(d).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}
function fmtCount(n){
  if(!n || n === '—') return '';
  const num = Number(String(n).replace(/,/g, ''));
  if(!isFinite(num)) return String(n);
  if(num >= 10000) return (num/10000).toFixed(1).replace(/\.0$/, '') + '만';
  return nf(num);
}
function calc(){
  const w = Math.max(0.5, Math.min(90, Number(state.weight) || 0.5));
  const rer = rerOf(w);
  const der = rer * factorOf(state.age, state.neuter);
  const kcalPer100 = Math.max(200, Number(state.foodKcal) || 3600) / 10;
  const foodKcal = der * 0.9;
  const grams = foodKcal / kcalPer100 * 100;
  return {w:w, rer:rer, der:der, foodKcal:foodKcal, grams:grams, treatKcal:der * 0.1};
}
function renderCalc(){
  const c = calc();
  document.getElementById('kGram').innerHTML = nf(c.grams) + '<small>g/일</small>';
  document.getElementById('kRer').innerHTML  = nf(Math.round(c.rer)) + '<span>kcal</span>';
  document.getElementById('kDer').innerHTML  = nf(Math.round(c.der)) + '<span>kcal</span>';
  document.getElementById('kMeal').innerHTML = nf(c.grams/2) + '<span>g</span>';
  document.getElementById('calcNote').innerHTML =
    '하루 ' + nf(Math.round(c.der)) + 'kcal 중 간식 한도 ' + nf(Math.round(c.treatKcal)) +
    'kcal. 두 끼로 나누면 ' + nf(c.grams/2) + 'g씩입니다.';
}

/* =========================================================
   4. 화면 전환
   ========================================================= */
function showView(v){
  state.view = v;
  ['products','search','calc','paid'].forEach(function(k){
    const el = document.getElementById('view-' + k);
    if(el) el.classList.toggle('on', k === v);
  });
  document.querySelectorAll('[data-view]').forEach(function(b){
    b.setAttribute('aria-selected', String(b.dataset.view === v));
  });
  window.scrollTo(0, 0);
}
function showPaidTab(t){
  state.paidTab = t;
  document.querySelectorAll('[data-ptab]').forEach(function(b){
    b.setAttribute('aria-selected', String(b.dataset.ptab === t));
  });
  document.getElementById('pane-dx').classList.toggle('on', t === 'dx');
  document.getElementById('pane-report').classList.toggle('on', t === 'report');
}

/* =========================================================
   5. 부위별 추천
   ========================================================= */
function renderCats(){
  document.getElementById('catPills').innerHTML = CAT_ORDER.map(function(k){
    return '<button role="tab" type="button" data-cat="' + k + '" aria-selected="' +
      (k === state.cat) + '">' + CATS[k].emoji + ' ' + CATS[k].label + '</button>';
  }).join('');
}

function chanRow(ch, label){
  if(!ch){
    return '<div class="chan-row na"><span class="ch">' + label + '</span>' +
      '<span class="rate">판매처 미확인</span><span class="price">—</span></div>';
  }
  const rate = (ch.r && ch.r !== '—') ? '★ ' + ch.r : '평점 없음';
  const cnt = (ch.n && ch.n !== '—') ? ' · 리뷰 ' + fmtCount(ch.n) : '';
  const sz = ch.sz ? ' <small>(' + ch.sz + ')</small>' : '';
  return '<div class="chan-row"><span class="ch">' + label + '</span>' +
    '<span class="rate">' + rate + cnt + '</span><span class="price">' + ch.p + sz + '</span></div>';
}

function cardHTML(p){
  const q = encodeURIComponent(p.q || (p.brand + ' ' + p.name));
  const hook = HOOKS[p.id] || '';
  const ing = p.ing.map(function(x){
    return '<span>' + x[0] + (x[1] ? ' <i>' + x[1] + '</i>' : '') + '</span>';
  }).join('');
  const when = '가격·평점 기준 ' +
    (p.ch.coupang ? '쿠팡 ' + p.ch.coupang.as : '쿠팡 미확인') + ' / ' +
    (p.ch.naver ? '네이버 ' + p.ch.naver.as : '네이버 미확인');

  const buy = [];
  if(p.ch.coupang) buy.push('<a class="btn fill" href="https://www.coupang.com/np/search?q=' + q + '" target="_blank" rel="noopener">쿠팡에서 보기</a>');
  if(p.ch.naver) buy.push('<a class="btn line" href="https://search.shopping.naver.com/search/all?query=' + q + '" target="_blank" rel="noopener">네이버에서 보기</a>');

  const hit = conflictAllergens(p, activeAllergies());
  const algLine = hit.length
    ? '<span class="alg-tag hit">⚠ 선택한 알러지(' + hit.join('·') + ') 포함 — 리포트 추천에서 제외</span>'
    : (p.allergens && p.allergens.length
        ? '<span class="alg-tag">포함 원료: ' + p.allergens.join(' · ') + '</span>'
        : (p.allergenNote ? '<span class="alg-tag note">' + (unverifiedLabel(p) ? '원료 확인 필요: ' : '원료 메모: ') + p.allergenNote + '</span>' : ''));

  return '' +
  '<article class="pcard">' +
    '<div class="p-top">' +
      '<div style="min-width:0">' +
        '<div class="p-brand">' + p.brand + '</div>' +
        '<h3 class="p-name">' + p.name + '</h3>' +
      '</div>' +
      '<span class="ev ' + p.ev + '">' + (EV_TXT[p.ev] || p.evLabel) + '</span>' +
    '</div>' +
    (hook ? '<p class="p-hook">' + hook + '</p>' : '') +
    algLine +
    '<div class="chan">' + chanRow(p.ch.coupang, '쿠팡') + chanRow(p.ch.naver, '네이버') + '</div>' +
    (buy.length ? '<div class="p-cta">' + buy.join('') + '</div>' : '') +
    '<details class="acc">' +
      '<summary>연구·성분 근거 보기</summary>' +
      '<div class="acc-body">' +
        '<div class="ingrow">' + ing + '</div>' +
        '<p><b>' + p.evTitle + '</b></p>' +
        '<p>' + p.evBody + '</p>' +
        '<a class="src" href="' + p.src.u + '" target="_blank" rel="noopener">근거: ' + p.src.t + ' ↗</a>' +
        '<div class="warn">⚠ ' + p.warn + '</div>' +
        '<p class="revline"><b>리뷰 요약</b> · ' + p.rev + '</p>' +
        '<p class="stamp">' + when + '</p>' +
      '</div>' +
    '</details>' +
  '</article>';
}

function renderProducts(){
  const list = PRODUCTS.filter(function(p){ return p.cat === state.cat; })
    .map(function(p, i){ return {p:p, i:i}; })
    .sort(function(a, b){
      const d = evRank(a.p.ev) - evRank(b.p.ev);
      return d !== 0 ? d : a.i - b.i;
    })
    .map(function(x){ return x.p; });
  document.getElementById('plist').innerHTML = list.map(cardHTML).join('');
  document.getElementById('catNote').textContent = CATS[state.cat].note;
  document.querySelectorAll('[data-cat]').forEach(function(b){
    b.setAttribute('aria-selected', String(b.dataset.cat === state.cat));
  });
}

/* =========================================================
   6. 진단 엔진 (룰 기반)
   ========================================================= */
function dietCatalog(){
  const base = PRODUCTS.map(function(p){
    return {id:p.id, name:p.brand + ' ' + p.name, cat:p.cat, prof:p.prof, search:p.brand + ' ' + p.name, tag:''};
  }).concat(EXTRAS.map(function(e){
    return {id:e.id, name:e.name, cat:e.cat || 'extra', prof:e.prof, search:e.search || e.name, tag:e.tag || ''};
  }));
  return base.concat((state.custom || []).map(function(c){
    return {id:c.id, name:c.name, cat:'custom', prof:c.prof, search:c.search || c.name, tag:'직접 추가', custom:true};
  }));
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function normQ(s){ return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ''); }

function selectedItems(){
  const all = dietCatalog();
  return state.diet.map(function(id){ return all.find(function(x){ return x.id === id; }); }).filter(Boolean);
}

function diagnose(){
  const items = selectedItems();
  const has = function(k){ return items.some(function(i){ return i.prof[k]; }); };
  const cnt = function(k){ return items.filter(function(i){ return i.prof[k]; }).length; };
  const c = calc();
  const out = [];

  /* --- 지용성 비타민 A·D --- */
  const vitSupp = items.filter(function(i){ return i.prof.vitAD && !i.prof.food; }).length;
  const foodItem = items.some(function(i){ return i.prof.food; });
  if(vitSupp >= 2){
    out.push({
      id:'vitad', level: vitSupp >= 3 ? 'high' : 'mid',
      title:'지용성 비타민 A·D 중복',
      brief:'A·D를 공급하는 보충제가 ' + vitSupp + '개 겹칩니다. 지용성은 배출이 느려 상한 초과 위험이 있습니다.',
      fix:'A·D 함유 제품은 1개만 남기고, 나머지는 같은 목적의 비-A/D 성분(예: 오메가3·유산균)으로 교체하세요.',
      amount:'완전사료를 주식으로 유지한다면 A·D 단독 보충제는 추가하지 않는 쪽이 안전합니다. 추가할 경우 2주 간격으로 급여량을 다시 확인하세요.',
      watch:'식욕 저하, 구토, 과도한 음수, 피부 각질 증가가 보이면 즉시 중단.'
    });
  } else if(vitSupp === 1 && foodItem){
    out.push({
      id:'vitad', level:'mid',
      title:'사료 위에 A·D 보충제 1개 추가',
      brief:'완전건식 사료가 이미 AAFCO 기준의 비타민 A·D를 충족합니다. 그 위에 A·D 함유 제품을 더하고 있습니다.',
      fix:'A·D 함유 제품은 주 3~4회로 줄이거나, A·D가 없는 제품(오메가3·프로바이오틱스 중심)으로 바꾸세요.',
      amount:'사료를 100% 주식으로 유지하는 동안에는 지용성 비타민 단독 보충을 추가하지 않습니다. 사료 비중이 50% 아래로 내려갈 때만 보충을 검토하세요.',
      watch:'눈곱·피부 각질 증가, 식욕 변화.'
    });
  } else if(vitSupp === 1){
    out.push({
      id:'vitad', level:'unk',
      title:'A·D 보충제 1개 — 판단 보류',
      brief:'사료를 주식으로 주는지 함께 선택해야 과다 여부를 판단할 수 있습니다.',
      fix:'"완전건식 사료"를 함께 선택해 다시 진단해 보세요.',
      amount:'완전사료 급여 여부에 따라 결론이 달라집니다.',
      watch:'-'
    });
  } else {
    out.push({
      id:'vitad', level:'ok',
      title:'지용성 비타민 A·D',
      brief: foodItem ? '사료가 공급하는 A·D 외에 별도 보충제는 없습니다.' : 'A·D를 중복 공급하는 조합은 확인되지 않았습니다.',
      fix:'현재 조합을 유지해도 좋습니다.',
      amount:'사료 라벨의 A·D 함량만 한 번 확인하세요.',
      watch:'-'
    });
  }

  /* --- 칼슘:인 --- */
  const hasCalc = has('caSupp');
  const hasMeat = has('meaty');
  if(hasCalc && foodItem){
    out.push({
      id:'cap', level:'mid',
      title:'칼슘:인 비율 불균형 위험',
      brief:'완전사료는 Ca:P를 1:1~2:1로 맞춰 설계됩니다. 칼슘 보충제를 더하면 이 비율이 무너집니다.',
      fix:'칼슘 보충제를 빼고, 뼈·관절 목적이면 칼슘이 아닌 오메가3·홍합 계열로 바꾸세요.',
      amount:'성장기 퍼피에서는 특히 금지에 가깝습니다. 사료를 줄이고 칼슘을 늘리는 조합은 골격 발달을 방해합니다.',
      watch:'퍼피에서 다리 절음, 성견에서 변비·식욕 저하.'
    });
  } else if(hasMeat && hasCalc){
    out.push({
      id:'cap', level:'mid',
      title:'칼슘 보충이 비율을 일부 보완',
      brief:'육류 위주 식사에 칼슘을 더하고 있습니다. 다만 인 함량은 라벨로 확인되지 않습니다.',
      fix:'칼슘:인을 1:1~2:1로 맞추려면 뼈·계란껍질 등 인 급원의 양까지 함께 조절해야 합니다.',
      amount:'육류 급여량 대비 칼슘 보충량의 정확한 비율은 레시피에 따라 달라집니다. 수의사 영양 상담을 권합니다.',
      watch:'퍼피에서 다리 절음, 성견에서 변비.'
    });
  } else if(hasMeat && !hasCalc){
    out.push({
      id:'cap', level:'mid',
      title:'칼슘:인 비율 역전',
      brief:'육류 위주 수제식은 인이 많고 칼슘이 부족해 Ca:P가 1:1 아래로 떨어지기 쉽습니다.',
      fix:'칼슘 급원(계란껍질 분말·칼슘 보충제)을 주 3~4회 소량 추가하고, 인 함량은 라벨로 확인하세요.',
      amount:'정확한 양은 레시피의 육류·뼈 비율에 따라 달라집니다. 수의사 영양 상담이 가장 정확합니다.',
      watch:'퍼피 골격 변형, 성견 근육 떨림.'
    });
  } else if(foodItem){
    out.push({
      id:'cap', level:'ok',
      title:'칼슘:인 비율',
      brief:'완전사료 단독 급여로 Ca:P가 설계 범위 안에 있습니다.',
      fix:'현재 구성을 유지하세요.',
      amount:'간식 비중이 10%를 넘으면 비율이 흔들립니다.',
      watch:'-'
    });
  } else {
    out.push({
      id:'cap', level:'unk',
      title:'칼슘:인 비율',
      brief:'완전사료 또는 수제식 항목을 선택해야 비율을 판단할 수 있습니다.',
      fix:'주식을 함께 선택해 주세요.',
      amount:'-',
      watch:'-'
    });
  }

  /* --- 글루코사민 --- */
  const gluN = cnt('glu');
  if(gluN >= 2){
    const names = items.filter(function(i){ return i.prof.glu; }).map(function(i){ return i.name; }).join(' + ');
    out.push({
      id:'glu', level:'high',
      title:'글루코사민 계열 중복',
      brief:gluN + '개 제품이 겹칩니다. (' + names + ')',
      fix:'관절 제품은 1개만 남기세요. 글루코사민 단독 제품보다 오메가3·홍합 지질 추출물 쪽 근거가 낫습니다.',
      amount:'함량이 mg으로 표기된 제품만 유효 용량을 계산할 수 있습니다. 표기 없는 제품은 1일 권장량을 넘기지 마세요.',
      watch:'설사·묽은 변. 신장질환견은 고용량 글루코사민을 피하세요.'
    });
  } else if(gluN === 1){
    out.push({
      id:'glu', level:'ok',
      title:'글루코사민',
      brief:'1개 제품에서만 공급됩니다.',
      fix:'그대로 유지해도 됩니다. 다만 단독 의존은 비추천 — 오메가3를 함께 보세요.',
      amount:'mg 표기가 없으면 실제 유효량은 알 수 없습니다.',
      watch:'-'
    });
  } else {
    out.push({
      id:'glu', level:'ok',
      title:'글루코사민',
      brief:'중복 없음.',
      fix:'-', amount:'-', watch:'-'
    });
  }

  /* --- 오메가3 --- */
  const o3N = cnt('o3');
  const target = [Math.round(c.w*50), Math.round(c.w*75)];
  if(o3N >= 2){
    out.push({
      id:'o3', level:'high',
      title:'오메가3 중복',
      brief:o3N + '개 제품에서 오메가3를 공급합니다. 합산하지 않으면 과량이 됩니다.',
      fix:'오메가3 급원은 1개만 남기세요. 나머지는 유산균·피부 유산균 등 다른 축으로 바꾸는 편이 낫습니다.',
      amount:'체중 ' + c.w + 'kg 기준 하루 EPA+DHA 목표는 ' + nf(target[0]) + '~' + nf(target[1]) + 'mg입니다. 제품 라벨의 EPA+DHA mg × 급여 개수로 합계를 계산해 이 범위에 맞추세요.',
      watch:'묽은 변·지방변. 수술 전 2주는 항응고 작용 때문에 수의사와 상의하세요.'
    });
  } else if(o3N === 1){
    out.push({
      id:'o3', level:'ok',
      title:'오메가3',
      brief:'1개 제품에서만 공급됩니다. 중복 없음.',
      fix:'급여량만 체중 기준으로 확인하세요.',
      amount:'체중 ' + c.w + 'kg 기준 하루 EPA+DHA 목표는 ' + nf(target[0]) + '~' + nf(target[1]) + 'mg입니다.',
      watch:'수술 전 2주는 중단 여부를 수의사와 상의.'
    });
  } else {
    out.push({
      id:'o3', level:'ok',
      title:'오메가3',
      brief:'오메가3 급원이 없습니다.',
      fix:'피부·관절·모질을 함께 보려면 오메가3를 1개 추가하는 편이 효율적입니다.',
      amount:'체중 ' + c.w + 'kg 기준 하루 ' + nf(target[0]) + '~' + nf(target[1]) + 'mg EPA+DHA.',
      watch:'-'
    });
  }

  /* --- 유산균 --- */
  const probioN = cnt('probio');
  if(probioN >= 2){
    const names = items.filter(function(i){ return i.prof.probio; }).map(function(i){ return i.name; }).join(' + ');
    out.push({
      id:'probio', level:'mid',
      title:'유산균 중복 ' + probioN + '개',
      brief:names + ' — 장 건강을 겨냥한 제품이 겹칩니다.',
      fix:'유산균은 1개만 남기세요. 나머지는 관절·피부·눈처럼 다른 축으로 바꾸는 편이 판단하기 쉽습니다.',
      amount:'균주와 CFU가 다른 제품을 동시에 주면 어느 쪽이 들었는지 알 수 없습니다. 같은 제품을 2주 이상 유지한 뒤 평가하세요.',
      watch:'묽은 변·가스·복부 팽만. 2~3일 이어지면 1개로 줄이세요.'
    });
  } else if(probioN === 1){
    out.push({
      id:'probio', level:'ok',
      title:'유산균',
      brief:'1개 제품에서만 공급됩니다. 중복 없음.',
      fix:'급여량(포·스푼)만 라벨 기준으로 확인하세요.',
      amount:'설사가 이틀을 넘으면 제품을 바꾸지 말고 진료하세요.',
      watch:'변 상태·가스. 2주 뒤에도 변화가 없으면 균주 교체를 검토.'
    });
  } else {
    out.push({
      id:'probio', level:'ok',
      title:'유산균',
      brief:'유산균 급원이 없습니다. 장 건강이 목적이라면 1개 추가를 검토할 수 있습니다.',
      fix:'장·피부를 함께 보려면 유산균 1개를 고르고, 다른 축은 따로 두세요.',
      amount:'처음엔 권장량의 절반부터. 첫 2~3일에 변이 묽어지면 감량.',
      watch:'-'
    });
  }

  /* --- 루테인·눈 영양 --- */
  const lutN = cnt('lutein');
  if(lutN >= 2){
    const names = items.filter(function(i){ return i.prof.lutein; }).map(function(i){ return i.name; }).join(' + ');
    out.push({
      id:'lutein', level:'mid',
      title:'루테인·눈 영양 중복 ' + lutN + '개',
      brief:names + ' — 눈을 겨냥한 제품이 겹칩니다. 개는 사람과 달리 황반이 없어 ‘황반 보호’ 논리는 그대로 적용되지 않습니다.',
      fix:'눈 영양제는 1개만 남기세요. 눈물자국이 목적이라면 영양제보다 원인(속눈썹·눈꺼풀·알러지) 감별이 먼저입니다.',
      amount:'루테인은 mg 표기가 있는 제품만 합산할 수 있습니다. 표기가 없으면 1일 권장량을 넘기지 마세요.',
      watch:'눈곱 증가·충혐·각막 혼탁이 보이면 급여를 늘리지 말고 진료.'
    });
  } else if(lutN === 1){
    out.push({
      id:'lutein', level:'ok',
      title:'루테인·눈 영양',
      brief:'1개 제품에서만 공급됩니다. 중복 없음.',
      fix:'mg 함량만 확인하고 유지하세요.',
      amount:'루테인·제아잔틴은 mg 표기가 있는 제품을 고르세요.',
      watch:'눈곱·충혐이 2주 이상 이어지면 진료.'
    });
  } else {
    out.push({
      id:'lutein', level:'ok',
      title:'루테인·눈 영양',
      brief:'루테인 계열 급원이 없습니다.',
      fix:'눈물자국·눈곱이 고민이면 원인 감별이 우선이고, 보조로 루테인 제품 1개를 검토할 수 있습니다.',
      amount:'-',
      watch:'-'
    });
  }

  /* --- 함량 미표기 --- */
  const noneCnt = items.filter(function(i){ return i.prof.disc === 'none'; }).length;
  if(noneCnt > 0){
    out.push({
      id:'label', level:'mid',
      title:'함량 미표기 ' + noneCnt + '개',
      brief:'mg 표기가 없는 제품은 유효 용량을 검증할 수 없습니다.',
      fix:'같은 목적이면 mg 함량을 공개한 제품으로 교체하세요. 라벨에 총량만 있는 경우 1회 급여량으로 나눠 계산해야 합니다.',
      amount:'"관절 케어" 같은 문구만으로는 실제 섭취량을 알 수 없습니다.',
      watch:'-'
    });
  }

  /* --- 아연·비오틴 --- */
  const zn = cnt('zinc'), bt = cnt('biotin');
  if(zn >= 2 || bt >= 2){
    out.push({
      id:'znb', level:'mid',
      title:'아연·비오틴 중복',
      brief:'피부·모질용 제품이 2개 이상 겹칩니다.',
      fix:'피부 축은 1개만 남기고, 나머지는 장 건강(유산균)으로 분리하세요.',
      amount:'아연은 1~2mg/kg/일, 비오틴은 0.5mg/kg/일 수준이 문헌 기준입니다. 합산이 이를 넘지 않게 하세요.',
      watch:'아연 과다 시 구토·식욕 저하.'
    });
  }

  const flagged = out.filter(function(f){ return f.level === 'high' || f.level === 'mid'; }).length;
  return {items:items, findings:out, flagged:flagged, at:new Date()};
}

function renderDx(){
  const box = document.getElementById('dxOut');
  if(!state.dx){
    box.innerHTML = '';
    return;
  }
  const d = state.dx;

  const head = '' +
    '<div class="fnd sum' + (d.flagged ? '' : ' hi') + '">' +
      '<div class="fh"><span class="ft">' + (d.flagged ? '주의 ' + d.flagged + '개 항목' : '검사한 ' + d.findings.length + '개 항목 모두 이상 없음') + '</span>' +
      '<span class="st">' + d.items.length + '개 제품 검사</span></div>' +
      '<div class="fb">' + (d.flagged
        ? '항목마다 <b>해결책·조절량·관찰 지표</b>를 바로 아래에 정리했습니다.'
        : '현재 조합에서는 중복·과다 신호가 잡히지 않았습니다.') + '</div>' +
    '</div>';

  const rows = d.findings.map(function(f){
    return '' +
    '<div class="fnd">' +
      '<div class="fh"><span class="ft">' + f.title + '</span>' +
        '<span class="st"><i class="d ' + f.level + '"></i>' + LEVEL_LABEL[f.level] + '</span></div>' +
      '<div class="fb">' + f.brief + '</div>' +
      '<div class="detail">' +
        '<div class="kv"><b>해결책</b><span>' + f.fix + '</span></div>' +
        '<div class="kv"><b>조절량</b><span>' + f.amount + '</span></div>' +
        '<div class="kv"><b>관찰 지표</b><span>' + f.watch + '</span></div>' +
      '</div>' +
    '</div>';
  }).join('');

  box.innerHTML = head + rows;
  box.className = 'findings';
}

/* =========================================================
   7. 리포트
   ========================================================= */
function allergyList(){
  const a = state.allergies.filter(function(x){ return x !== '없음'; });
  const out = [];
  if(a.indexOf('닭고기') > -1) out.push('가수분해 닭고기·닭 부산물·닭기름·가금향 (탐사·포켄스 카누들·뉴트리나·본아페티에 표기)');
  if(a.indexOf('소고기') > -1) out.push('소고기·소 부산물, 소 연골·소 젤라틴 유래 원료 (젤라틴 원료 동물 표기 확인 필요)');
  if(a.indexOf('곡물') > -1) out.push('밀가루·옥수수·쌀 (가수분해 트릿·건사료의 주원료인 경우가 많음. 타피오카는 곡물이 아님)');
  if(a.indexOf('유제품') > -1) out.push('탈지분유·유청단백·치즈 분말 (분유·유청 유래 단백질 포함)');
  if(!out.length){
    out.push('인공색소 (일부 저키형 제품에 식용색소 표기)');
    out.push('특정 원료 알러지가 없다면, 성분표 3번째 이후 원료까지 확인하는 습관이 안전합니다');
  }
  out.push('A·D 고함량 복합제 (완전사료와 중복 시 상한 초과 위험)');
  return out;
}

function planRows(){
  return [
    ['1~4주', '적응', '새 영양제는 권장량의 1/2부터. 하루 1종만 새로 추가', '묽은 변·구토·기호성'],
    ['5~8주', '평가', '체중 기준 급여량으로 증량. 오메가3는 EPA+DHA 합계 확인', '가려움 횟수, 눈곱 양, 계단 오르기'],
    ['9~12주', '조정', '효과 없으면 성분 축 교체(예: 글루코사민 → 오메가3·홍합)', '체중·BCS, 털 윤기, 활동량'],
    ['12주+', '유지', '제품 1~2종으로 단순화. 6개월마다 혈액검사 상담', '연 1~2회 건강검진']
  ];
}

function comboTable(){
  const alg = activeAllergies();
  return comboPicks().map(function(r){
    const label = '<b>' + CATS[r.cat].emoji + ' ' + CATS[r.cat].label + '</b>';
    const exclLine = r.excluded.length
      ? '<span class="exclnote">제외: ' + r.excluded.map(function(x){
          return x.brand + ' ' + x.name + ' (' + x.allergens.join('·') + ')';
        }).join(', ') + '</span>'
      : '';
    if(!r.pick){
      return '<tr><td>' + label + '</td>' +
        '<td colspan="4" class="nopick">선택 알러지(' + alg.join('·') + ') 제외 시 추천 가능 제품 없음 (수의사·전성분 확인 필요)' +
        exclLine + '</td></tr>';
    }
    const p = r.pick;
    const ch = p.ch.coupang || p.ch.naver;
    const price = ch ? ch.p + (ch.sz ? ' (' + ch.sz + ')' : '') : '—';
    const noteLine = p.allergenNote
      ? '<span class="exclnote">' + (unverifiedLabel(p) ? '원료 확인 필요: ' : '원료 메모: ') + p.allergenNote + '</span>'
      : '';
    return '<tr><td>' + label + '</td><td>' + p.brand + ' ' + p.name + exclLine +
      '</td><td>' + p.ing[0][0] + noteLine + '</td><td>' + p.evLabel + '</td><td>' + price + '</td></tr>';
  }).join('');
}

/* 선택된 알러지로 무엇이 빠졌는지 리포트에 한 줄로 밝힌다 */
function allergyBar(){
  const alg = activeAllergies();
  if(!alg.length){
    return '<p class="algbar off">알러지 미선택 — 21개 제품 전체에서 근거 등급이 가장 높은 제품을 고릅니다. 위 “피해야 할 원료”에서 알러지를 고르면 그 원료가 든 제품이 이 표에서 자동으로 빠집니다.</p>';
  }
  const picks = comboPicks();
  const excluded = picks.reduce(function(n, r){ return n + r.excluded.length; }, 0);
  const dead = picks.filter(function(r){ return !r.pick; }).map(function(r){ return CATS[r.cat].short; });
  const unknown = PRODUCTS.filter(function(p){ return unverifiedLabel(p) && !isExcluded(p, alg); }).length;
  return '<p class="algbar"><b>선택 알러지(' + alg.join('·') + ') 포함 제품 자동 제외 적용</b> · 21개 중 ' + excluded + '개 제외' +
    (dead.length ? ' · 대체 없음: ' + dead.join('·') : '') +
    (unknown ? '<br>부원료를 끝까지 확인하지 못한 ' + unknown + '개 제품은 임의로 제외하지 않았습니다. 급여 전 라벨을 확인하세요.' : '') +
    '</p>';
}

function reportHTML(){
  const c = calc();
  const d = state.dx;
  const breed = state.breed || '견종 미입력';
  if(!state.atLabel){
    const dd = new Date();
    state.atLabel = dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0') + '-' + String(dd.getDate()).padStart(2,'0');
  }
  const allergy = state.allergies.length ? state.allergies.join(', ') : '없음';

  const dxBlock = d
    ? '<ul>' + d.findings.filter(function(f){ return f.level === 'high' || f.level === 'mid'; })
        .map(function(f){ return '<li><b>' + f.title + '</b> — ' + f.fix + '</li>'; }).join('') +
      (d.flagged ? '' : '<li>현재 조합에서 중복·과다 신호는 잡히지 않았습니다.</li>') + '</ul>'
    : '<p>진단을 먼저 실행하면 이 리포트에 자동 반영됩니다. (진단 미실행)</p>';

  return '' +
  '<div class="rp" id="reportSheet">' +
    '<div class="rp-top">' +
      '<div><div class="t">' + breed + ' 맞춤 식단·영양제 리포트</div>' +
      '<div class="s">멍케어 Lab · ' + state.atLabel + ' 생성 · 3개월 플랜</div></div>' +
    '</div>' +
    '<dl class="prof">' +
      '<div><dt>체중</dt><dd>' + c.w + ' kg</dd></div>' +
      '<div><dt>나이</dt><dd>' + ageLabel(state.age) + '</dd></div>' +
      '<div><dt>중성화</dt><dd>' + (state.neuter ? '완료' : '미완료') + '</dd></div>' +
      '<div><dt>관심 부위</dt><dd>' + CATS[state.concern].label + '</dd></div>' +
      '<div><dt>견종</dt><dd>' + breed + '</dd></div>' +
      '<div><dt>알러지</dt><dd>' + allergy + '</dd></div>' +
      '<div><dt>하루 필요</dt><dd>' + nf(Math.round(c.der)) + ' kcal</dd></div>' +
      '<div><dt>사료 급여</dt><dd>' + nf(c.grams) + ' g/일</dd></div>' +
    '</dl>' +

    '<div class="rsec">' +
      '<h4><i>01</i> 하루 급여 설계</h4>' +
      '<p>RER ' + nf(Math.round(c.rer)) + 'kcal × 계수 ' + factorOf(state.age, state.neuter).toFixed(1) +
      ' = <b>' + nf(Math.round(c.der)) + 'kcal</b>. 간식 한도 ' + nf(Math.round(c.treatKcal)) + 'kcal를 빼면 사료 ' +
      nf(c.grams) + 'g이며, 두 끼로 나누면 ' + nf(c.grams/2) + 'g씩입니다.</p>' +
      '<p style="margin-top:6px">간식은 하루 총열량의 10% 이내(WSAVA 안내). 영양제 트릿도 간식 열량에 포함해 계산해야 합니다.</p>' +
    '</div>' +

    '<div class="rsec">' +
      '<h4><i>02</i> 피해야 할 성분</h4>' +
      '<ul>' + allergyList().map(function(x){ return '<li>' + x + '</li>'; }).join('') + '</ul>' +
    '</div>' +

    '<div class="rsec">' +
      '<h4><i>03</i> 중복·충돌 진단 요약</h4>' + dxBlock +
    '</div>' +

    '<div class="rsec">' +
      '<h4><i>04</i> 3개월 급여 플랜</h4>' +
      '<table class="rtable"><thead><tr><th>기간</th><th>단계</th><th>할 일</th><th>관찰</th></tr></thead><tbody>' +
      planRows().map(function(r){
        return '<tr><td>' + r[0] + '</td><td><b>' + r[1] + '</b></td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>';
      }).join('') +
      '</tbody></table>' +
    '</div>' +

    '<div class="rsec">' +
      '<h4><i>05</i> 부위별 최적 조합표</h4>' +
      allergyBar() +
      '<table class="rtable"><thead><tr><th>부위</th><th>추천</th><th>핵심 성분</th><th>근거</th><th>가격</th></tr></thead><tbody>' +
      comboTable() + '</tbody></table>' +
      '<p style="margin-top:7px">근거 등급은 성분 단위 연구 기준입니다. 제품 자체 임상 유무와는 다릅니다.</p>' +
    '</div>' +

    '<div class="rsec">' +
      '<h4><i>06</i> 병원에 가야 하는 신호</h4>' +
      '<ul>' +
        '<li>다리를 들고 걷기가 반복되거나 계단 앞에서 망설임 (관절)</li>' +
        '<li>가려움이 2주 이상 지속, 진물·원형 탈모 (피부)</li>' +
        '<li>눈곱 급증, 충혈, 눈이 뿌옇게 변함 (눈)</li>' +
        '<li>좌우 대칭 탈모, 물을 갑자기 많이 마심 (내분비)</li>' +
      '</ul>' +
    '</div>' +

    '<div class="rp-foot">본 리포트는 공개 자료와 입력값에 기반한 참고 문서이며 의학적 진단·처방이 아닙니다. 제품 선택·구매·급여 및 그로 인한 모든 결과에 대한 판단과 책임은 이용자 본인에게 있으며, 운영자는 법적·금전적 책임을 지지 않습니다. 제품 가격·평점은 2026-11-17 조사 기준입니다.</div>' +
  '</div>';
}

function renderReport(){
  if(!state.reportOpen){
    document.getElementById('reportOut').innerHTML = '';
    document.getElementById('printBtn').disabled = true;
    return;
  }
  document.getElementById('reportOut').innerHTML = reportHTML();
  document.getElementById('printBtn').disabled = false;
}

let toastT = null;
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(function(){ t.classList.remove('on'); }, 2600);
}

/* =========================================================
   8. 진단 입력 UI (부위별 아코디언 + 검색 + 직접 추가)
   ========================================================= */
function groupsBase(){
  return [{key:'food', label:'🍚 사료 (주식)'}]
    .concat(CAT_ORDER.map(function(k){ return {key:k, label:CATS[k].emoji + ' ' + CATS[k].label}; }))
    .concat([{key:'extra', label:'🌾 주식·기타'}]);
}

const ADD_CHIPS = [
  {k:'o3', label:'오메가3'},
  {k:'glu', label:'글루코사민·콘드로이틴'},
  {k:'probio', label:'유산균'},
  {k:'vitAD', label:'비타민 A·D'},
  {k:'caSupp', label:'칼슘·인'},
  {k:'zinc', label:'아연·비오틴'},
  {k:'lutein', label:'루테인·눈영양'},
  {k:'disc_none', label:'성분표 미표기'}
];

function groupsForRender(){
  const arr = groupsBase();
  if((state.custom || []).length) arr.unshift({key:'custom', label:'➕ 내가 추가한 제품'});
  return arr;
}

function groupItems(key){
  const all = dietCatalog();
  return all.filter(function(it){ return it.cat === key; });
}

function dietRowHTML(it){
  const tag = it.tag ? (it.custom ? '' : '<span class="tg">' + esc(it.tag) + '</span>') : '';
  const del = it.custom
    ? '<button class="del" type="button" data-del="' + esc(it.id) + '" aria-label="' + esc(it.name) + ' 목록에서 삭제">✕</button>'
    : '';
  const hay = normQ(it.name + ' ' + (it.search || '') + ' ' + (it.tag || ''));
  return '<label class="drow" data-name="' + esc(it.name) + '" data-s="' + esc(hay) + '">' +
    '<input type="checkbox" value="' + esc(it.id) + '"><span>' + esc(it.name) + '</span>' + tag + del + '</label>';
}

function paintDbCount(){
  const el = document.getElementById('dbCount');
  if(!el) return;
  const all = dietCatalog();
  const foodN = all.filter(function(it){ return it.cat === 'food'; }).length;
  el.innerHTML = '진단 DB <b>' + all.length + '종</b> · 사료 ' + foodN + '종';
}

function renderDietList(){
  const box = document.getElementById('dietGroups');
  if(!box) return;
  box.innerHTML = groupsForRender().map(function(g){
    const items = groupItems(g.key);
    if(!items.length) return '';
    const rows = items.map(dietRowHTML).join('');
    return '<details class="grp" data-group="' + g.key + '">' +
      '<summary><span class="gname">' + g.label + '</span>' +
      '<span class="gcnt" data-cnt="' + g.key + '">' + items.length + '</span></summary>' +
      '<div class="rows">' + rows + '</div></details>';
  }).join('');
  paintDbCount();
  updateDietUI();
}

function paintGroupCounts(){
  const box = document.getElementById('dietGroups');
  if(!box) return;
  const q = normQ(state.q || '');
  box.querySelectorAll('.grp').forEach(function(g){
    const cntEl = g.querySelector('.gcnt');
    if(!cntEl) return;
    const items = groupItems(g.dataset.group);
    const sel = items.filter(function(it){ return state.diet.indexOf(it.id) > -1; }).length;
    if(q){
      const vis = g.querySelectorAll('.drow:not([hidden])').length;
      cntEl.textContent = vis + '건';
      cntEl.classList.add('hit');
      cntEl.classList.remove('on');
    } else {
      cntEl.textContent = sel ? sel + '/' + items.length : String(items.length);
      cntEl.classList.toggle('on', sel > 0);
      cntEl.classList.remove('hit');
    }
  });
}

function updateDietUI(){
  const box = document.getElementById('dietGroups');
  if(!box) return;
  box.querySelectorAll('.drow').forEach(function(row){
    const cb = row.querySelector('input');
    const on = state.diet.indexOf(cb.value) > -1;
    const dis = !on && state.diet.length >= 3;
    row.classList.toggle('sel', on);
    row.classList.toggle('dis', dis);
    cb.checked = on;
    cb.disabled = dis;
  });
  /* 선택된 그룹은 열어 둔다 */
  box.querySelectorAll('.grp').forEach(function(g){
    if(g.querySelectorAll('.drow.sel').length > 0) g.open = true;
  });
  paintGroupCounts();

  const cnt = document.getElementById('dietCnt');
  if(cnt) cnt.textContent = state.diet.length + '/3';
  const btn = document.getElementById('dxBtn');
  if(btn) btn.disabled = state.diet.length < 2;
  const hint = document.getElementById('dxHint');
  if(hint) hint.textContent = state.diet.length < 2
    ? '2개 이상 선택하면 검사할 수 있어요.'
    : state.diet.length + '개 선택됨 · 진단을 실행하세요.';
}

function filterDiet(q){
  state.q = q || '';
  const box = document.getElementById('dietGroups');
  if(!box) return 0;
  const key = normQ(q);
  let total = 0;
  box.querySelectorAll('.grp').forEach(function(g){
    let vis = 0;
    g.querySelectorAll('.drow').forEach(function(row){
      const hit = !key || String(row.dataset.s || '').indexOf(key) > -1;
      row.hidden = !hit;
      if(hit) vis++;
    });
    g.hidden = vis === 0;
    if(key){ g.open = vis > 0; }
    else { g.open = g.querySelector('.drow.sel') !== null; }
    total += vis;
  });

  const emp = document.getElementById('dietEmpty');
  if(emp){
    if(key && total === 0){
      emp.hidden = false;
      emp.innerHTML = '<b>‘' + esc(String(q || '').trim()) + '’ 검색 결과가 없어요</b>' +
        '<span>위의 <b style="display:inline;color:var(--accent-d)">+ 찾는 제품 직접 추가하기</b>로 넣으면 같은 중복 진단이 적용됩니다.</span>';
    } else {
      emp.hidden = true;
      emp.innerHTML = '';
    }
  }
  paintGroupCounts();
  return total;
}

/* ---------- 직접 추가 ---------- */
function paintAddChips(){
  const box = document.getElementById('addChips');
  if(!box) return;
  box.innerHTML = ADD_CHIPS.map(function(c){
    return '<button type="button" data-chip="' + c.k + '" aria-pressed="' +
      (state.addChips.indexOf(c.k) > -1) + '">' + c.label + '</button>';
  }).join('');
}

function toggleAddPanel(open){
  const panel = document.getElementById('addPanel');
  const btn = document.getElementById('addToggle');
  if(!panel) return;
  panel.classList.toggle('on', !!open);
  if(btn) btn.setAttribute('aria-expanded', String(!!open));
  if(open){
    const inp = document.getElementById('customName');
    if(inp) inp.focus();
  }
}

function customProfFromChips(chips){
  if(!chips.length || chips.indexOf('disc_none') > -1) return {disc:'none'};
  const prof = {};
  chips.forEach(function(k){
    if(k === 'glu'){ prof.glu = 1; prof.chon = 1; }
    else if(k === 'zinc'){ prof.zinc = 1; prof.biotin = 1; }
    else if(k === 'caSupp'){ prof.caSupp = 1; prof.ca = 1; prof.phos = 1; }
    else if(k === 'o3' || k === 'probio' || k === 'vitAD' || k === 'lutein'){ prof[k] = 1; }
  });
  prof.disc = 'partial';
  return prof;
}

function addCustomItem(){
  const input = document.getElementById('customName');
  const raw = (input && input.value ? input.value : '').trim().replace(/\s+/g, ' ');
  if(!raw){ toast('제품명을 입력해 주세요'); if(input) input.focus(); return; }
  const name = raw.slice(0, 40);
  const item = {
    id:'cus_' + Date.now().toString(36) + '_' + (state.customSeq++),
    name:name,
    prof:customProfFromChips(state.addChips),
    search:name
  };
  state.custom.push(item);
  save();
  renderDietList();

  let picked = false;
  if(state.diet.length < 3){
    state.diet.push(item.id);
    picked = true;
    updateDietUI();
  } else {
    toast('이미 3개를 선택했어요 · 목록에는 추가했습니다');
  }
  if(state.diet.length >= 2){
    state.dx = diagnose();
    renderDx();
  }

  if(input) input.value = '';
  state.addChips = [];
  paintAddChips();
  toggleAddPanel(false);
  const grp = document.querySelector('#dietGroups .grp[data-group="custom"]');
  if(grp) grp.open = true;
  if(picked && state.diet.length < 3) toast('추가하고 선택했습니다 · 진단에 포함');
  else if(picked) toast('추가하고 선택했습니다 · 3개가 모두 찼어요');
  save();
}

function removeCustomItem(id){
  state.custom = (state.custom || []).filter(function(c){ return c.id !== id; });
  state.diet = state.diet.filter(function(x){ return x !== id; });
  save();
  renderDietList();
  if(state.diet.length >= 2){ state.dx = diagnose(); }
  else { state.dx = null; }
  renderDx();
  toast('목록에서 삭제했습니다');
}

/* =========================================================
   9. 이벤트
   ========================================================= */
function clampW(v){ return Math.round(Math.max(0.5, Math.min(90, v)) * 10) / 10; }
function paintWeight(skipId){
  ['w','rw'].forEach(function(id){
    if(id === skipId) return;
    const el = document.getElementById(id);
    if(el) el.value = state.weight;
  });
  document.querySelectorAll('.wchip').forEach(function(b){
    b.setAttribute('aria-pressed', String(Number(b.dataset.w) === state.weight));
  });
}
function setWeight(v, skipId){
  state.weight = clampW(v);
  paintWeight(skipId);
  renderCalc(); save();
  if(state.reportOpen) renderReport();
}
function paintAge(){
  document.querySelectorAll('[data-age]').forEach(function(b){
    b.setAttribute('aria-pressed', String(b.dataset.age === state.age));
  });
  document.querySelectorAll('[data-rgage]').forEach(function(b){
    b.setAttribute('aria-pressed', String(b.dataset.rgage === state.age));
  });
}
function setAge(a){
  if(!a) return;
  state.age = a;
  paintAge();
  renderCalc(); save();
  if(state.reportOpen) renderReport();
}
function paintNeuter(){
  const cb = document.getElementById('neuter');
  if(cb) cb.checked = state.neuter;
  document.querySelectorAll('[data-rneut]').forEach(function(b){
    b.setAttribute('aria-pressed', String((b.dataset.rneut === '1') === state.neuter));
  });
}
function setNeuter(v){
  state.neuter = !!v;
  paintNeuter();
  renderCalc(); save();
  if(state.reportOpen) renderReport();
}
function paintAllergies(){
  document.querySelectorAll('[data-alg]').forEach(function(b){
    b.setAttribute('aria-pressed', String(state.allergies.indexOf(b.dataset.alg) > -1));
  });
}
function syncConcernUI(){
  const sel = document.getElementById('concernSel');
  if(sel) sel.value = state.concern;
  document.querySelectorAll('[data-cat]').forEach(function(b){
    b.setAttribute('aria-selected', String(b.dataset.cat === state.cat));
  });
}

function bind(){
  /* 상단 탭 */
  document.querySelectorAll('[data-view]').forEach(function(b){
    b.addEventListener('click', function(){
      showView(b.dataset.view);
      if(b.dataset.view === 'paid') showPaidTab(state.paidTab);
    });
  });

  /* 부위 필터 */
  document.getElementById('catPills').addEventListener('click', function(e){
    const b = e.target.closest('[data-cat]');
    if(!b) return;
    state.cat = b.dataset.cat;
    state.concern = b.dataset.cat;
    renderProducts(); syncConcernUI(); save();
  });

  /* 진단·리포트 세그먼트 */
  document.querySelectorAll('[data-ptab]').forEach(function(b){
    b.addEventListener('click', function(){ showPaidTab(b.dataset.ptab); });
  });

  /* 체중 — 급여량 계산 탭 */
  document.getElementById('w').addEventListener('input', function(e){
    const v = parseFloat(e.target.value);
    if(!isNaN(v)){
      state.weight = v;
      paintWeight('w'); renderCalc(); save();
      if(state.reportOpen) renderReport();
    }
  });
  document.getElementById('w').addEventListener('change', function(){ setWeight(state.weight); });
  document.getElementById('wMinus').addEventListener('click', function(){ setWeight(state.weight - 0.5); });
  document.getElementById('wPlus').addEventListener('click', function(){ setWeight(state.weight + 0.5); });
  document.querySelectorAll('.wchip').forEach(function(b){
    b.addEventListener('click', function(){ setWeight(Number(b.dataset.w)); });
  });

  /* 체중 — 맞춤 리포트 폼 (같은 state 양방향 동기화) */
  document.getElementById('rw').addEventListener('input', function(e){
    const v = parseFloat(e.target.value);
    if(!isNaN(v)){
      state.weight = v;
      paintWeight('rw'); renderCalc(); save();
      if(state.reportOpen) renderReport();
    }
  });
  document.getElementById('rw').addEventListener('change', function(){ setWeight(state.weight); });
  document.getElementById('rwMinus').addEventListener('click', function(){ setWeight(state.weight - 0.5); });
  document.getElementById('rwPlus').addEventListener('click', function(){ setWeight(state.weight + 0.5); });

  /* 나이 — 계산 탭 + 리포트 폼 */
  document.querySelectorAll('[data-age],[data-rgage]').forEach(function(b){
    b.addEventListener('click', function(){
      setAge(b.dataset.age || b.dataset.rgage);
    });
  });

  /* 중성화 — 계산 탭 스위치 + 리포트 폼 칩 */
  document.getElementById('neuter').addEventListener('change', function(e){
    setNeuter(e.target.checked);
  });
  document.querySelectorAll('[data-rneut]').forEach(function(b){
    b.addEventListener('click', function(){ setNeuter(b.dataset.rneut === '1'); });
  });

  /* 사료 열량 */
  document.getElementById('foodKcal').addEventListener('input', function(e){
    const v = parseFloat(e.target.value);
    if(!isNaN(v) && v > 0){ state.foodKcal = v; renderCalc(); save(); }
  });

  /* 진단: 제품 선택 */
  document.getElementById('dietGroups').addEventListener('change', function(e){
    const cb = e.target;
    if(!cb.matches('input[type=checkbox]')) return;
    const id = cb.value;
    if(cb.checked){
      if(state.diet.length >= 3){ cb.checked = false; return; }
      if(state.diet.indexOf(id) === -1) state.diet.push(id);
    } else {
      state.diet = state.diet.filter(function(x){ return x !== id; });
    }
    updateDietUI(); save();
  });

  /* 진단: 검색 */
  document.getElementById('dietSearch').addEventListener('input', function(e){
    filterDiet(e.target.value);
  });

  /* 진단: 직접 추가 항목 삭제 */
  document.getElementById('dietGroups').addEventListener('click', function(e){
    const del = e.target.closest ? e.target.closest('[data-del]') : null;
    if(!del) return;
    e.preventDefault();
    if(e.stopPropagation) e.stopPropagation();
    removeCustomItem(del.dataset.del);
  });

  /* 진단: 직접 추가 패널 */
  document.getElementById('addToggle').addEventListener('click', function(){
    const panel = document.getElementById('addPanel');
    toggleAddPanel(!panel.classList.contains('on'));
  });
  document.getElementById('addCancel').addEventListener('click', function(){ toggleAddPanel(false); });
  document.getElementById('addConfirm').addEventListener('click', addCustomItem);
  document.getElementById('customName').addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); addCustomItem(); }
  });
  document.getElementById('addChips').addEventListener('click', function(e){
    const b = e.target.closest ? e.target.closest('[data-chip]') : null;
    if(!b) return;
    const k = b.dataset.chip;
    if(k === 'disc_none'){
      state.addChips = state.addChips.indexOf('disc_none') > -1 ? [] : ['disc_none'];
    } else {
      state.addChips = state.addChips.filter(function(x){ return x !== 'disc_none'; });
      const i = state.addChips.indexOf(k);
      if(i > -1) state.addChips.splice(i, 1); else state.addChips.push(k);
    }
    paintAddChips();
  });

  /* 진단 실행 */
  document.getElementById('dxBtn').addEventListener('click', function(){
    if(state.diet.length < 2) return;
    state.dx = diagnose();
    renderDx();
    const first = document.getElementById('dxOut');
    if(first) first.scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.getElementById('dxReset').addEventListener('click', function(){
    state.diet = []; state.dx = null; state.q = ''; state.addChips = [];
    document.getElementById('dietSearch').value = '';
    filterDiet('');
    paintAddChips();
    toggleAddPanel(false);
    updateDietUI(); renderDx(); save();
  });

  /* 리포트 입력 */
  document.getElementById('breed').addEventListener('input', function(e){
    state.breed = e.target.value.slice(0,20); save();
    if(state.reportOpen) renderReport();
  });

  const sel = document.getElementById('concernSel');
  sel.innerHTML = CAT_ORDER.map(function(k){
    return '<option value="' + k + '">' + CATS[k].label + '</option>';
  }).join('');
  sel.value = state.concern;
  sel.addEventListener('change', function(){
    state.concern = sel.value;
    state.cat = sel.value;
    renderProducts(); syncConcernUI(); save();
    if(state.reportOpen) renderReport();
  });

  document.getElementById('algList').innerHTML = ALLERGIES.map(function(a){
    return '<button type="button" data-alg="' + a + '" aria-pressed="false">' + a + '</button>';
  }).join('');
  document.getElementById('algList').addEventListener('click', function(e){
    const b = e.target.closest('[data-alg]');
    if(!b) return;
    const v = b.dataset.alg;
    if(v === '없음'){
      state.allergies = state.allergies.indexOf('없음') > -1 ? [] : ['없음'];
    } else {
      state.allergies = state.allergies.filter(function(x){ return x !== '없음'; });
      const i = state.allergies.indexOf(v);
      if(i > -1) state.allergies.splice(i,1); else state.allergies.push(v);
    }
    paintAllergies(); save();
    renderProducts();
    if(state.reportOpen) renderReport();
  });

  document.getElementById('reportBtn').addEventListener('click', function(){
    state.reportOpen = true;
    const d = new Date();
    state.atLabel = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    renderReport();
    const r = document.getElementById('reportOut');
    if(r) r.scrollIntoView({behavior:'smooth', block:'start'});
  });

  document.getElementById('printBtn').addEventListener('click', function(){
    if(!state.reportOpen) return;
    window.print();
  });

  /* 초기화 */
  document.getElementById('resetDemo').addEventListener('click', function(){
    try{ localStorage.removeItem(LS); }catch(e){}
    state.diet = []; state.dx = null; state.reportOpen = false;
    state.allergies = []; state.breed = '';
    state.custom = []; state.customSeq = 1; state.q = ''; state.addChips = [];
    document.getElementById('breed').value = '';
    document.getElementById('dietSearch').value = '';
    document.getElementById('w').value = state.weight;
    paintWeight(); paintAge(); paintNeuter();
    document.getElementById('customName').value = '';
    paintAddChips();
    toggleAddPanel(false);
    filterDiet('');
    renderDietList();
    paintAllergies(); updateDietUI(); renderDx(); renderReport(); renderProducts();
    document.getElementById('printBtn').disabled = true;
    toast('데모 상태를 초기화했습니다');
  });
}

/* 데이터 로드 실패 시: 정적 파일로 열었거나 네트워크가 막힌 경우 */
function showDataError(err){
  var box = document.getElementById('dataError');
  if(!box) return;
  box.hidden = false;
  box.innerHTML = '<b>데이터를 불러오지 못했습니다</b><span>data/*.json 8개 파일을 읽지 못했습니다. ' +
    'index.html을 파일로 직접 열면 브라우저가 fetch를 막습니다. 로컬 서버(예: python3 -m http.server)나 ' +
    '배포 주소로 열어 주세요.</span>';
  if(window.console) console.error('[멍케어 Lab] 데이터 로드 실패', err);
}

/* =========================================================
   10. 초기화
   ========================================================= */
function bootApp(){
  load();

  state.cat = state.concern;

  renderCats();

  document.getElementById('w').value = state.weight;
  paintWeight();
  paintAge();
  paintNeuter();
  document.getElementById('foodKcal').value = state.foodKcal;
  document.getElementById('breed').value = state.breed || '';

  bind();
  paintAllergies();
  paintAddChips();
  renderCalc();
  renderProducts();
  renderDietList();

  if(state.diet.length >= 2){
    state.dx = diagnose();
    renderDx();
  }
  document.getElementById('printBtn').disabled = true;
  if(!state.reportOpen){
    document.getElementById('reportOut').innerHTML = '';
  }
  showView('products');
  if(typeof bootSearch === 'function') bootSearch();
  window.MC_APP_READY = true;
}
