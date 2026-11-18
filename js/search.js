/* 멍케어 Lab v0.7 — 통합 검색 · 필터 · 정렬 · 제품 상세 · 직접 등록 요청
   대상: data/products.json 96종 (사료 28 · 영양제 64 · 일반 항목 4)
   - 검색: 제품명(한/영)·브랜드(한/영)·제조사·성분·8개 건강 카테고리·사료/영양제, 띄어쓰기·대소문자 무시
   - 외부 쇼핑몰은 API 키 없이 검색 URL만 새 탭으로 연결합니다(크롤링·키 노출 없음).
   - 없는 값은 지어내지 않고 '가격 미확인'·'정보 미확인'·'근거 자료 부족'으로 표시 */
"use strict";

var SEARCH = {
  q: '',
  kind: 'all',      /* all | food | supplement */
  cat: 'all',       /* all | joint ... | food | extra */
  brand: 'all',
  price: 'all',     /* all | u2 | 2to3 | 3to5 | o5 | unknown */
  sort: 'evidence', /* evidence | price | name */
  active: -1        /* 자동완성 선택 인덱스 */
};

var SEARCH_INDEX = [];
var SEARCH_DEBOUNCE = null;
var SEARCH_LAST_FOCUS = null;
var REQ_LS = 'mc_requests_v1';

var EMPTY_TEXT = '아직 멍케어 Lab에 등록되지 않은 제품입니다. 아래 쇼핑몰에서 판매 여부를 확인할 수 있습니다.';

/* ---------------------------------------------------------------- 정규화 */
function mcNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[·・,.\-_/\\&+'"“”‘’()\[\]{}]/g, '');
}

/* ---------------------------------------------------------------- 인덱스 */
function buildSearchIndex(){
  SEARCH_INDEX = DATA.products.filter(function(p){ return p.kind !== 'generic'; }).map(function(p){
    var brand = DATA.brandById[p.brandId] || {};
    var ings = mcIngredientsOf(p.id).map(function(x){
      var m = x.ingredientId ? DATA.ingredientById[x.ingredientId] : null;
      return [x.label, m ? m.nameEn : ''].join(' ');
    }).join(' ');
    var catLabel = (CATS[p.category] && CATS[p.category].label) || CATEGORY_KO[p.category] || '';
    var parts = {
      name:  [p.nameKo, p.nameEn].join(' '),
      brand: [p.brandName, brand.nameKo, brand.nameEn].join(' '),
      maker: p.maker || '',
      ing:   ings,
      cat:   catLabel,
      extra: [p.formText || '', (p.searchTerms || []).join(' '), (p.tags || []).join(' '),
              KIND_KO[p.kind] || '', p.hook || ''].join(' ')
    };
    var n = {};
    Object.keys(parts).forEach(function(k){ n[k] = mcNorm(parts[k]); });
    var hay = mcNorm(Object.keys(parts).map(function(k){ return parts[k]; }).join(' '));
    return {p: p, norm: n, hay: hay, offer: mcPriceOf(p.id), brand: brand};
  });
}

/* ---------------------------------------------------------------- 필터 */
function priceBand(price){
  if(price == null) return 'unknown';
  if(price <= 20000) return 'u2';
  if(price <= 30000) return '2to3';
  if(price <= 50000) return '3to5';
  return 'o5';
}

function passesFilters(e){
  var p = e.p;
  if(SEARCH.kind !== 'all' && p.kind !== SEARCH.kind) return false;
  if(SEARCH.cat !== 'all' && p.category !== SEARCH.cat) return false;
  if(SEARCH.brand !== 'all' && p.brandId !== SEARCH.brand) return false;
  var price = e.offer ? e.offer.price : null;
  if(SEARCH.price !== 'all' && priceBand(price) !== SEARCH.price) return false;
  return true;
}

function searchTokenScore(e, t){
  if(e.hay.indexOf(t) === -1) return -1;
  if(e.norm.name.indexOf(t) > -1) return 40;
  if(e.norm.brand.indexOf(t) > -1) return 30;
  if(e.norm.maker.indexOf(t) > -1) return 24;
  if(e.norm.ing.indexOf(t) > -1) return 20;
  if(e.norm.cat.indexOf(t) > -1) return 12;
  return 4;
}

