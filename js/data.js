/* 멍케어 Lab v0.7 — 데이터 계층
   data/*.json 8개를 fetch 로 병렬 로드하고, 기존 화면(카드·진단·리포트)이 쓰던
   배열(PRODUCTS·EXTRAS·HOOKS)을 그대로 재구성합니다. (GitHub Pages 정적 호스팅 호환) */
"use strict";

var PRODUCTS = [];   /* 비교 카드 21개 — renderProducts / cardHTML 이 사용 */
var EXTRAS = [];     /* 진단 전용 75종 — dietCatalog 가 사용 */
var HOOKS = {};      /* id → 카드 한 줄 요약 (기존 호환) */

var DATA = {
  loaded: false,
  error: null,
  meta: {},
  brands: [], brandById: {},
  ingredients: [], ingredientById: {},
  products: [], productById: {},
  productIngredients: [],
  offers: [],
  reviews: [], reviewByProduct: {},
  evidence: [],
  sources: [], sourceById: {},
  policy: {}
};

var MC_DATA_FILES = [
  'brands.json', 'ingredients.json', 'products.json', 'product_ingredients.json',
  'product_offers.json', 'product_reviews.json', 'evidence.json', 'data_sources.json'
];

function mcFetchJSON(name){
  return fetch(APP_CONFIG.DATA_BASE + name, {cache: 'no-cache'}).then(function(r){
    if(!r.ok) throw new Error(name + ' HTTP ' + r.status);
    return r.json();
  });
}

function indexBy(list, key){
  var out = {};
  (list || []).forEach(function(x){ if(x && x[key] != null) out[x[key]] = x; });
  return out;
}

/* ---------- 정규화 데이터 → 기존 렌더러용 뷰 ---------- */
function mcLegacyProduct(p){
  var ch = {coupang: null, naver: null};
  mcOffersOf(p.id).forEach(function(o){
    var slot = o.mall === 'coupang' ? 'coupang' : 'naver';
    if(ch[slot]) return;                       /* 채널별 첫 판매처만 카드에 표기 */
    ch[slot] = {
      label: o.mallLabel,
      p: o.priceText || '—',
      sz: o.sizeText || '',
      r: (o.rating === null || o.rating === undefined) ? '—' : String(o.rating),
      n: (o.reviewCount === null || o.reviewCount === undefined) ? '—' : nf(o.reviewCount),
      as: o.checkedAt || '—'
    };
  });
  var ev = DATA.evidence.filter(function(e){ return e.subjectType === 'product' && e.subjectId === p.id; })[0] || null;
  var rv = DATA.reviewByProduct[p.id] || null;
  return {
    id: p.id, cat: p.category, brand: p.brandName, name: p.nameKo, meta: p.formText || '',
    allergens: p.allergens || [], allergenNote: p.allergenNote || null,
    q: p.searchQuery || null,
    ch: ch,
    ing: mcIngredientsOf(p.id).map(function(x){ return [x.label, x.amountText || '']; }),
    ev: p.evidenceLevel, evLabel: p.evidenceLabel,
    evTitle: ev ? ev.title : null, evBody: ev ? ev.summary : null,
    src: ev ? {t: ev.citation, u: ev.url} : null,
    rev: rv ? rv.summaryText : null,
    warn: p.cautions || null,
    prof: (p.diagnosis && p.diagnosis.profile) || {}
  };
}

function mcBuildLegacy(){
  PRODUCTS.length = 0;
  EXTRAS.length = 0;
  Object.keys(HOOKS).forEach(function(k){ delete HOOKS[k]; });

  DATA.products.filter(function(p){ return p.comparison; }).forEach(function(p){
    PRODUCTS.push(mcLegacyProduct(p));
    if(p.hook) HOOKS[p.id] = p.hook;
  });
  DATA.products.filter(function(p){ return !p.comparison; }).forEach(function(p){
    var d = p.diagnosis || {};
    EXTRAS.push({id: p.id, name: p.nameKo, cat: p.category, prof: d.profile || {},
                 search: d.search || p.nameKo, tag: d.tag || ''});
  });
}

