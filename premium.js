/* 멍케어 Lab v0.7 — 유료 기능 모듈 (분리 보관)
   ------------------------------------------------------------------
   지금은 ENABLE_PREMIUM = false 이므로 이 파일은 "정의만" 있고
   화면에 유료 메뉴·배너·결제 버튼·가격표를 전혀 만들지 않습니다.
   app.js / search.js 는 이 모듈을 호출하지 않으므로, 스위치가 꺼져 있는 동안
   유료 코드 경로는 실행되지 않습니다.

   켜는 방법: config.js 의 ENABLE_PREMIUM 을 true 로 바꾸고,
   아래 features 의 UI 를 mount() 에서 실제로 그립니다. (현재 v0.7 범위 밖)
   ------------------------------------------------------------------ */
"use strict";

(function(){
  var FEATURES = [
    {id:'plan-plus',    name:'3개월 플랜 상세 확장', scope:'report',
     note:'리포트에 제품별 대체안·예산 시뮬레이션을 추가하는 확장안. 현재 미구현.'},
    {id:'vet-summary',  name:'병원 상담용 요약 PDF', scope:'report',
     note:'진단 결과를 수의사 상담용 1장 요약으로 내보내는 확장안. 현재 미구현.'},
    {id:'price-alert',  name:'가격·재고 알림', scope:'search',
     note:'서버리스 프록시의 가격 조회와 스케줄러가 먼저 갖춰져야 하는 기능. 현재 미구현.'}
  ];

  var PremiumModule = {
    version: '0.7.0',
    features: FEATURES,
    isEnabled: function(){
      return !!(window.APP_CONFIG && window.APP_CONFIG.ENABLE_PREMIUM === true);
    },
    /* 유료 UI 진입점. 스위치가 꺼져 있으면 아무것도 하지 않고 false 를 돌려줍니다. */
    mount: function(){
      if(!this.isEnabled()) return false;
      var host = document.getElementById('premiumSlot');
      if(!host) return false;
      host.hidden = false;
      host.innerHTML = '';
      return true;
    },
    /* 결제·업그레이드 진입점. 꺼져 있으면 결제 흐름 자체를 열지 않습니다. */
    openCheckout: function(){
      if(!this.isEnabled()) return {ok: false, reason: 'premium_disabled'};
      return {ok: false, reason: 'not_implemented'};
    },
    /* 현재 노출 상태(진단·테스트용) */
    status: function(){
      return {enabled: this.isEnabled(), mounted: false, featureCount: FEATURES.length};
    }
  };

  window.PremiumModule = PremiumModule;
  if(PremiumModule.isEnabled()) PremiumModule.mount();
})();