function searchRun(){
  var raw = String(SEARCH.q || '').trim();
  var nq = mcNorm(raw);
  var tokens = raw ? raw.split(/\s+/).map(mcNorm).filter(Boolean) : [];
  var list = [];
  var filtersActive = SEARCH.kind !== 'all' || SEARCH.cat !== 'all' || SEARCH.brand !== 'all' || SEARCH.price !== 'all';

  SEARCH_INDEX.forEach(function(e){
    if(!passesFilters(e)) return;
    var price = e.offer ? e.offer.price : null;
    if(!tokens.length){ list.push({e: e, score: 1, price: price, matched: 0}); return; }

    var full = nq && e.hay.indexOf(nq) > -1;
    var score = 0;
    var matched = 0;
    for(var i = 0; i < tokens.length; i++){
      var s = searchTokenScore(e, tokens[i]);
      if(s < 0){ matched = -1; break; }
      score += s;
      matched++;
    }
    if(!full && matched < 0) return;          /* 전체 일치도, 모든 토큰 일치도 아님 */
    if(full) score += 80;
    if(mcNorm(e.p.nameKo) === nq) score += 60;
    list.push({e: e, score: score, price: price, matched: matched});
  });

  /* 띄어쓰기가 어긋나 아무것도 못 찾았을 때: 가장 긴 단어로 한 번 더 찾는다 */
  if(!list.length && tokens.length > 1){
    var longest = tokens.slice().sort(function(a, b){ return b.length - a.length; })[0];
    SEARCH_INDEX.forEach(function(e){
      if(!passesFilters(e)) return;
      if(e.hay.indexOf(longest) > -1){
        list.push({e: e, score: 3, price: e.offer ? e.offer.price : null, matched: 1});
      }
    });
  }

  var evRankMap = {strong: 0, mid: 1, weak: 2};
  list.sort(function(a, b){
    if(SEARCH.sort === 'price'){
      var pa = a.price == null ? Infinity : a.price;
      var pb = b.price == null ? Infinity : b.price;
      if(pa !== pb) return pa - pb;
      return a.e.p.nameKo.localeCompare(b.e.p.nameKo, 'ko');
    }
    if(SEARCH.sort === 'name'){
      return a.e.p.nameKo.localeCompare(b.e.p.nameKo, 'ko');
    }
    var ra = evRankMap[a.e.p.evidenceLevel];
    var rb = evRankMap[b.e.p.evidenceLevel];
    ra = (ra === undefined) ? 9 : ra;
    rb = (rb === undefined) ? 9 : rb;
    if(ra !== rb) return ra - rb;
    if(a.score !== b.score) return b.score - a.score;
    return a.e.p.nameKo.localeCompare(b.e.p.nameKo, 'ko');
  });
  list.filtersActive = filtersActive;
  return list;
}

/* ---------------------------------------------------------------- 카드 */
function buyLink(p){
  var offers = mcOffersOf(p.id);
  for(var i = 0; i < offers.length; i++){
    if(offers[i].url) return {url: offers[i].url, label: offers[i].mallLabel + '에서 보기'};
  }
  var q = encodeURIComponent(p.searchQuery || (p.brandName + ' ' + p.nameKo));
  if(offers.length && offers[0].mall === 'coupang'){
    return {url: 'https://www.coupang.com/np/search?q=' + q, label: '쿠팡에서 검색'};
  }
  return {url: 'https://search.shopping.naver.com/search/all?query=' + q, label: '네이버에서 검색'};
}

function sellerText(p){
  var labels = [];
  mcOffersOf(p.id).forEach(function(o){
    if(labels.indexOf(o.mallLabel) === -1) labels.push(o.mallLabel);
  });
  return labels.length ? labels.join(' · ') : UNKNOWN.seller;
}

function makerText(p){
  if(!p.maker) return '';
  var b = mcNorm(p.brandName || '');
  var m = mcNorm(p.maker);
  if(b && m && b.indexOf(m) > -1) return '';     /* 브랜드명에 이미 들어 있으면 중복 표기 안 함 */
  return p.maker;
}

function sourceText(p){
  var names = (p.sourceIds || []).map(mcSourceName).filter(function(x){ return x && x !== '출처 미기록'; });
  if(!names.length) return '출처 미기록';
  return '출처: ' + names.slice(0, 2).join(' · ') + (names.length > 2 ? ' 외 ' + (names.length - 2) : '');
}

function renderSearchCard(item){
  var p = item.e.p;
  var offer = item.e.offer;
  var priceTxt = offer ? offer.priceText : UNKNOWN.price;
  var checked = offer && offer.checkedAt ? offer.checkedAt : (p.lastChecked || null);
  var buy = buyLink(p);
  var img = p.imageUrl || mcPlaceholderImage(p.kind, p.category);
  var kindKo = KIND_KO[p.kind] || '제품';
  var catKo = (CATS[p.category] && CATS[p.category].label) || CATEGORY_KO[p.category] || '기타';
  var catChip = (catKo && catKo !== kindKo) ? '<span class="scat">' + catKo + '</span>' : '';
  var evBadge = p.evidenceLevel
    ? '<span class="ev ' + p.evidenceLevel + '">' + (EV_TXT[p.evidenceLevel] || p.evidenceLabel || '') + '</span>'
    : '<span class="ev none">근거 미확인</span>';
  return '' +
    '<article class="scard" data-pid="' + p.id + '">' +
      '<button class="sthumb" type="button" data-detail="' + p.id + '" aria-label="' + mcEscape(p.nameKo) + ' 상세 보기">' +
        '<img src="' + img + '" alt="" loading="lazy">' +
      '</button>' +
      '<div class="smain">' +
        '<div class="stop">' +
          '<span class="skind ' + p.kind + '">' + kindKo + '</span>' + catChip +
          evBadge +
        '</div>' +
        '<h3 class="sname" data-detail="' + p.id + '">' + mcEscape(p.nameKo) + '</h3>' +
        '<p class="sbrand">' + mcEscape(p.brandName) +
          (makerText(p) ? ' · ' + mcEscape(makerText(p)) : '') + '</p>' +
        (p.nameEn ? '<p class="sen">' + mcEscape(p.nameEn) + '</p>' : '') +
        '<p class="ssize">' + mcEscape(mcUnknown(p.sizeText, '용량 정보 미확인')) + '</p>' +
        '<div class="sprice">' +
          '<b class="' + (offer ? '' : 'unk') + '">' + mcEscape(priceTxt) + '</b>' +
          '<span class="ssell">' + mcEscape(sellerText(p)) + '</span>' +
          '<span class="sdate">' + (checked ? '확인 ' + mcEscape(checked) : UNKNOWN.checked) + '</span>' +
        '</div>' +
        '<div class="sact">' +
          '<button type="button" class="sbtn" data-detail="' + p.id + '">상세 보기</button>' +
          '<a class="sbtn line" href="' + buy.url + '" target="_blank" rel="noopener">' + mcEscape(buy.label) + '</a>' +
          '<span class="ssrc">' + mcEscape(sourceText(p)) + '</span>' +
        '</div>' +
      '</div>' +
    '</article>';
}

