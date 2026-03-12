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
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>',
    )
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
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
