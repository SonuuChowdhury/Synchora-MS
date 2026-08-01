import createLogger from "../utils/logger.js";

const log = createLogger("DUCKDUCKGO");

/**
 * Free DuckDuckGo Search Fallback
 * Scrapes Instant Answer API when SerpAPI quota is exhausted.
 */
export async function searchDuckDuckGo(query) {
  log.info(`Searching DuckDuckGo for query: "${query}"`);
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`DuckDuckGo API status ${response.status}`);
    }
    const data = await response.json();
    
    let resultsText = "";
    if (data.AbstractText) {
      resultsText += `Abstract: ${data.AbstractText}\n`;
    }
    if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
      const snippets = data.RelatedTopics
        .filter((t) => t.Text)
        .slice(0, 5)
        .map((t) => `• ${t.Text}`)
        .join("\n");
      if (snippets) {
        resultsText += `Topics:\n${snippets}`;
      }
    }

    if (!resultsText.trim()) {
      log.warn("No instant answers returned from DuckDuckGo");
      return null;
    }

    return resultsText.trim();
  } catch (err) {
    log.error("DuckDuckGo search error:", err.message);
    return null;
  }
}