/* ---------------------------------------------------------------- 쇼핑몰 검색 링크 */
function shopUrl(mall, q){
  var query = String(q == null ? '' : q).trim();
  if(mall === 'naver'){
    return 'https://search.shopping.naver.com/search/all?query=' + encodeURIComponent(query);
  }
  return 'https://www.coupang.com/np/search?q=' + encodeURIComponent(query);
}

function updateShopLinks(){
  var q = String(SEARCH.q || '').trim();
  document.querySelectorAll('[data-shop]').forEach(function(a){
    var mall = a.getAttribute('data-shop');
    if(q){
      a.setAttribute('href', shopUrl(mall, q));
      a.removeAttribute('aria-disabled');
      a.classList.remove('off');
    } else {
      a.removeAttribute('href');
      a.setAttribute('aria-disabled', 'true');
      a.classList.add('off');
    }
  });
  var note = document.getElementById('shopNote');
  if(note){
    note.textContent = q ? '“' + q + '”로 새 탭에서 검색합니다' : '검색어를 입력하면 쇼핑몰 검색이 열립니다';
  }
}

function shopButtonsHTML(extraClass){
  return '<a class="shopbtn naver ' + (extraClass || '') + '" data-shop="naver" target="_blank" rel="noopener">네이버 쇼핑 검색</a>' +
         '<a class="shopbtn coupang ' + (extraClass || '') + '" data-shop="coupang" target="_blank" rel="noopener">쿠팡 검색</a>';
}

/* ---------------------------------------------------------------- 렌더 */
function renderSearch(){
  var wrap = document.getElementById('searchResults');
  if(!wrap) return;
  var list = searchRun();
  var limit = SEARCH.q.trim() ? ((window.APP_CONFIG && APP_CONFIG.SEARCH_PAGE_SIZE) || 60) : 200;
  var shown = list.slice(0, limit);
  wrap.innerHTML = shown.map(renderSearchCard).join('');

  var empty = document.getElementById('searchEmpty');
  if(!list.length){
    empty.hidden = false;
    empty.innerHTML =
      '<p class="emp">' + EMPTY_TEXT + '</p>' +
      '<div class="shoprow center">' + shopButtonsHTML('big') + '</div>' +
      (list.filtersActive ? '<p class="emphint">필터를 “전체”로 바꾸면 더 많은 결과가 나옵니다.</p>' : '') +
      '<button type="button" class="reqopen" data-req-open>제품 직접 등록 요청하기</button>';
  } else {
    empty.hidden = true;
    empty.innerHTML = '';
  }
  updateShopLinks();

  var status = document.getElementById('searchStatus');
  if(status){
    var bits = [];
    bits.push('제품 <b>' + list.length + '</b>개');
    if(SEARCH.q.trim()) bits.push('검색어 “' + mcEscape(SEARCH.q.trim()) + '”');
    if(SEARCH.kind !== 'all') bits.push(KIND_KO[SEARCH.kind]);
    if(SEARCH.cat !== 'all') bits.push((CATS[SEARCH.cat] && CATS[SEARCH.cat].label) || CATEGORY_KO[SEARCH.cat]);
    if(SEARCH.brand !== 'all'){
      var b = DATA.brandById[SEARCH.brand];
      bits.push('브랜드 ' + mcEscape(b ? b.nameKo : SEARCH.brand));
    }
    if(SEARCH.price !== 'all'){
      var opt = document.querySelector('#priceFilter option:checked');
      bits.push(opt ? opt.textContent : '가격대');
    }
    if(list.length > limit) bits.push('상위 ' + limit + '개 표시');
    status.innerHTML = bits.join(' · ') +
      '<span class="stlib">내부 DB 96종 중 검색 · 가격 확인 21종 · 확인일 ' + (DATA.meta.generatedAt || '미기록') + '</span>';
  }
}

/* ---------------------------------------------------------------- 자동완성 */
function renderSuggest(){
  var box = document.getElementById('searchSuggest');
  var input = document.getElementById('searchInput');
  if(!box || !input) return;
  var q = input.value.trim();
  var nq = mcNorm(q);
  if(!nq){ box.hidden = true; box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); return; }

  var items = [];
  SEARCH_INDEX.forEach(function(e){
    if(items.length >= 5) return;
    if(e.norm.name.indexOf(nq) > -1){
      items.push({type: '제품', label: e.p.nameKo, sub: e.p.brandName, q: e.p.nameKo});
    }
  });
  DATA.brands.forEach(function(b){
    if(items.filter(function(x){ return x.type === '브랜드'; }).length >= 2) return;
    if(mcNorm(b.nameKo).indexOf(nq) > -1 && b.productCount > 0){
      items.push({type: '브랜드', label: b.nameKo, sub: '제품 ' + b.productCount + '종', q: b.nameKo});
    }
  });
  DATA.ingredients.forEach(function(g){
    if(items.filter(function(x){ return x.type === '성분'; }).length >= 2) return;
    if(mcNorm(g.nameKo).indexOf(nq) > -1){
      items.push({type: '성분', label: g.nameKo, sub: g.class || '성분', q: g.nameKo});
    }
  });

  if(!items.length){ box.hidden = true; box.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); return; }
  SEARCH.active = -1;
  box.innerHTML = items.map(function(it, i){
    return '<button type="button" class="sugg-item" role="option" data-suggest="' + mcEscape(it.q) + '" data-idx="' + i + '">' +
      '<span class="styp">' + it.type + '</span><b>' + mcEscape(it.label) + '</b>' +
      '<span class="ssub">' + mcEscape(it.sub || '') + '</span></button>';
  }).join('');
  box.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function moveSuggest(delta){
  var box = document.getElementById('searchSuggest');
  if(!box || box.hidden) return;
  var items = Array.prototype.slice.call(box.querySelectorAll('.sugg-item'));
  if(!items.length) return;
  SEARCH.active = (SEARCH.active + delta + items.length) % items.length;
  items.forEach(function(el, i){ el.classList.toggle('on', i === SEARCH.active); });
}