/* ---------- 조회 헬퍼 ---------- */
function mcOffersOf(pid){
  return DATA.offers.filter(function(o){ return o.productId === pid; })
    .sort(function(a, b){ return (a.price == null ? 1e12 : a.price) - (b.price == null ? 1e12 : b.price); });
}
function mcIngredientsOf(pid){
  return DATA.productIngredients.filter(function(x){ return x.productId === pid; });
}
function mcEvidenceOf(pid){
  var p = DATA.productById[pid];
  if(!p) return {product: [], ingredient: [], finished: [], secondary: []};
  var own = DATA.evidence.filter(function(e){ return e.subjectType === 'product' && e.subjectId === pid; });
  var ingIds = mcIngredientsOf(pid).map(function(x){ return x.ingredientId; }).filter(Boolean);
  var ing = DATA.evidence.filter(function(e){
    return e.subjectType === 'ingredient' && ingIds.indexOf(e.subjectId) > -1;
  });
  return {
    product: own,
    ingredient: ing.filter(function(e){ return e.scope === 'ingredient'; }),
    finished: own.filter(function(e){ return e.scope === 'finished_product'; }),
    secondary: own.filter(function(e){ return e.scope === 'secondary'; }).concat(
      ing.filter(function(e){ return e.scope === 'secondary'; }))
  };
}
function mcPriceOf(pid){
  var list = mcOffersOf(pid);
  for(var i = 0; i < list.length; i++){ if(list[i].price != null) return list[i]; }
  return null;
}
function mcSourceOf(id){
  return DATA.sourceById[id] || null;
}
function mcSourceName(id){
  var s = mcSourceOf(id);
  return s ? s.name : '출처 미기록';
}

/* ---------- 로드 ---------- */
/* 정규화 번들 적용(브라우저 fetch 결과 또는 테스트 주입) */
function mcApplyData(res){
  var brands = res[0], ings = res[1], prods = res[2], pi = res[3];
  var offers = res[4], revs = res[5], ev = res[6], srcDoc = res[7];

  DATA.brands = brands;
  DATA.brandById = indexBy(brands, 'id');
  DATA.ingredients = ings;
  DATA.ingredientById = indexBy(ings, 'id');
  DATA.products = prods;
  DATA.productById = indexBy(prods, 'id');
  DATA.productIngredients = pi;
  DATA.offers = offers;
  DATA.reviews = revs;
  DATA.reviewByProduct = indexBy(revs, 'productId');
  DATA.evidence = ev;
  DATA.sources = srcDoc.sources || [];
  DATA.sourceById = indexBy(DATA.sources, 'id');
  DATA.policy = srcDoc.policy || {};
  DATA.meta = {
    version: srcDoc.version,
    generatedAt: srcDoc.generatedAt,
    brandCount: brands.length,
    ingredientCount: ings.length,
    productCount: prods.length,
    offerCount: offers.length,
    evidenceCount: ev.length
  };
  DATA.loaded = true;
  mcBuildLegacy();
  return DATA;
}

function loadData(){
  return Promise.all(MC_DATA_FILES.map(mcFetchJSON)).then(mcApplyData).catch(function(err){
    DATA.error = err;
    throw err;
  });
}

/* ---------- 표시 헬퍼 ---------- */
function mcEscape(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function mcWon(n){
  return (typeof n === 'number') ? nf(n) + '원' : '—';
}
function mcUnknown(v, fallback){
  return (v === null || v === undefined || v === '') ? (fallback || UNKNOWN.info) : v;
}

/* 카테고리별 기본 이미지(SVG) — 제품 사진을 확인하지 못했을 때 쓴다 */
function mcPlaceholderImage(kind, category){
  var emoji = (CATS[category] && CATS[category].emoji) || (kind === 'food' ? '🍚' : '💊');
  var bg = kind === 'food' ? '#FFF6E5' : '#EAF7F2';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">' +
    '<rect width="160" height="160" rx="24" fill="' + bg + '"/>' +
    '<text x="80" y="84" font-size="62" text-anchor="middle" dominant-baseline="central">' + emoji + '</text>' +
    '<text x="80" y="128" font-size="13" fill="#8B95A1" text-anchor="middle" font-family="sans-serif">' +
    (kind === 'food' ? '사료' : '영양제') + ' 이미지 미확인</text></svg>';
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
