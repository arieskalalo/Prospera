const today = () => new Date().toISOString().slice(0, 10);

// ── HubPay relevance keywords ─────────────────────────────────────────────
// A lead is relevant if it matches at least one keyword from EACH group below,
// OR matches any keyword in the HIGH_SIGNAL list (strong standalone signals).

const HIGH_SIGNAL = [
  // Payments & remittance
  'remittance', 'remit', 'money transfer', 'cross-border payment',
  'cross border payment', 'international payment', 'payment corridor',
  // Africa corridors HubPay serves
  'kenya', 'nigeria', 'ghana', 'tanzania', 'ethiopia', 'uganda',
  'africa collect', 'africa remit', 'africa corridor',
  // HubPay products
  'multi-currency', 'multicurrency', 'corporate fx', 'cross-border payroll',
  'cross border payroll', 'payment link', 'bulk payment',
  // UAE exchange / money service
  'exchange house', 'money service', 'hawala', 'forex bureau',
];

const GEO_KEYWORDS = [
  'uae', 'dubai', 'abu dhabi', 'sharjah', 'difc', 'adgm',
  'mena', 'middle east', 'gulf', 'gcc', 'saudi', 'qatar', 'kuwait',
];

const ACTIVITY_KEYWORDS = [
  'payment', 'transfer', 'remit', 'payroll', 'salary', 'wage',
  'fx', 'forex', 'currency', 'exchange', 'banking', 'fintech',
  'financial', 'wallet', 'disbursement', 'payout', 'collect',
  'trade finance', 'import', 'export', 'freight', 'logistics',
  'staffing', 'recruitment', 'manpower', 'workforce',
];

export function isHubpayRelevant(text = '') {
  const t = text.toLowerCase();

  // High-signal keywords alone are enough
  if (HIGH_SIGNAL.some(k => t.includes(k))) return true;

  // Otherwise needs both a geo AND an activity keyword
  const hasGeo      = GEO_KEYWORDS.some(k => t.includes(k));
  const hasActivity = ACTIVITY_KEYWORDS.some(k => t.includes(k));
  return hasGeo && hasActivity;
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
  const searchText = [raw.company, raw.description, raw.category, raw.industry].join(' ');
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