/* ---------------------------------------------------------------- 상태 반영 */
function syncSearchControls(){
  document.querySelectorAll('[data-kind]').forEach(function(b){
    b.setAttribute('aria-pressed', String(b.dataset.kind === SEARCH.kind));
  });
  document.querySelectorAll('[data-scat]').forEach(function(b){
    b.setAttribute('aria-pressed', String(b.dataset.scat === SEARCH.cat));
  });
  var brandSel = document.getElementById('brandFilter');
  if(brandSel) brandSel.value = SEARCH.brand;
  var priceSel = document.getElementById('priceFilter');
  if(priceSel) priceSel.value = SEARCH.price;
  var sortSel = document.getElementById('sortSelect');
  if(sortSel) sortSel.value = SEARCH.sort;
  var clearBtn = document.getElementById('searchClear');
  if(clearBtn) clearBtn.hidden = !SEARCH.q;
}

function setSearchQuery(q, opts){
  SEARCH.q = q || '';
  var input = document.getElementById('searchInput');
  if(input && input.value !== SEARCH.q) input.value = SEARCH.q;
  if(opts && opts.gotoSearch && state.view !== 'search') showView('search');
  syncSearchControls();
  renderSearch();
  updateShopLinks();
  if(opts && opts.instant){
    var box = document.getElementById('searchSuggest');
    if(box) box.hidden = true;
  }
}

/* ------------------------------------------------ 제품 직접 등록 요청(기기 임시 저장)
   GitHub Pages 정적 사이트라 제출을 서버로 보내지 않습니다.
   - 입력값은 이 브라우저(localStorage)에만 저장
   - 복사할 수 있는 요청서 텍스트를 만들어 준다 (전달은 사용자가 직접) */
function loadRequests(){
  try{
    var raw = localStorage.getItem(REQ_LS);
    var list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  }catch(e){ return []; }
}
function saveRequests(list){
  try{ localStorage.setItem(REQ_LS, JSON.stringify(list.slice(0, 30))); }catch(e){}
}
function requestText(req){
  return [
    '[멍케어 Lab 제품 등록 요청]',
    '제품명: ' + req.name,
    '브랜드명: ' + (req.brand || '(미입력)'),
    '상세 페이지: ' + (req.url || '(미입력)'),
    '요청 일시: ' + req.at,
    '',
    '※ 이 요청서는 이용자 기기에서 만들어졌습니다. 멍케어 Lab은 정적 사이트라 자동 접수되지 않으므로, 이 내용을 복사해 운영자에게 전달해 주세요.'
  ].join('\n');
}
function renderRequests(){
  var box = document.getElementById('reqList');
  if(!box) return;
  var list = loadRequests();
  if(!list.length){ box.innerHTML = '<li class="reqempty">아직 이 기기에 저장된 요청이 없습니다.</li>'; return; }
  box.innerHTML = list.map(function(r, i){
    return '<li><b>' + mcEscape(r.name) + '</b>' +
      (r.brand ? ' <span>' + mcEscape(r.brand) + '</span>' : '') +
      ' <i>' + mcEscape(r.at) + '</i>' +
      ' <button type="button" data-req-del="' + i + '" aria-label="요청 삭제">✕</button></li>';
  }).join('');
  var ta = document.getElementById('reqText');
  if(ta) ta.value = requestText(list[0]);
  var copyBtn = document.getElementById('reqCopy');
  if(copyBtn) copyBtn.disabled = false;
}

function submitRequest(){
  var nameEl = document.getElementById('reqName');
  var brandEl = document.getElementById('reqBrand');
  var urlEl = document.getElementById('reqUrl');
  var errEl = document.getElementById('reqErr');
  var name = (nameEl && nameEl.value || '').trim().replace(/\s+/g, ' ');
  var brand = (brandEl && brandEl.value || '').trim().replace(/\s+/g, ' ');
  var url = (urlEl && urlEl.value || '').trim();

  function fail(msg){
    errEl.hidden = false;
    errEl.textContent = msg;
  }
  errEl.hidden = true;
  if(!name){ fail('제품명을 입력해 주세요.'); if(nameEl) nameEl.focus(); return; }
  if(url && !/^https?:\/\/\S+$/i.test(url)){ fail('상세 페이지 URL은 http:// 또는 https://로 시작해야 합니다.'); urlEl.focus(); return; }

  var d = new Date();
  var at = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
           ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  var req = {name: name.slice(0, 60), brand: brand.slice(0, 40), url: url.slice(0, 300), at: at};
  var list = loadRequests();
  list.unshift(req);
  saveRequests(list);
  if(nameEl) nameEl.value = '';
  if(brandEl) brandEl.value = '';
  if(urlEl) urlEl.value = '';
  renderRequests();
  toast('이 기기에만 임시 저장했습니다 · 아래 요청서를 복사해 전달하세요');
  var ta = document.getElementById('reqText');
  if(ta){ ta.focus(); ta.select(); }
}

