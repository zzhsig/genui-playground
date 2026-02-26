// Image search proxy — serves real photos for specific entities.
// Uses Unsplash API if configured, otherwise returns a placeholder.

import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("query");
  if (!query) {
    return new Response("Missing query parameter", { status: 400 });
  }

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;

  if (unsplashKey) {
    try {
      const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=squarish`;
      const res = await fetch(url, {
        headers: { Authorization: `Client-ID ${unsplashKey}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results?.length > 0) {
          const imageUrl = data.results[0].urls.small;
          const imageRes = await fetch(imageUrl);
          return new Response(imageRes.body, {
            headers: {
              "Content-Type":
                imageRes.headers.get("Content-Type") || "image/jpeg",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    } catch {
      // Fall through to placeholder
    }
  }

  // Fallback: placeholder with query text
  const width = 400;
  const height = 300;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#e2e8f0"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#64748b">${escapeXml(query)}</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, 60);
}
