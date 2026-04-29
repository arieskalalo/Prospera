/**
 * Cleanup: deletes leads that are not genuinely connected to HubPay's business.
 *
 * Problem with the previous version: every scraped lead has industry="Fintech / Payments"
 * stored in the DB, so isHubpayRelevant() always found "payment" as an activity keyword
 * and passed everything. This version only checks company name + notes (the actual content),
 * not the auto-assigned industry/product fields.
 *
 * Also removes headline fragments that are not real company names.
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── Strict relevance check (company name + notes only) ────────────────────
const HIGH_SIGNAL = [
  'remittance', 'remit', 'money transfer', 'cross-border payment',
  'cross border payment', 'international payment', 'payment corridor',
  'kenya', 'nigeria', 'ghana', 'tanzania', 'ethiopia', 'uganda',
  'africa collect', 'africa remit', 'africa corridor',
  'multi-currency', 'multicurrency', 'corporate fx', 'cross-border payroll',
  'cross border payroll', 'payment link', 'bulk payment',
  'exchange house', 'money service', 'hawala', 'forex bureau',
  'lulu exchange', 'al ansari', 'western union', 'moneygram',
];

const GEO_KEYWORDS = [
  'uae', 'dubai', 'abu dhabi', 'sharjah', 'difc', 'adgm',
  'mena', 'middle east', 'gulf', 'gcc', 'saudi', 'qatar', 'kuwait',
  'oman', 'bahrain', 'jordan', 'egypt', 'pakistan', 'india', 'philippines',
  'sri lanka', 'bangladesh', 'nepal', 'ethiopia', 'uganda', 'senegal',
  'nigeria', 'ghana', 'kenya', 'tanzania', 'africa',
];

// Only payment/FX/remittance activities — NOT generic "fintech" or "financial"
const PAYMENT_KEYWORDS = [
  'payment', 'payments', 'transfer', 'remit', 'payroll', 'salary', 'wage',
  'fx', 'forex', 'currency', 'exchange',
  'wallet', 'disbursement', 'payout', 'neobank', 'digital bank',
  'money exchange', 'money service', 'trade finance',
  'import', 'export', 'freight', 'logistics',
  'staffing', 'recruitment', 'manpower', 'workforce',
];

function isPaymentRelevant(name = '', notes = '') {
  // Only check actual content — not the auto-set industry/product fields
  const t = `${name} ${notes}`.toLowerCase();

  if (HIGH_SIGNAL.some(k => t.includes(k))) return true;

  const hasGeo     = GEO_KEYWORDS.some(k => t.includes(k));
  const hasPayment = PAYMENT_KEYWORDS.some(k => t.includes(k));
  return hasGeo && hasPayment;
}

// ── Headline fragment detection ───────────────────────────────────────────
function isRealCompanyName(name = '') {
  const n = name.trim();
  // More than 7 words → likely a headline, not a company name
  if (n.split(/\s+/).length > 7) return false;
  // Ends with a comma (truncated headline)
  if (n.endsWith(',')) return false;
  // Contains headline punctuation mid-string
  if (/[:]/.test(n)) return false;
  // Looks like a person's full name (Firstname Lastname pattern, 3 capitalised words)
  if (/^[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+$/.test(n)) return false;
  // Is just a place or country name (single word, all caps or well-known places)
  if (/^(India|UAE|Egypt|Pakistan|Africa|Nigeria|Ghana)$/.test(n)) return false;
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const { data: leads, error } = await db
    .from('leads')
    .select('id, company, notes, source');

  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }
  console.log(`Total leads in database: ${leads.length}\n`);

  const toDelete = [];
  const toKeep   = [];

  for (const lead of leads) {
    const nameOk    = isRealCompanyName(lead.company);
    const relevant  = isPaymentRelevant(lead.company, lead.notes || '');

    if (nameOk && relevant) {
      toKeep.push(lead);
    } else {
      toDelete.push({ ...lead, _reason: !nameOk ? 'headline fragment' : 'not payment-related' });
    }
  }

  console.log(`Keeping  (${toKeep.length}):`);
  toKeep.forEach(l => console.log(`  ✓ [${l.id}] ${l.company}`));

  console.log(`\nDeleting (${toDelete.length}):`);
  toDelete.forEach(l => console.log(`  ✗ [${l.id}] ${l.company}  (${l._reason})`));

  if (toDelete.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  const ids = toDelete.map(l => l.id);

  const { error: actErr } = await db.from('activities').delete().in('lead_id', ids);
  if (actErr) { console.error('Activities delete failed:', actErr.message); process.exit(1); }

  const { error: delErr } = await db.from('leads').delete().in('id', ids);
  if (delErr) { console.error('Leads delete failed:', delErr.message); process.exit(1); }

  console.log(`\nDone — deleted ${toDelete.length}, kept ${toKeep.length}.`);
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