function copyRequest(){
  var ta = document.getElementById('reqText');
  if(!ta || !ta.value){ toast('먼저 요청서를 만들어 주세요'); return; }
  var done = function(){ toast('요청서를 복사했습니다'); };
  var fail = function(){
    ta.focus(); ta.select();
    toast('복사가 막혔습니다 · 선택된 내용을 직접 복사해 주세요');
  };
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(ta.value).then(done).catch(fail);
  } else {
    fail();
  }
}

/* ---------------------------------------------------------------- 제품 상세 */
function strengthText(s){
  return {strong: '근거 강함', moderate: '근거 보통', weak: '근거 약함', insufficient: '근거 자료 부족'}[s] || '근거 자료 부족';
}

function evItemHTML(e){
  return '<li class="evi">' +
    '<div class="evh"><b>' + mcEscape(e.title || '연구자료') + '</b>' +
      '<span class="evs ' + (e.strength || 'insufficient') + '">' + strengthText(e.strength) + '</span></div>' +
    '<p>' + mcEscape(e.summary || '요약 없음') + '</p>' +
    (e.url
      ? '<a class="evl" href="' + mcEscape(e.url) + '" target="_blank" rel="noopener">' + mcEscape(e.citation || '출처') + ' ↗</a>'
      : '<span class="evl off">' + mcEscape(e.citation || '출처 미기록') + '</span>') +
    '</li>';
}

function kvRows(rows){
  return '<dl class="dkv">' + rows.map(function(r){
    return '<div><dt>' + mcEscape(r[0]) + '</dt><dd' + (r[2] ? ' class="unk"' : '') + '>' +
      mcEscape(r[1]) + '</dd></div>';
  }).join('') + '</dl>';
}

function offersTable(p){
  var offers = mcOffersOf(p.id);
  if(!offers.length){
    return '<p class="dunk">' + UNKNOWN.price + ' — 확인된 판매처 가격이 없습니다. 가격을 확인하지 않은 제품은 추정가를 적지 않습니다.</p>';
  }
  return '<div class="doffers">' + offers.map(function(o){
    return '<div class="doffer">' +
      '<span class="dmall">' + mcEscape(o.mallLabel) + '</span>' +
      '<span class="dprice">' + mcEscape(o.priceText || UNKNOWN.price) +
        (o.sizeText ? ' <small>(' + mcEscape(o.sizeText) + ')</small>' : '') + '</span>' +
      '<span class="dmeta">' + (o.rating ? '★ ' + mcEscape(o.rating) : '평점 없음') +
        (o.reviewCount != null ? ' · 리뷰 ' + fmtCount(o.reviewCount) : '') +
        ' · 확인 ' + mcEscape(o.checkedAt || '—') + '</span>' +
      (o.url ? ' <a class="dlink" href="' + mcEscape(o.url) + '" target="_blank" rel="noopener">이동 ↗</a>' : '') +
      '</div>';
  }).join('') + '</div>';
}

function ingredientsTable(p){
  var rows = mcIngredientsOf(p.id);
  var real = rows.filter(function(x){ return !x.derived; });
  var derived = rows.filter(function(x){ return x.derived; });
  var html = '';
  if(real.length){
    html += '<ul class="ding">' + real.map(function(x){
      var known = x.amountText && x.amountText !== '';
      return '<li><b>' + mcEscape(x.label) + '</b>' +
        '<span class="' + (known ? '' : 'unk') + '">' + mcEscape(known ? x.amountText : '함량 미표기') + '</span></li>';
    }).join('') + '</ul>';
  } else {
    html += '<p class="dunk">' + UNKNOWN.info + ' — 제품 라벨의 원재료·성분표를 확인하지 못했습니다. 급여 전 포장지 표시사항을 확인하세요.</p>';
  }
  if(derived.length){
    html += '<p class="dhint">진단 DB 분류상 성분 축: ' + derived.map(function(x){ return mcEscape(x.label); }).join(', ') +
      ' · 함량은 확인하지 않았습니다.</p>';
  }
  return html;
}

function analysisTable(p){
  var a = (p.detail && p.detail.analysis) || {};
  var rows = [
    ['조단백', a.protein], ['조지방', a.fat], ['조섬유', a.fiber],
    ['조회분', a.ash], ['수분', a.moisture], ['열량', a.kcal]
  ];
  return '<table class="dtable"><tbody>' + rows.map(function(r){
    var v = r[1];
    return '<tr><th>' + r[0] + '</th><td' + (v == null ? ' class="unk"' : '') + '>' +
      mcEscape(v == null ? UNKNOWN.info : v) + '</td></tr>';
  }).join('') + '</tbody></table>' +
  ((p.detail && p.detail.sourceNote) ? '<p class="dhint">' + mcEscape(p.detail.sourceNote) + '</p>' : '') +
  '<p class="dhint">표기 기준(급여 상태·습량)은 제조사 라벨마다 다릅니다. 확인하지 못한 칸은 비워 두고 ‘정보 미확인’으로 표시합니다.</p>';
}

function evidenceSection(p){
  var ev = mcEvidenceOf(p.id);
  var ingHTML = ev.ingredient.length
    ? '<ul class="evlist">' + ev.ingredient.map(evItemHTML).join('') + '</ul>'
    : '<p class="dunk">' + UNKNOWN.evidence + ' — 이 제품에 든 성분의 공개 연구를 확인하지 못했습니다.</p>';
  var finHTML = ev.finished.length
    ? '<ul class="evlist">' + ev.finished.map(evItemHTML).join('') + '</ul>'
    : '<p class="dunk">' + UNKNOWN.evidence + ' — 이 완제품 자체를 시험한 임상연구는 확인되지 않았습니다. ' +
      '제조사가 말하는 제품 임상은 공개 논문으로 확인되기 전까지 근거로 쓰지 않습니다.</p>';
  return '<div class="devsplit">' +
      '<div class="devcol"><h5>성분 자체 연구 <span>원료 단위</span></h5>' + ingHTML + '</div>' +
      '<div class="devcol"><h5>완제품 임상연구 <span>이 제품 그 자체</span></h5>' + finHTML + '</div>' +
    '</div>';
}

