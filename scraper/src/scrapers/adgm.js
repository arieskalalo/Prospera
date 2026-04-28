import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  'Accept': 'text/html, application/json, */*',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function runADGM() {
  logger.info('ADGM scraper starting');
  const results = [];

  // Approach 1: UAE Central Bank licensed payment service providers (public PDF/HTML list)
  try {
    const { data: html } = await axios.get(
      'https://www.centralbank.ae/en/licensed-financial-institutions',
      { headers: HEADERS, timeout: 20000 }
    );
    const $ = cheerio.load(html);

    $('table tbody tr, .institution-row, li').each((_, el) => {
      const text = $(el).text().trim();
      const name = text.split('\n')[0].trim();
      if (name && name.length > 3 && name.length < 80) {
        results.push({ company: name, category: 'Licensed Financial Institution', industry: 'Financial Services', _source: 'UAE Central Bank' });
      }
    });
    logger.info(`UAE Central Bank: found ${results.length} institutions`);
  } catch (err) {
    logger.warn(`UAE Central Bank scrape failed: ${err.message}`);
  }

  await sleep(2000);

  // Approach 2: ADGM public register via their search page (static results)
  try {
    const searchTerms = ['payment', 'fintech', 'remittance', 'exchange'];
    for (const term of searchTerms) {
      const { data: html } = await axios.get(
        `https://www.adgm.com/register/entity-search?name=${encodeURIComponent(term)}&status=Active`,
        { headers: HEADERS, timeout: 20000 }
      );
      const $ = cheerio.load(html);

      // Look for any table rows or list items with company names
      $('table tbody tr').each((_, el) => {
        const cols = $(el).find('td');
        const name = cols.first().text().trim();
        const category = cols.eq(1).text().trim() || 'Financial Services';
        if (name && name.length > 2 && !/name|company|entity/i.test(name)) {
          results.push({ company: name, category, industry: 'Financial Services', _source: 'ADGM Register' });
        }
      });
      await sleep(2000);
    }
    logger.info(`ADGM register: found ${results.length} total entities`);
  } catch (err) {
    logger.warn(`ADGM register scrape failed: ${err.message}`);
  }

  return results;
}
