import type { UISlide, UIBlock } from "./types";

export function postProcessSlide(slide: UISlide): UISlide {
  return { ...slide, blocks: slide.blocks.map(postProcessBlock) };
}

function postProcessBlock(block: UIBlock): UIBlock {
  let processed = { ...block };
  if (block.type === "html" && typeof block.props.content === "string") {
    processed = { ...processed, props: { ...processed.props, content: postProcessHtml(block.props.content as string) } };
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