function sourcesBlock(p){
  var ids = p.sourceIds || [];
  var list = ids.map(function(id){
    var s = DATA.sourceById[id];
    if(!s) return null;
    return '<li><b>' + mcEscape(s.name) + '</b>' +
      (s.note ? ' <span>' + mcEscape(s.note) + '</span>' : '') +
      (s.url ? ' <a href="' + mcEscape(s.url) + '" target="_blank" rel="noopener">바로가기 ↗</a>' : '') + '</li>';
  }).filter(Boolean);
  var evSrc = mcEvidenceOf(p.id).product.map(function(e){
    return '<li><b>' + mcEscape(e.citation) + '</b>' +
      (e.url ? ' <a href="' + mcEscape(e.url) + '" target="_blank" rel="noopener">바로가기 ↗</a>' : '') + '</li>';
  });
  var all = list.concat(evSrc);
  if(!all.length){
    return '<p class="dunk">출처 미기록 — 이 항목은 진단 DB에 이름만 등록되어 있고 가격·성분 출처를 확인하지 않았습니다.</p>';
  }
  return '<ul class="dsrc">' + all.join('') + '</ul>';
}

function allergenBlock(p){
  var list = (p.allergens || []).filter(function(x){ return x; });
  if(list.length){
    return '<div class="ingrow">' + list.map(function(x){ return '<span class="algchip">' + mcEscape(x) + '</span>'; }).join('') + '</div>' +
      (p.allergenNote ? '<p class="dhint">' + mcEscape(p.allergenNote) + '</p>' : '');
  }
  if(p.allergenNote){
    return '<p class="dhint">' + mcEscape(p.allergenNote) + '</p>';
  }
  return '<p class="dunk">' + UNKNOWN.info + ' — 전성분을 확인하지 못했습니다. 알레르기가 있으면 급여 전 라벨을 확인하세요.</p>';
}

