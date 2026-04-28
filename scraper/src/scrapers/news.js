import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import { isHubpayRelevant } from '../utils/normalize.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// RSS feeds covering UAE / MENA payments & fintech
const FEEDS = [
  { url: 'https://wamda.com/feed',                           source: 'Wamda' },
  { url: 'https://www.arabianbusiness.com/rss',              source: 'Arabian Business' },
  { url: 'https://gulfnews.com/rss/business',                source: 'Gulf News' },
  { url: 'https://www.thenationalnews.com/rss/business.rss', source: 'The National' },
  { url: 'https://menabytes.com/feed/',                      source: 'MENAbytes' },
  { url: 'https://www.khaleejtimes.com/business/rss',        source: 'Khaleej Times' },
];

// Extract company name from headline patterns
const FUNDING_PATTERNS = [
  /^(.+?)\s+raises/i,
  /^(.+?)\s+secures/i,
  /^(.+?)\s+closes\s+\$[\d]/i,
  /^(.+?)\s+launches/i,
  /^(.+?)\s+expands\s+(?:into|to)\s+UAE/i,
  /UAE[''s]*\s+(.+?)\s+raises/i,
  /Dubai[''s]*\s+(.+?)\s+raises/i,
  /^(.+?)\s+partners\s+with/i,
  /^(.+?)\s+signs\s+deal/i,
];

function extractCompanyFromTitle(title = '') {
  for (const pattern of FUNDING_PATTERNS) {
    const m = title.match(pattern);
    if (m && m[1]) {
      const name = m[1].replace(/^(UAE|Dubai|Abu Dhabi|MENA|Gulf)\s+/i, '').trim();
      if (name.length > 2 && name.length < 60) return name;
    }
  }
  return null;
}

async function parseFeed(feedUrl, source) {
  const { data: xml } = await axios.get(feedUrl, { headers: HEADERS, timeout: 15000 });
  const $ = cheerio.load(xml, { xmlMode: true });
  const leads = [];

  $('item').each((_, el) => {
    const title = $(el).find('title').text();
    const desc  = $(el).find('description').text().replace(/<[^>]+>/g, '').trim();
    const combined = `${title} ${desc}`;

    // Only keep items relevant to HubPay's business
    if (!isHubpayRelevant(combined)) return;

    const company = extractCompanyFromTitle(title);
    if (!company) return;

    leads.push({
      company,
      description: desc.slice(0, 400),
      industry: 'Fintech / Payments',
      _source: source,
    });
  });

  return leads;
}

export async function runNews() {
  logger.info('News scraper starting');
  const results = [];

  for (const feed of FEEDS) {
    try {
      await sleep(1500);
      const leads = await parseFeed(feed.url, feed.source);
      results.push(...leads);
      logger.info(`${feed.source}: found ${leads.length} HubPay-relevant leads`);
    } catch (err) {
      logger.warn(`${feed.source} feed failed: ${err.message}`);
    }
  }

  logger.info(`News scraper total: ${results.length} leads`);
  return results;
}
