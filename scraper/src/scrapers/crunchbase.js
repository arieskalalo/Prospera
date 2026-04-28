import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Google News RSS — free, no auth, no JS required
const QUERIES = [
  'UAE fintech payment startup funding',
  'Dubai remittance cross-border payment',
  'MENA payments company raises',
  'Africa corridor payment UAE',
  'UAE cross-border payroll company',
  'Gulf fintech launch 2026',
];

// Extract company name from news headline
const PATTERNS = [
  /^(.+?)\s+raises/i,
  /^(.+?)\s+secures/i,
  /^(.+?)\s+launches/i,
  /^(.+?)\s+expands/i,
  /^(.+?)\s+partners/i,
  /^(.+?)\s+closes\s+\$/i,
  /^(.+?)\s+gets\s+\$/i,
  /^(.+?)\s+lands\s+\$/i,
];

function extractCompany(title = '') {
  for (const p of PATTERNS) {
    const m = title.match(p);
    if (m && m[1]) {
      const name = m[1]
        .replace(/^(UAE|Dubai|Abu Dhabi|Saudi|MENA|Gulf|Meet|Why|How)\s+/i, '')
        .trim();
      if (name.length > 2 && name.length < 60) return name;
    }
  }
  return null;
}

async function fetchGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const { data: xml } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(xml, { xmlMode: true });
  const leads = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text().replace(/ - .*$/, '').trim();
    const desc  = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
    const company = extractCompany(title);
    if (company) {
      leads.push({
        company,
        description: desc.slice(0, 400),
        industry: 'Fintech / Payments',
        _source: 'Google News',
      });
    }
  });

  return leads;
}

export async function runCrunchbase() {
  logger.info('Google News scraper starting');
  const results = [];

  for (const query of QUERIES) {
    try {
      await sleep(1500);
      const found = await fetchGoogleNews(query);
      results.push(...found);
      logger.info(`Google News "${query}": found ${found.length} leads`);
    } catch (err) {
      logger.warn(`Google News query failed "${query}": ${err.message}`);
    }
  }

  logger.info(`Google News scraper total: ${results.length} leads`);
  return results;
}