function detailHTML(p){
  var offer = mcPriceOf(p.id);
  var checked = offer && offer.checkedAt ? offer.checkedAt : p.lastChecked;
  var brand = DATA.brandById[p.brandId] || {};
  var kindKo = KIND_KO[p.kind] || '제품';
  var catKo = (CATS[p.category] && CATS[p.category].label) || CATEGORY_KO[p.category] || '기타';
  var baseRows = [
    ['브랜드', p.brandName, false],
    ['제조사', p.maker || UNKNOWN.info, !p.maker],
    ['구분', kindKo === catKo ? kindKo : kindKo + ' · ' + catKo, false],
    ['용량·형태', p.formText || UNKNOWN.info, !p.formText],
    ['확인일', checked || UNKNOWN.checked, !checked]
  ];
  if(brand.nameEn) baseRows.splice(1, 0, ['영문 브랜드', brand.nameEn, false]);
  if(p.nameEn) baseRows.splice(1, 0, ['영문 제품명', p.nameEn, false]);

  var body;
  if(p.kind === 'food'){
    var d = p.detail || {};
    body = '' +
      '<section class="dsec"><h4><i>01</i> 기본 정보</h4>' + kvRows(baseRows) + '</section>' +
      '<section class="dsec"><h4><i>02</i> 원재료 목록</h4>' +
        (d.ingredientList && d.ingredientList.length
          ? '<div class="ingrow">' + d.ingredientList.map(function(x){ return '<span>' + mcEscape(x) + '</span>'; }).join('') + '</div>'
          : ingredientsTable(p)) +
      '</section>' +
      '<section class="dsec"><h4><i>03</i> 영양 성분 (라벨 기준)</h4>' + analysisTable(p) + '</section>' +
      '<section class="dsec"><h4><i>04</i> 적용 생애주기</h4><p' + (d.lifeStage ? '' : ' class="dunk"') + '>' +
        mcEscape(d.lifeStage || UNKNOWN.info + ' — 제조사 라벨의 대상 연령을 확인하지 못했습니다.') + '</p></section>' +
      '<section class="dsec"><h4><i>05</i> 급여 안내</h4><p' + (d.servingGuide ? '' : ' class="dunk"') + '>' +
        mcEscape(d.servingGuide || UNKNOWN.info + ' — 체중별 급여량 표를 확인하지 못했습니다. 포장지 표를 따르세요.') + '</p></section>' +
      '<section class="dsec"><h4><i>06</i> 알레르기 관련 원료</h4>' + allergenBlock(p) + '</section>' +
      '<section class="dsec"><h4><i>07</i> 연구자료</h4>' + evidenceSection(p) + '</section>' +
      '<section class="dsec"><h4><i>08</i> 출처</h4>' + sourcesBlock(p) + '</section>';
  } else {
    var dd = p.detail || {};
    body = '' +
      '<section class="dsec"><h4><i>01</i> 기본 정보</h4>' + kvRows(baseRows) + '</section>' +
      '<section class="dsec"><h4><i>02</i> 주요 기능성 성분·함량</h4>' + ingredientsTable(p) + '</section>' +
      '<section class="dsec"><h4><i>03</i> 권장 급여량</h4><p' + (dd.servingGuide || p.formText ? '' : ' class="dunk"') + '>' +
        mcEscape(dd.servingGuide || (p.formText && /급여|정\/일|포\/일|스푼/.test(p.formText)
          ? p.formText + ' (라벨 표기 그대로)'
          : UNKNOWN.info + ' — 체중별 급여량을 확인하지 못했습니다.')) + '</p></section>' +
      '<section class="dsec"><h4><i>04</i> 용량</h4><p' + (p.formText ? '' : ' class="dunk"') + '>' +
        mcEscape(p.formText || UNKNOWN.info) + '</p></section>' +
      '<section class="dsec"><h4><i>05</i> 주의사항</h4><p' + (p.cautions ? '' : ' class="dunk"') + '>' +
        mcEscape(p.cautions || UNKNOWN.info + ' — 제조사 주의문을 확인하지 못했습니다. 기저질환·복용 약이 있으면 수의사와 상의하세요.') +
        '</p></section>' +
      '<section class="dsec"><h4><i>06</i> 알레르기 관련 원료</h4>' + allergenBlock(p) + '</section>' +
      '<section class="dsec"><h4><i>07</i> 연구자료</h4>' + evidenceSection(p) + '</section>' +
      '<section class="dsec"><h4><i>08</i> 출처</h4>' + sourcesBlock(p) + '</section>';
  }

  var buy = buyLink(p);
  var review = DATA.reviewByProduct[p.id];
  return '' +
    '<div class="dtop">' +
      '<button class="dx" type="button" data-close-detail aria-label="상세 닫기">✕</button>' +
      '<div class="dheadimg"><img src="' + (p.imageUrl || mcPlaceholderImage(p.kind, p.category)) + '" alt=""></div>' +
      '<div class="dheadtxt">' +
        '<div class="stop"><span class="skind ' + p.kind + '">' + kindKo + '</span>' +
          ((catKo && catKo !== kindKo) ? '<span class="scat">' + catKo + '</span>' : '') + '</div>' +
        '<h3 id="detailTitle">' + mcEscape(p.nameKo) + '</h3>' +
        '<p class="sbrand">' + mcEscape(p.brandName) + (makerText(p) ? ' · ' + mcEscape(makerText(p)) : '') + '</p>' +
        '<p class="dprice-lg">' + mcEscape(offer ? offer.priceText : UNKNOWN.price) + '</p>' +
        '<p class="dhint">' + mcEscape(sellerText(p)) + ' · ' + (checked ? '확인 ' + mcEscape(checked) : UNKNOWN.checked) + '</p>' +
      '</div>' +
    '</div>' +
    '<div class="dbody">' +
      body +
      '<section class="dsec"><h4><i>09</i> 판매처·가격</h4>' + offersTable(p) + '</section>' +
      '<section class="dsec"><h4><i>10</i> 리뷰 정보</h4>' +
        (review && review.summaryText
          ? '<p>' + mcEscape(review.summaryText) + '</p><p class="dhint">리뷰 요약은 판매처 표시값과 공개 리뷰 집계를 정리한 것이며 효능 근거가 아닙니다.</p>'
          : '<p class="dunk">' + UNKNOWN.review + ' — 확인된 리뷰 요약이 없습니다.</p>') +
      '</section>' +
      '<p class="dnote">이 상세 정보는 공개 판매 페이지·제품 라벨에서 확인한 값만 담았고, 확인하지 못한 항목은 “' +
        UNKNOWN.info + '”·“' + UNKNOWN.price + '”·“' + UNKNOWN.evidence + '”로 표시합니다. 참고용이며 수의학적 진단·처방이 아닙니다.</p>' +
    '</div>' +
    '<div class="dfoot">' +
      '<a class="btn fill" href="' + buy.url + '" target="_blank" rel="noopener">' + mcEscape(buy.label) + '</a>' +
      '<button class="btn line" type="button" data-close-detail>닫기</button>' +
    '</div>';
}

function openDetail(id){
  var p = DATA.productById[id];
  if(!p) return;
  var wrap = document.getElementById('detailWrap');
  var panel = document.getElementById('detailPanel');
  if(!wrap || !panel) return;
  SEARCH_LAST_FOCUS = document.activeElement;
  panel.innerHTML = detailHTML(p);
  wrap.hidden = false;
  document.body.classList.add('dopen');
  panel.scrollTop = 0;
  var closeBtn = panel.querySelector('[data-close-detail]');
  if(closeBtn) closeBtn.focus();
}

function closeDetail(){
  var wrap = document.getElementById('detailWrap');
  if(!wrap || wrap.hidden) return;
  wrap.hidden = true;
  document.body.classList.remove('dopen');
  if(SEARCH_LAST_FOCUS && SEARCH_LAST_FOCUS.focus) SEARCH_LAST_FOCUS.focus();
}

/* ---------------------------------------------------------------- 초기화 */
function buildBrandFilter(){
  var sel = document.getElementById('brandFilter');
  if(!sel) return;
  var used = {};
  DATA.products.forEach(function(p){ used[p.brandId] = true; });
  var opts = DATA.brands.filter(function(b){ return used[b.id]; })
    .sort(function(a, b){ return a.nameKo.localeCompare(b.nameKo, 'ko'); })
    .map(function(b){ return '<option value="' + b.id + '">' + mcEscape(b.nameKo) + '</option>'; });
  sel.innerHTML = '<option value="all">브랜드 전체</option>' + opts.join('');
}

