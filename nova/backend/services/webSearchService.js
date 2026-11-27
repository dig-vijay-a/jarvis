import https from 'https';
import tls from 'tls';
import axios from 'axios';
import * as cheerio from 'cheerio';

const systemCaAgent = typeof tls.getCACertificates === 'function'
  ? new https.Agent({ ca: [...tls.rootCertificates, ...tls.getCACertificates('system')] })
  : undefined;

export class WebSearchService {
  /**
   * Searches live external web sources with real HTTP parsing, bounded retries, and
   * structured diagnostics. Never fabricates synthetic/placeholder results when offline
   * or when providers return 0 matches.
   */
  static async searchWithDiagnostics(query, limit = 5, options = {}) {
    const t0 = Date.now();
    const cleanQuery = String(query || '').replace(/\s+/g, ' ').trim();
    if (!cleanQuery) {
      return {
        ok: true,
        query: cleanQuery,
        results: [],
        empty: true,
        networkError: null,
        providersAttempted: [],
        providerErrors: [],
        durationMs: 0
      };
    }

    const timeoutMs = Number(options.timeoutMs) || 8000;
    const wikiApiUrl = options.wikiApiUrl || 'https://en.wikipedia.org/w/api.php';
    const wikiRestUrl = options.wikiRestUrl || 'https://en.wikipedia.org/w/rest.php/v1/search/page';
    const ddgHtmlUrl = options.ddgHtmlUrl || 'https://html.duckduckgo.com/html/';
    const ddgApiUrl = options.ddgApiUrl || 'https://api.duckduckgo.com/';

    const stopWords = new Set(['research', 'how', 'and', 'the', 'for', 'with', 'using', 'available', 'tools', 'create', 'cited', 'report', 'write', 'compare', 'comparing', 'preserve', 'uncertainty', 'latency', 'handles', 'behavior', 'architecture', 'vs', 'versus', 'cold-start', 'cold', 'start']);
    const rawWords = cleanQuery
      .replace(/['"][^'"]*['"]/g, ' ')
      .replace(/C:\/[^\s]+/gi, ' ')
      .replace(/[^\w/\-+. ]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1 && !stopWords.has(w.toLowerCase()));

    const wikiQueries = [
      cleanQuery,
      rawWords.slice(0, 3).join(' '),
      rawWords.slice(0, 2).join(' ')
    ].filter((q, idx, arr) => q && arr.indexOf(q) === idx);

    const providerErrors = [];
    let networkSuccessCount = 0;

    const retryGet = async (url, config, label) => {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await axios.get(url, config);
        } catch (err) {
          lastErr = err;
          const retryable = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'EAI_AGAIN' || (err.response?.status >= 500);
          if (!retryable || attempt === 1) break;
          await new Promise(r => setTimeout(r, 400));
        }
      }
      providerErrors.push(`${label}: ${lastErr?.message || 'Request failed'}`);
      throw lastErr;
    };

    const wikiApiPromise = (async () => {
      const out = [];
      for (const wq of wikiQueries) {
        if (out.length >= limit) break;
        try {
          const wikiRes = await retryGet(wikiApiUrl, {
            params: { action: 'query', list: 'search', srsearch: wq, format: 'json', srlimit: Math.max(3, limit) },
            headers: { 'User-Agent': 'JARVIS-OS/2.0 (Local-AI-Research; localhost)' },
            httpsAgent: systemCaAgent,
            timeout: timeoutMs
          }, 'wikipedia_api');
          networkSuccessCount++;
          for (const hit of (wikiRes.data?.query?.search || [])) {
            if (out.length >= limit) break;
            const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g, '_'))}`;
            const snippetText = cheerio.load(`<span>${hit.snippet || ''}</span>`).text().trim();
            out.push({ title: hit.title, url: pageUrl, snippet: snippetText || `Wikipedia article on ${hit.title}`, source: 'wikipedia_api' });
          }
          if (out.length > 0) break;
        } catch (_) {}
      }
      return out;
    })();

    const ddgApiPromise = (async () => {
      const out = [];
      try {
        const ddgApi = await retryGet(ddgApiUrl, {
          params: { q: rawWords.slice(0, 4).join(' ') || cleanQuery, format: 'json', no_html: 1, skip_disambig: 1 },
          headers: { 'User-Agent': 'JARVIS-OS/2.0' },
          httpsAgent: systemCaAgent,
          timeout: timeoutMs
        }, 'duckduckgo_instant_api');
        networkSuccessCount++;
        const d = ddgApi.data || {};
        if (d.AbstractText && d.AbstractURL) {
          out.push({ title: d.Heading || cleanQuery, url: d.AbstractURL, snippet: d.AbstractText, source: 'duckduckgo_instant_api' });
        }
        for (const rt of (d.RelatedTopics || [])) {
          if (out.length >= limit) break;
          if (rt?.Text && rt?.FirstURL) {
            out.push({ title: rt.Text.split(' - ')[0].slice(0, 90), url: rt.FirstURL, snippet: rt.Text, source: 'duckduckgo_instant_api' });
          }
        }
      } catch (_) {}
      return out;
    })();

    const ddgHtmlPromise = (async () => {
      const out = [];
      try {
        const response = await axios.get(ddgHtmlUrl, {
          params: { q: cleanQuery },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          httpsAgent: systemCaAgent,
          timeout: timeoutMs
        });
        networkSuccessCount++;
        const htmlBody = String(response.data || '');
        if (/anomaly-modal|Unfortunately, bots use DuckDuckGo/i.test(htmlBody)) {
          providerErrors.push('duckduckgo_html: bot challenge returned');
          return out;
        }
        const $ = cheerio.load(htmlBody);
        $('.result, .web-result').each((i, el) => {
          if (out.length >= limit) return false;
          const title = $(el).find('.result__title a, .result__a').first().text().trim();
          let link = $(el).find('.result__title a, .result__a').first().attr('href') || '';
          const snippet = $(el).find('.result__snippet').first().text().trim();
          if (link.includes('uddg=')) {
            const match = link.match(/uddg=([^&]+)/);
            if (match && match[1]) link = decodeURIComponent(match[1]);
          }
          if (title && snippet && link && link.startsWith('http')) {
            out.push({ title, url: link, snippet, source: 'duckduckgo_html' });
          }
        });
      } catch (err) {
        providerErrors.push(`duckduckgo_html: ${err.message}`);
      }
      return out;
    })();

    const [wikiHits, ddgApiHits, ddgHtmlHits] = await Promise.all([wikiApiPromise, ddgApiPromise, ddgHtmlPromise]);

    const combined = [];
    for (const item of [...ddgHtmlHits, ...ddgApiHits, ...wikiHits]) {
      if (combined.length >= limit) break;
      if (item?.url && !combined.some(x => x.url === item.url)) combined.push(item);
    }

    // Secondary Wikipedia REST fallback if primary sources yielded 0 hits
    if (combined.length === 0) {
      try {
        const restRes = await retryGet(wikiRestUrl, {
          params: { q: rawWords.slice(0, 3).join(' ') || cleanQuery, limit: Math.max(3, limit) },
          headers: { 'User-Agent': 'JARVIS-OS/2.0 (Local-AI-Research; localhost)' },
          httpsAgent: systemCaAgent,
          timeout: timeoutMs
        }, 'wikipedia_rest');
        networkSuccessCount++;
        for (const page of (restRes.data?.pages || [])) {
          if (combined.length >= limit) break;
          const key = page.key || (page.title || '').replace(/ /g, '_');
          if (!key) continue;
          const desc = page.description || cheerio.load(`<span>${page.excerpt || ''}</span>`).text().trim();
          combined.push({
            title: page.title || key,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(key)}`,
            snippet: desc || `Wikipedia article on ${page.title || key}`,
            source: 'wikipedia_rest'
          });
        }
      } catch (_) {}
    }

    const allNetworkFailed = networkSuccessCount === 0 && providerErrors.length > 0;
    return {
      ok: combined.length > 0 || !allNetworkFailed,
      query: cleanQuery,
      results: combined,
      empty: combined.length === 0 && !allNetworkFailed,
      networkError: allNetworkFailed ? providerErrors.join(' | ') : null,
      providersAttempted: ['wikipedia_api', 'duckduckgo_instant_api', 'duckduckgo_html', 'wikipedia_rest'],
      providerErrors,
      durationMs: Date.now() - t0
    };
  }

  /**
   * Searches live external web sources and returns matching hit objects (empty array on 0 matches or failure).
   */
  static async search(query, limit = 5, options = {}) {
    const diag = await this.searchWithDiagnostics(query, limit, options);
    if (diag.networkError) {
      console.warn('[WebSearchService] All external search providers failed:', diag.networkError);
    }
    return diag.results;
  }

  /**
   * Extracts clean readable text from an article URL
   */
  static async extractArticleContent(url, maxChars = 4000) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        httpsAgent: systemCaAgent,
        timeout: 8000
      });

      const $ = cheerio.load(response.data);
      $('script, style, nav, footer, header, noscript, svg, form').remove();

      const paragraphs = [];
      $('article p, main p, p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 40) {
          paragraphs.push(text);
        }
      });

      const fullText = paragraphs.join('\n\n');
      return {
        url,
        title: $('title').text().trim() || 'Article Source',
        content: fullText.slice(0, maxChars) || 'No article text extracted.',
        length: fullText.length
      };
    } catch (err) {
      return {
        url,
        title: 'Source link',
        content: `Could not retrieve live page content (${err.message}). Using search snippet.`,
        length: 0
      };
    }
  }

  /**
   * Conducts comprehensive web research on a topic without fabricating sources on failure.
   */
  static async conductResearch({ topic, depth = 'standard' }) {
    const diag = await this.searchWithDiagnostics(topic, depth === 'deep' ? 6 : 4);
    const searchResults = diag.results;

    const detailedSources = [];
    if (depth === 'deep' && searchResults.length > 0) {
      for (const res of searchResults.slice(0, 2)) {
        if (res.url.startsWith('http')) {
          const article = await this.extractArticleContent(res.url, 2500);
          detailedSources.push({
            title: res.title,
            url: res.url,
            content: article.content
          });
        }
      }
    }

    return {
      topic,
      depth,
      timestamp: new Date().toISOString(),
      ok: diag.ok,
      networkError: diag.networkError,
      sources: searchResults,
      extractedContent: detailedSources,
      providerErrors: diag.providerErrors
    };
  }
}

export default WebSearchService;
