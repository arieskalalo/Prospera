import pLimit from 'p-limit';
import { db } from './supabase.js';
import { logger } from './utils/logger.js';
import { normalize, isHubpayRelevant } from './utils/normalize.js';
import { getExistingCompanies, isDuplicate } from './utils/dedup.js';
import { runDIFC }       from './scrapers/difc.js';
import { runADGM }       from './scrapers/adgm.js';
import { runNews }       from './scrapers/news.js';
import { runCrunchbase } from './scrapers/crunchbase.js';

const today = () => new Date().toISOString().slice(0, 10);
const limit = pLimit(2); // max 2 scrapers in parallel

async function main() {
  logger.info('=== Prospera scraper job started ===');

  // 0. Test Supabase connection — fail fast if auth is broken
  const { error: connErr } = await db.from('leads').select('id').limit(1);
  if (connErr) { logger.error('Supabase connection failed:', connErr.message); process.exit(1); }
  logger.info('Supabase connection OK');

  // 1. Get existing companies for deduplication
  const existing = await getExistingCompanies();
  logger.info(`Found ${existing.size} existing leads in database`);

  // 2. Run all scrapers (2 at a time max to stay within memory limits)
  const scraperJobs = [
    () => runDIFC(),
    () => runADGM(),
    () => runNews(),
    () => runCrunchbase(),
  ];

  const rawResults = await Promise.allSettled(
    scraperJobs.map(job => limit(job))
  );

  // 3. Collect all raw results
  const allRaw = [];
  rawResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allRaw.push(...(result.value || []));
    } else {
      logger.warn(`Scraper ${i} rejected: ${result.reason}`);
    }
  });

  logger.info(`Total raw results from all scrapers: ${allRaw.length}`);

  // 4. Normalize, filter for HubPay relevance, and deduplicate
  const seen = new Set();
  const toInsert = [];
  let filteredOut = 0;

  for (const raw of allRaw) {
    if (!raw.company || raw.company.length < 2) continue;

    // Only keep leads relevant to HubPay's business
    const searchText = [raw.company, raw.description, raw.category, raw.industry].join(' ');
    if (!isHubpayRelevant(searchText)) { filteredOut++; continue; }

    const lead = normalize(raw, raw._source || 'Web Scraper');

    // Skip if already in DB or seen in this batch
    if (isDuplicate(lead.company, existing)) continue;
    if (seen.has(lead.company.toLowerCase().trim())) continue;

    seen.add(lead.company.toLowerCase().trim());
    toInsert.push(lead);
  }

  logger.info(`Raw: ${allRaw.length} | Relevant: ${toInsert.length + filteredOut} | Filtered out: ${filteredOut} | After dedup: ${toInsert.length}`);

  // 5. Insert into Supabase in batches of 50
  if (toInsert.length === 0) {
    logger.info('No new leads found today — done.');
    return;
  }

  const BATCH = 50;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const { data: rows, error } = await db.from('leads').insert(batch).select('id');

    if (error) {
      logger.error(`Insert batch failed: ${error.message}`);
      continue;
    }

    // Insert initial activity for each inserted lead
    if (rows?.length) {
      const activities = rows.map(r => ({
        lead_id: r.id,
        date: today(),
        type: 'Note',
        text: 'Lead auto-added by daily scraper.',
      }));
      await db.from('activities').insert(activities);
      inserted += rows.length;
    }
  }

  logger.info(`=== Job complete: inserted ${inserted} new leads ===`);
}

main().catch(err => {
  logger.error('Fatal error:', err.message);
  process.exit(1);
});
