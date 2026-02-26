// AI image generation proxy — generates creative/conceptual images.
// Uses OpenAI DALL-E if configured, otherwise returns a styled placeholder.

import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const prompt = req.nextUrl.searchParams.get("prompt");
  const aspect = req.nextUrl.searchParams.get("aspect") || "1:1";
  if (!prompt) {
    return new Response("Missing prompt parameter", { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) {
    try {
      const sizeMap: Record<string, string> = {
        "1:1": "1024x1024",
        "3:4": "1024x1792",
        "4:3": "1792x1024",
        "9:16": "1024x1792",
        "16:9": "1792x1024",
      };
      const size = sizeMap[aspect] || "1024x1024";

      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt,
          n: 1,
          size,
          quality: "standard",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const imageUrl = data.data?.[0]?.url;
        if (imageUrl) {
          const imageRes = await fetch(imageUrl);
          return new Response(imageRes.body, {
            headers: {
              "Content-Type":
                imageRes.headers.get("Content-Type") || "image/png",
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      }
    } catch {
      // Fall through to placeholder
    }
  }

  // Fallback: clean neutral placeholder
  const [w, h] = aspectToSize(aspect);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="#f3f4f6"/>
    <rect x="${w/2-20}" y="${h/2-24}" width="40" height="40" rx="8" fill="#d1d5db"/>
    <path d="M${w/2-8} ${h/2-8} l6 8 4-4 6 8h-22z" fill="#9ca3af"/>
    <circle cx="${w/2+8}" cy="${h/2-10}" r="4" fill="#9ca3af"/>
    <text x="50%" y="${h/2+28}" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#9ca3af">${escapeXml(prompt)}</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

function aspectToSize(aspect: string): [number, number] {
  const map: Record<string, [number, number]> = {
    "1:1": [400, 400],
    "3:4": [300, 400],
    "4:3": [400, 300],
    "9:16": [270, 480],
    "16:9": [480, 270],
  };
  return map[aspect] || [400, 400];
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .slice(0, 80);
}
