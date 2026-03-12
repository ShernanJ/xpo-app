function buildMarkdownProseClassName(paragraphTextClass: string): string {
  return [
    "space-y-2",
    "text-sm",
    "leading-7",
    "text-zinc-100",
    "[&_a]:text-sky-300",
    "[&_a]:underline",
    "[&_blockquote]:border-l",
    "[&_blockquote]:border-white/20",
    "[&_blockquote]:pl-3",
    "[&_blockquote]:whitespace-pre-wrap",
    "[&_code]:rounded",
    "[&_code]:bg-white/[0.08]",
    "[&_code]:px-1.5",
    "[&_code]:py-0.5",
    "[&_del]:text-zinc-500",
    "[&_h1]:text-xl",
    "[&_h1]:font-semibold",
    "[&_h2]:text-lg",
    "[&_h2]:font-semibold",
    "[&_h3]:text-base",
    "[&_h3]:font-semibold",
    "[&_li]:ml-4",
    "[&_li]:whitespace-pre-wrap",
    "[&_ol]:list-decimal",
    `[&_p]:${paragraphTextClass}`,
    "[&_p]:whitespace-pre-wrap",
    "[&_strong]:font-semibold",
    "[&_ul]:list-disc",
  ].join(" ");
}

export const assistantMarkdownClassName = buildMarkdownProseClassName("text-zinc-100");

export const mutedMarkdownClassName = buildMarkdownProseClassName("text-zinc-200");

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function applyInlineMarkdown(value: string): string {
  return value
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    );
}

export function renderMarkdownToHtml(markdown: string): string {
  const source = escapeHtml(markdown).replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }

    html.push(`<${listType}>${listItems.join("")}</${listType}>`);
    listType = null;
    listItems = [];
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    html.push(`<p>${paragraphLines.join("<br />")}</p>`);
    paragraphLines = [];
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      flushList();
      flushParagraph();
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      flushParagraph();
      const item = applyInlineMarkdown(trimmedLine.replace(/^[-*]\s+/, ""));
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(`<li>${item}</li>`);
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      flushParagraph();
      const item = applyInlineMarkdown(trimmedLine.replace(/^\d+\.\s+/, ""));
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(`<li>${item}</li>`);
      continue;
    }

    flushList();

    if (/^###\s+/.test(trimmedLine)) {
      flushParagraph();
      html.push(`<h3>${applyInlineMarkdown(trimmedLine.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }

    if (/^##\s+/.test(trimmedLine)) {
      flushParagraph();
      html.push(`<h2>${applyInlineMarkdown(trimmedLine.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }

    if (/^#\s+/.test(trimmedLine)) {
      flushParagraph();
      html.push(`<h1>${applyInlineMarkdown(trimmedLine.replace(/^#\s+/, ""))}</h1>`);
      continue;
    }

    if (/^>\s+/.test(trimmedLine)) {
      flushParagraph();
      html.push(
        `<blockquote>${applyInlineMarkdown(trimmedLine.replace(/^>\s+/, ""))}</blockquote>`,
      );
      continue;
    }

    if (/^---+$/.test(trimmedLine)) {
      flushParagraph();
      html.push("<hr />");
      continue;
    }

    paragraphLines.push(applyInlineMarkdown(rawLine));
  }

  flushList();
  flushParagraph();

  return html.join("");
}

export function renderStreamingMarkdownToHtml(markdown: string, visibleLength: number): string {
  const safeVisibleLength = Number.isFinite(visibleLength)
    ? Math.max(0, Math.floor(visibleLength))
    : 0;

  return renderMarkdownToHtml(markdown.slice(0, safeVisibleLength));
}
