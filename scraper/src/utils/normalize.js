const today = () => new Date().toISOString().slice(0, 10);

// ── Direct HubPay competitor filter ──────────────────────────────────────
//
// HubPay's business: cross-border payments, remittance, FX, multi-currency
// accounts, cross-border payroll — primarily UAE ↔ Africa/South Asia corridors.
//
// A lead qualifies ONLY if it is a company that moves money across borders
// in a region HubPay operates. This intentionally excludes:
//   ✗ Local-only payment gateways (no cross-border element)
//   ✗ BNPL / buy-now-pay-later companies
//   ✗ Expense management / corporate cards
//   ✗ Lending / credit platforms
//   ✗ Insurance tech
//   ✗ Generic "fintech" with no payments angle
//   ✗ News article headline fragments

// CROSS_BORDER_SIGNALS — company must move money internationally
// Any one of these alone is enough IF paired with a geography below.
const CROSS_BORDER_SIGNALS = [
  // Remittance & money transfer
  'remittance', 'remit', 'money transfer', 'send money', 'transfer money',
  'cross-border payment', 'cross border payment',
  'international payment', 'global payment', 'cross-border transfer',
  // FX & currency
  'currency exchange', 'money exchange', 'exchange house', 'forex bureau',
  'corporate fx', 'fx platform', 'multi-currency', 'multicurrency',
  'foreign exchange',
  // Payroll
  'cross-border payroll', 'cross border payroll', 'global payroll',
  'international payroll', 'salary transfer', 'wage transfer',
  // Infrastructure & corridors
  'payment corridor', 'bulk payment', 'mass payment', 'bulk transfer',
  'disbursement', 'payout platform',
  'hawala',
];

// CORRIDOR_GEOS — the specific markets HubPay serves or competes in
const CORRIDOR_GEOS = [
  // UAE / GCC (HubPay's home market)
  'uae', 'dubai', 'abu dhabi', 'sharjah', 'difc', 'adgm',
  'gcc', 'gulf', 'saudi', 'qatar', 'kuwait', 'oman', 'bahrain',
  // Africa corridors HubPay serves
  'kenya', 'nigeria', 'ghana', 'tanzania', 'ethiopia', 'uganda',
  'senegal', 'africa',
  // South/South-East Asia corridors (large expat populations in UAE)
  'pakistan', 'india', 'philippines', 'sri lanka', 'bangladesh', 'nepal',
  // MENA broadly
  'mena', 'middle east', 'egypt', 'jordan',
];

// EXCLUDE_SIGNALS — if any of these appear WITHOUT a cross-border signal,
// reject the lead. Prevents BNPL, insurance, expense cards, etc. slipping in.
const EXCLUDE_SIGNALS = [
  'buy now pay later', 'bnpl', 'pay later',
  'insurance', 'insurtech',
  'expense management', 'expense card', 'corporate card', 'spend management',
  'lending', 'credit platform', 'loan',
  'real estate', 'proptech',
  'food delivery', 'restaurant', 'grocery',
  'dating', 'audiobook', 'e-learning', 'edtech',
  'fleet management',           // fleet payments ≠ cross-border money transfer
  'school fee', 'tuition fee',  // local payment collection
  'loyalty program', 'loyalty platform', 'rewards program',
];

// COMPANY_NAME_BLOCKLIST — patterns that indicate a headline fragment or non-company
const HEADLINE_PATTERNS = [
  /^(how|why|what|when|where|who|the|a\s|an\s)/i,
  /^(power|promise|meet|report|inside|exclusive)/i,
  /[:,]$/,                          // ends with colon or comma
  /^[A-Z]{2,}:\s/,                  // starts like "UAE: ..."
];

export function isCompanyName(name = '') {
  const n = name.trim();
  if (n.length < 2 || n.length > 80) return false;
  if (n.split(/\s+/).length > 8) return false;        // too many words = headline
  if (HEADLINE_PATTERNS.some(p => p.test(n))) return false;
  return true;
}

export function isHubpayRelevant(text = '') {
  const t = text.toLowerCase();

  // Must have at least one cross-border signal
  const hasCrossBorder = CROSS_BORDER_SIGNALS.some(k => t.includes(k));
  if (!hasCrossBorder) return false;

  // Must operate in a corridor geography HubPay cares about
  const hasGeo = CORRIDOR_GEOS.some(k => t.includes(k));
  if (!hasGeo) return false;

  // Reject if the dominant signal is a known non-competitor category
  const isExcluded = EXCLUDE_SIGNALS.some(k => t.includes(k));
  if (isExcluded) return false;

  return true;
}

// ── Product inference ─────────────────────────────────────────────────────
function inferProduct(text = '') {
  const t = text.toLowerCase();
  if (t.includes('payroll') || t.includes('salary') || t.includes('wage')) return 'Cross-Border Payroll';
  if (t.includes('remit') || t.includes('money transfer') || t.includes('transfer')) return 'Retail Remittances';
  if (t.includes('africa') || t.includes('kenya') || t.includes('nigeria') || t.includes('ghana') || t.includes('tanzania')) return 'Africa Collect & Remit';
  if (t.includes('fx') || t.includes('foreign exchange') || t.includes('currency')) return 'Corporate FX';
  if (t.includes('payment link') || t.includes('checkout') || t.includes('invoice')) return 'Payment Links';
  return 'Multi-Currency Accounts';
}

// ── Company size normalization ────────────────────────────────────────────
function normalizeSize(raw = '') {
  const n = parseInt(raw.replace(/\D/g, '')) || 0;
  if (n <= 10)  return '1-10';
  if (n <= 50)  return '11-50';
  if (n <= 200) return '51-200';
  if (n <= 500) return '201-500';
  return '500+';
}

// ── Main normalize function ───────────────────────────────────────────────
export function normalize(raw, source) {
  const searchText = [raw.company, raw.description, raw.category].join(' ');
  return {
    company:       (raw.company || '').trim(),
    contact:       (raw.contact || '').trim(),
    email:         (raw.email || '').trim(),
    phone:         (raw.phone || '').trim(),
    stage:         'New Lead',
    value:         0,
    product:       inferProduct(searchText),
    source,
    industry:      (raw.industry || raw.category || 'Fintech').trim(),
    size:          normalizeSize(raw.size || raw.employees || ''),
    notes:         (raw.description || raw.snippet || '').slice(0, 500).trim(),
    created:       today(),
    last_activity: today(),
  };
}
