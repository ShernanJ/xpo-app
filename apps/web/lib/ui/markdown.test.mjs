import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdownToHtml } from "./markdown.ts";

test("markdown renderer preserves headings, lists, links, and emphasis", () => {
  const html = renderMarkdownToHtml(`# heading

- first item
- second item

paragraph with **bold** and [link](https://example.com)`);

  assert.equal(html.includes("<h1>heading</h1>"), true);
  assert.equal(html.includes("<ul><li>first item</li><li>second item</li></ul>"), true);
  assert.equal(html.includes("<strong>bold</strong>"), true);
  assert.equal(html.includes('href="https://example.com"'), true);
});

test("markdown renderer escapes raw html", () => {
  const html = renderMarkdownToHtml("<script>alert('x')</script>");

  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("&lt;script&gt;alert"), true);
});

test("markdown renderer keeps soft line breaks inside the same paragraph", () => {
  const html = renderMarkdownToHtml(`first line
second line
third line`);

  assert.equal(
    html,
    "<p>first line<br />second line<br />third line</p>",
  );
});

test("markdown renderer preserves ordered lists and thread-style spacing", () => {
  const html = renderMarkdownToHtml(`1. hook
2. proof
3. close

tweet 1
tweet 2`);

  assert.equal(html.includes("<ol><li>hook</li><li>proof</li><li>close</li></ol>"), true);
  assert.equal(html.includes("<p>tweet 1<br />tweet 2</p>"), true);
});
