function buildMarkdownProseClassName(paragraphTextClass: string): string {
  return [
    "space-y-3",
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
    "[&_h1]:mb-3",
    "[&_h1]:mt-6",
    "[&_h1]:text-xl",
    "[&_h1]:font-semibold",
    "[&_h2]:mb-3",
    "[&_h2]:mt-7",
    "[&_h2]:text-lg",
    "[&_h2]:font-semibold",
    "[&_h3]:mb-2",
    "[&_h3]:mt-6",
    "[&_h3]:text-base",
    "[&_h3]:font-semibold",
    "[&_li]:pl-1",
    "[&_li]:whitespace-pre-wrap",
    "[&_li>ol]:mt-2",
    "[&_li>ul]:mt-2",
    "[&_ol]:my-3",
    "[&_ol]:list-decimal",
    "[&_ol]:pl-5",
    "[&_ol]:space-y-2",
    "[&_ol_ol]:my-2",
    "[&_ol_ol]:pl-4",
    "[&_ol_ol]:space-y-1",
    `[&_p]:${paragraphTextClass}`,
    "[&_p]:whitespace-pre-wrap",
    "[&_strong]:font-semibold",
    "[&_ul]:my-3",
    "[&_ul]:list-disc",
    "[&_ul]:pl-5",
    "[&_ul]:space-y-2",
    "[&_ul_ul]:my-2",
    "[&_ul_ul]:pl-4",
    "[&_ul_ul]:space-y-1",
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

type ListType = "ul" | "ol";

type ListTree = {
  type: ListType;
  items: Array<{
    content: string;
    children: ListTree[];
  }>;
};

function parseListMarker(rawLine: string): { indent: number; type: ListType; content: string } | null {
  const match = rawLine.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }

  const [, spacing, marker, content] = match;
  return {
    indent: Math.floor(spacing.length / 2),
    type: /^\d+\.$/.test(marker) ? "ol" : "ul",
    content,
  };
}

function renderListTree(node: ListTree): string {
  const items = node.items
    .map((item) => {
      const children = item.children.map((child) => renderListTree(child)).join("");
      return `<li>${applyInlineMarkdown(item.content)}${children}</li>`;
    })
    .join("");

  return `<${node.type}>${items}</${node.type}>`;
}

export function renderMarkdownToHtml(markdown: string): string {
  const source = escapeHtml(markdown).replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const html: string[] = [];
  let listRoots: ListTree[] = [];
  let listStack: Array<{ indent: number; tree: ListTree }> = [];
  let paragraphLines: string[] = [];

  const flushList = () => {
    if (listRoots.length === 0) {
      listStack = [];
      return;
    }

    html.push(...listRoots.map((tree) => renderListTree(tree)));
    listRoots = [];
    listStack = [];
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

    const listMarker = parseListMarker(rawLine);
    if (listMarker) {
      flushParagraph();
      const targetIndent = Math.max(0, listMarker.indent);

      while (listStack.length > 0 && targetIndent < listStack[listStack.length - 1]!.indent) {
        listStack.pop();
      }

      let current = listStack[listStack.length - 1];
      const needsNewTree =
        !current ||
        current.indent !== targetIndent ||
        current.tree.type !== listMarker.type;

      if (needsNewTree) {
        const tree: ListTree = {
          type: listMarker.type,
          items: [],
        };

        const parent = listStack
          .slice()
          .reverse()
          .find((entry) => entry.indent < targetIndent);
        if (parent && parent.tree.items.length > 0) {
          parent.tree.items[parent.tree.items.length - 1]!.children.push(tree);
        } else {
          listRoots.push(tree);
        }

        listStack = [...listStack.filter((entry) => entry.indent < targetIndent), {
          indent: targetIndent,
          tree,
        }];
        current = listStack[listStack.length - 1];
      }

      current?.tree.items.push({
        content: listMarker.content,
        children: [],
      });
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