function buildSearchChips(){
  var kind = document.getElementById('kindFilter');
  if(kind && !kind.children.length){
    [['all', '전체'], ['food', '사료'], ['supplement', '영양제']].forEach(function(x){
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.kind = x[0]; b.textContent = x[1]; b.setAttribute('aria-pressed', 'false');
      kind.appendChild(b);
    });
  }
  var cat = document.getElementById('catFilter');
  if(cat && !cat.children.length){
    var first = document.createElement('button');
    first.type = 'button'; first.dataset.scat = 'all'; first.textContent = '전체 부위'; first.setAttribute('aria-pressed', 'true');
    cat.appendChild(first);
    CAT_ORDER.forEach(function(k){
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.scat = k; b.setAttribute('aria-pressed', 'false');
      b.textContent = CATS[k].emoji + ' ' + CATS[k].short;
      cat.appendChild(b);
    });
  }
}

function bindSearch(){
  var input = document.getElementById('searchInput');
  var clearBtn = document.getElementById('searchClear');
  var kind = document.getElementById('kindFilter');
  var cat = document.getElementById('catFilter');
  var brand = document.getElementById('brandFilter');
  var price = document.getElementById('priceFilter');
  var sort = document.getElementById('sortSelect');
  var sugg = document.getElementById('searchSuggest');
  var results = document.getElementById('searchResults');

  if(input){
    input.addEventListener('input', function(){
      SEARCH.q = input.value;
      syncSearchControls();
      renderSuggest();
      if(SEARCH.q.trim() && state.view !== 'search') showView('search');
      renderSearch();
      updateShopLinks();
      clearTimeout(SEARCH_DEBOUNCE);
      SEARCH_DEBOUNCE = setTimeout(function(){ renderSearch(); }, 130);
    });
    input.addEventListener('keydown', function(e){
      if(e.key === 'ArrowDown'){ e.preventDefault(); moveSuggest(1); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); moveSuggest(-1); }
      else if(e.key === 'Enter'){
        if(!sugg.hidden && SEARCH.active > -1){
          e.preventDefault();
          var el = sugg.querySelectorAll('.sugg-item')[SEARCH.active];
          if(el) setSearchQuery(el.dataset.suggest, {instant: true, gotoSearch: true});
        } else if(SEARCH.q.trim()){
          setSearchQuery(SEARCH.q.trim(), {instant: true, gotoSearch: true});
        }
      } else if(e.key === 'Escape'){ sugg.hidden = true; }
    });
    input.addEventListener('blur', function(){ setTimeout(function(){ if(sugg) sugg.hidden = true; }, 120); });
  }
  if(clearBtn) clearBtn.addEventListener('click', function(){
    if(input) input.value = '';
    setSearchQuery('', {instant: true});
    if(input) input.focus();
  });

  if(sugg) sugg.addEventListener('mousedown', function(e){
    var b = e.target.closest('[data-suggest]');
    if(!b) return;
    e.preventDefault();
    setSearchQuery(b.dataset.suggest, {instant: true, gotoSearch: true});
  });

  if(kind) kind.addEventListener('click', function(e){
    var b = e.target.closest('[data-kind]');
    if(!b) return;
    SEARCH.kind = b.dataset.kind;
    syncSearchControls(); renderSearch();
  });
  if(cat) cat.addEventListener('click', function(e){
    var b = e.target.closest('[data-scat]');
    if(!b) return;
    SEARCH.cat = b.dataset.scat;
    syncSearchControls(); renderSearch();
  });
  if(brand) brand.addEventListener('change', function(){ SEARCH.brand = brand.value; renderSearch(); });
  if(price) price.addEventListener('change', function(){ SEARCH.price = price.value; renderSearch(); });
  if(sort) sort.addEventListener('change', function(){ SEARCH.sort = sort.value; renderSearch(); });

  if(results) results.addEventListener('click', function(e){
    var d = e.target.closest('[data-detail]');
    if(!d) return;
    e.preventDefault();
    openDetail(d.dataset.detail);
  });

  /* 검색 결과 없음 → 등록 요청 폼 열기 */
  var emptyBox = document.getElementById('searchEmpty');
  if(emptyBox) emptyBox.addEventListener('click', function(e){
    if(!e.target.closest('[data-req-open]')) return;
    var box = document.getElementById('reqBox');
    if(box){ box.open = true; box.scrollIntoView({behavior: 'smooth', block: 'start'}); }
    var nm = document.getElementById('reqName');
    if(nm) setTimeout(function(){ nm.focus(); }, 250);
  });

  /* 직접 등록 요청 */
  var reqSave = document.getElementById('reqSave');
  if(reqSave) reqSave.addEventListener('click', submitRequest);
  var reqCopy = document.getElementById('reqCopy');
  if(reqCopy) reqCopy.addEventListener('click', copyRequest);
  var reqName = document.getElementById('reqName');
  if(reqName) reqName.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); submitRequest(); } });
  var reqUrl = document.getElementById('reqUrl');
  if(reqUrl) reqUrl.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); submitRequest(); } });
  var reqList = document.getElementById('reqList');
  if(reqList) reqList.addEventListener('click', function(e){
    var b = e.target.closest('[data-req-del]');
    if(!b) return;
    var list = loadRequests();
    list.splice(Number(b.dataset.reqDel), 1);
    saveRequests(list);
    renderRequests();
    toast('요청을 삭제했습니다');
  });

  var wrap = document.getElementById('detailWrap');
  if(wrap){
    wrap.addEventListener('click', function(e){
      if(e.target.closest('[data-close-detail]') || e.target.dataset.close !== undefined || e.target.classList.contains('dscrim')){
        closeDetail();
      }
    });
  }
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape'){ closeDetail(); }
  });
}

function bootSearch(){
  buildSearchIndex();
  buildBrandFilter();
  buildSearchChips();
  bindSearch();
  syncSearchControls();
  renderSearch();
  updateShopLinks();
  renderRequests();
  window.MC_SEARCH_READY = true;
}
