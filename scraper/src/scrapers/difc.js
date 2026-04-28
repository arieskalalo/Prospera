import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runDIFC() {
  logger.info('DIFC scraper starting');
  const results = [];

  // Approach 1: WordPress REST API (DIFC FinTech Hive runs on WordPress)
  try {
    const { data } = await axios.get(
      'https://fintechhive.difc.ae/wp-json/wp/v2/posts?per_page=100&_fields=title,excerpt,categories',
      { headers: HEADERS, timeout: 20000 }
    );
    if (Array.isArray(data) && data.length > 0) {
      data.forEach(post => {
        const name = post.title?.rendered?.replace(/<[^>]+>/g, '').trim();
        const desc = post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim();
        if (name && name.length > 2) {
          results.push({ company: name, description: desc || '', industry: 'Fintech', _source: 'DIFC FinTech Hive' });
        }
      });
      logger.info(`DIFC WP API: found ${results.length} companies`);
      return results;
    }
  } catch (err) {
    logger.warn(`DIFC WP API failed: ${err.message}`);
  }

  // Approach 2: Scrape DIFC companies static page with fintech filter
  await sleep(2000);
  try {
    const pages = [
      'https://www.difc.ae/business/companies/?sector=fintech',
      'https://www.difc.ae/business/companies/?sector=payments',
    ];
    for (const url of pages) {
      const { data: html } = await axios.get(url, { headers: { ...HEADERS, Accept: 'text/html' }, timeout: 20000 });
      const $ = cheerio.load(html);

      // Try multiple selectors
      $('h2, h3, .company-name, .listing-title, [class*="company-title"], [class*="member-name"]').each((_, el) => {
        const name = $(el).text().trim();
        if (name && name.length > 2 && name.length < 80 && !/menu|nav|footer|header/i.test(name)) {
          results.push({ company: name, industry: 'Fintech', _source: 'DIFC Directory' });
        }
      });
      await sleep(1500);
    }
    logger.info(`DIFC static scrape: found ${results.length} companies`);
  } catch (err) {
    logger.warn(`DIFC static scrape failed: ${err.message}`);
  }

  return results;
}
