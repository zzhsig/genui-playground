// Web search implementation.
// Uses Brave Search API if configured, otherwise falls back to DuckDuckGo scraping.

export async function webSearch(query: string): Promise<string> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    return braveSearch(query, braveKey);
  }
  return duckDuckGoSearch(query);
}

async function braveSearch(query: string, apiKey: string): Promise<string> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
  const res = await fetch(url, {
    headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
  });

  if (!res.ok) {
    return `Search failed (${res.status}). Using training data instead.`;
  }

  const data = await res.json();
  const results = (data.web?.results ?? [])
    .slice(0, 5)
    .map(
      (r: { title: string; url: string; description: string }, i: number) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`
    )
    .join("\n\n");

  return results || "No results found.";
}

async function duckDuckGoSearch(query: string): Promise<string> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GenUI/1.0; +https://github.com/genui)",
      },
    });

    if (!res.ok) {
      return `Search unavailable. Proceeding with training data.`;
    }

    const html = await res.text();

    // Extract result snippets from DuckDuckGo HTML
    const results: string[] = [];
    const resultRegex =
      /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      const title = match[1].replace(/<[^>]*>/g, "").trim();
      const snippet = match[2].replace(/<[^>]*>/g, "").trim();
      if (title && snippet) {
        results.push(`${results.length + 1}. ${title}\n   ${snippet}`);
      }
    }

    return results.length > 0
      ? results.join("\n\n")
      : "No results found. Proceeding with training data.";
  } catch {
    return "Search unavailable. Proceeding with training data.";
  }
}
