import type { UISlide, UIBlock } from "./types";

/** Post-process a final (complete) slide — validates and strips broken blocks */
export function postProcessSlide(slide: UISlide): UISlide {
  return {
    ...slide,
    background: "#ffffff",
    dark: false,
    blocks: slide.blocks
      .filter(b => b && b.props)
      .map(postProcessBlock)
      .filter(isBlockComplete),
  };
}

/** Post-process a streaming partial — keeps incomplete blocks so skeletons show */
export function postProcessPartial(slide: UISlide): UISlide {
  return {
    ...slide,
    background: "#ffffff",
    dark: false,
    blocks: slide.blocks
      .filter(b => b && b.type)
      .map(b => b.props ? postProcessBlock(b) : b),
  };
}

/** Returns false for blocks missing required data (used on final slides only) */
function isBlockComplete(block: UIBlock): boolean {
  const p = block.props;
  if (!p) return false;
  switch (block.type) {
    case "html": case "jsx":    return typeof p.content === "string" && p.content.length > 0;
    case "heading":              return typeof p.text === "string";
    case "text":                 return typeof p.content === "string";
    case "list":                 return Array.isArray(p.items) && (p.items as unknown[]).length > 0;
    case "quiz":                 return typeof p.question === "string" && Array.isArray(p.options);
    case "stats":                return Array.isArray(p.items) && (p.items as unknown[]).length > 0;
    case "chart":                return Array.isArray(p.data) && (p.data as unknown[]).length > 0;
    case "table":                return Array.isArray(p.headers) && Array.isArray(p.rows);
    case "timeline":             return Array.isArray(p.items) && (p.items as unknown[]).length > 0;
    case "progress":             return Array.isArray(p.items) && (p.items as unknown[]).length > 0;
    case "counter":              return typeof p.label === "string";
    case "code":                 return typeof p.code === "string";
    case "quote":                return typeof p.text === "string";
    case "callout":              return typeof p.content === "string";
    case "card":                 return typeof p.title === "string";
    case "image":                return typeof p.src === "string";
    default:                     return true;
  }
}

function postProcessBlock(block: UIBlock): UIBlock {
  let processed = { ...block };
  // Normalize html → jsx; only apply HTML post-processing to legacy html blocks (full documents)
  if (block.type === "html" && typeof block.props.content === "string") {
    processed = { ...processed, type: "jsx", props: { ...processed.props, content: postProcessHtml(block.props.content as string) } };
  } else if (block.type === "jsx" && typeof block.props.content === "string") {
    // jsx blocks are plain body content — don't wrap in a full document.
    // Just fix target="_blank" on external links.
    const content = (block.props.content as string).replace(
      /<a\s+(?![^>]*target=)([^>]*href="https?:\/\/)/gi,
      '<a target="_blank" rel="noopener" $1'
    );
    processed = { ...processed, props: { ...processed.props, content } };
  }
  if (block.children) processed.children = block.children.map(postProcessBlock);
  return processed;
}

function postProcessHtml(html: string): string {
  let r = html;
  if (!r.includes("<!DOCTYPE") && !r.includes("<!doctype")) {
    if (r.includes("<html")) r = "<!DOCTYPE html>\n" + r;
    else r = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"><\/script></head><body>${r}</body></html>`;
  }
  if (!r.includes("cdn.tailwindcss.com") && r.includes("<head")) r = r.replace("</head>", '<script src="https://cdn.tailwindcss.com"><\/script></head>');
  if (r.includes("<head") && !r.includes("viewport")) r = r.replace("<head>", '<head><meta name="viewport" content="width=device-width,initial-scale=1">');
  r = r.replace(/<a\s+(?![^>]*target=)([^>]*href="https?:\/\/)/gi, '<a target="_blank" rel="noopener" $1');
  return r;
}
