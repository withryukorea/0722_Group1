(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.EACC_TRAVEL_POLICY = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DEFAULT_POLICY = {
    version: '2026-07-22',
    source: 'docs/출장비 정산 기준.md',
    roles: {
      CEO: 'CEO',
      DIVISION_HEAD: '부문장',
      HQ_HEAD: '본부장',
      TEAM_LEAD: '팀장',
      TEAM_MEMBER: '팀원',
    },
    domestic: {
      perDiem: {
        unit: 'day', currency: 'KRW',
        rates: { CEO: null, DIVISION_HEAD: null, HQ_HEAD: null, TEAM_LEAD: 35000, TEAM_MEMBER: 35000 },
      },
      lodging: {
        unit: 'night', currency: 'KRW', exceptionMultiplier: 1.5,
        rates: { CEO: null, DIVISION_HEAD: null, HQ_HEAD: null, TEAM_LEAD: null, TEAM_MEMBER: 120000 },
      },
      transport: { mode: 'ACTUAL', scope: 'PUBLIC_TRANSPORT' },
      notes: [
        '팀원 숙박료는 필요 시 출장 승인권자 승인으로 기본 한도의 1.5배까지 정산할 수 있습니다.',
        '임원을 수행하는 팀장·팀원은 일당을 실비로 정산할 수 있습니다.',
        '업무 관련 회의장·인터넷·이메일·FAX·전화 사용료는 일당에 포함하지 않고 실비로 정산할 수 있습니다.',
      ],
    },
    foreign: {
      regions: {
        JP: { label: '일본', currency: 'JPY' },
        CN: { label: '중국', currency: 'CNY' },
        OTHER: { label: '이외 지역', currency: 'USD' },
      },
      lodging: {
        unit: 'night',
        rates: {
          CEO: { JP: null, CN: null, OTHER: null },
          DIVISION_HEAD: { JP: null, CN: null, OTHER: null },
          HQ_HEAD: { JP: null, CN: null, OTHER: null },
          TEAM_LEAD: { JP: 23000, CN: 1400, OTHER: 200 },
          TEAM_MEMBER: { JP: 23000, CN: 1400, OTHER: 200 },
        },
      },
      perDiem: {
        unit: 'day',
        rates: {
          CEO: { JP: null, CN: null, OTHER: null },
          DIVISION_HEAD: { JP: 25000, CN: 1400, OTHER: null },
          HQ_HEAD: { JP: 23000, CN: 1100, OTHER: 160 },
          TEAM_LEAD: { JP: 19000, CN: 900, OTHER: 130 },
          TEAM_MEMBER: { JP: 17000, CN: 800, OTHER: 115 },
        },
      },
      notes: [
        '해외 지급한도는 출장 국가 통화 기준이며 화면의 원화 금액은 기준 환율로 환산한 참고액입니다.',
        '해외 교통비와 기타 항목은 현재 지급기준표에 별도 한도가 기재되어 있지 않습니다.',
      ],
    },
  };

  let policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  const unitLabels = { day: '일', night: '박' };
  const currencyLabels = { KRW: '원', JPY: '엔', CNY: '위안', USD: '달러' };
  const currencySymbols = { KRW: '', JPY: '¥', CNY: 'RMB ', USD: '$' };

  function setPolicy(next) {
    if (!next || !next.roles || !next.domestic || !next.foreign) return false;
    policy = JSON.parse(JSON.stringify(next));
    return true;
  }

  function getPolicy() {
    return policy;
  }

  function roleLabel(role) {
    return policy.roles[role] || role;
  }

  function regionFor(country) {
    const value = String(country || '').trim().toUpperCase();
    if (!value || value === '전체') return null;
    if (['일본', 'JP', 'JAPAN'].includes(value)) return 'JP';
    if (['중국', 'CN', 'CHINA'].includes(value)) return 'CN';
    return 'OTHER';
  }

  function actualLimit(kind, role, units, region) {
    return { mode: 'ACTUAL', kind, role, units, region, rate: null, amount: null, currency: null };
  }

  function domesticLimit(kind, role, units) {
    const count = Math.max(0, Number(units) || 0);
    if (kind === 'transport') return actualLimit(kind, role, count, 'KR');
    const spec = policy.domestic[kind];
    const rate = spec && spec.rates ? spec.rates[role] : null;
    if (rate == null) return actualLimit(kind, role, count, 'KR');
    const result = {
      mode: 'CAPPED', kind, role, units: count, region: 'KR', currency: 'KRW',
      unit: spec.unit, rate, amount: rate * count,
    };
    if (kind === 'lodging' && spec.exceptionMultiplier) {
      result.exceptionMultiplier = spec.exceptionMultiplier;
      result.approvedAmount = Math.round(result.amount * spec.exceptionMultiplier);
    }
    return result;
  }

  function foreignLimit(kind, role, country, units) {
    const count = Math.max(0, Number(units) || 0);
    const region = regionFor(country);
    if (!region) {
      return { mode: 'UNSPECIFIED', reason: 'COUNTRY_REQUIRED', kind, role, units: count, region: null, rate: null, amount: null, currency: null };
    }
    const spec = policy.foreign[kind];
    if (!spec || !spec.rates || !spec.rates[role]) {
      return { mode: 'UNSPECIFIED', kind, role, units: count, region, rate: null, amount: null, currency: null };
    }
    const rate = spec.rates[role][region];
    if (rate == null) return actualLimit(kind, role, count, region);
    const currency = policy.foreign.regions[region].currency;
    return {
      mode: 'CAPPED', kind, role, units: count, region, currency,
      unit: spec.unit, rate, amount: rate * count,
    };
  }

  function toKRW(limit, fxRates) {
    if (!limit || limit.mode !== 'CAPPED') return null;
    const rates = fxRates || {};
    const rate = Number(rates[limit.currency]);
    return Number.isFinite(rate) ? Math.round(limit.amount * rate) : null;
  }

  function formatMoney(amount, currency) {
    if (amount == null) return '';
    return `${currencySymbols[currency] || ''}${Number(amount).toLocaleString('ko-KR')}${currencySymbols[currency] ? '' : (currencyLabels[currency] || '')}`;
  }

  function formatUnitRate(limit) {
    if (!limit || limit.mode === 'UNSPECIFIED') return '기준표 미기재';
    if (limit.mode === 'ACTUAL') return '실비';
    return `${formatMoney(limit.rate, limit.currency)}/${unitLabels[limit.unit] || limit.unit}`;
  }

  return {
    DEFAULT_POLICY,
    setPolicy,
    getPolicy,
    roleLabel,
    regionFor,
    domesticLimit,
    foreignLimit,
    toKRW,
    formatMoney,
    formatUnitRate,
  };
});
