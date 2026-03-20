import test from "node:test";
import assert from "node:assert/strict";

import {
  assistantMarkdownClassName,
  renderMarkdownToHtml,
  renderStreamingMarkdownToHtml,
} from "./markdown.ts";

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

test("markdown renderer preserves one level of nested unordered and ordered lists", () => {
  const html = renderMarkdownToHtml(`- Lead signal
  - Evidence one
  - Evidence two
1. Fix the bio
   - Make the audience explicit
   - Add proof`);

  assert.equal(
    html.includes("<ul><li>Lead signal<ul><li>Evidence one</li><li>Evidence two</li></ul></li></ul>"),
    true,
  );
  assert.equal(
    html.includes("<ol><li>Fix the bio<ul><li>Make the audience explicit</li><li>Add proof</li></ul></li></ol>"),
    true,
  );
});

test("streaming markdown renderer preserves formatting before completion", () => {
  const html = renderStreamingMarkdownToHtml(`- first item
- second item

next line`, 31);

  assert.equal(html.includes("<ul><li>first item</li><li>second item</li></ul>"), true);
  assert.equal(html.includes("<p>nex</p>"), true);
});

test("markdown renderer preserves link-heavy replies with ordered follow-ups", () => {
  const html = renderMarkdownToHtml(`Use [docs](https://example.com/docs) and [pricing](https://example.com/pricing).

1. Open the docs
2. Compare the plan

Then send the link back.`);

  assert.equal(
    html.includes(
      '<p>Use <a href="https://example.com/docs" target="_blank" rel="noreferrer noopener">docs</a> and <a href="https://example.com/pricing" target="_blank" rel="noreferrer noopener">pricing</a>.</p>',
    ),
    true,
  );
  assert.equal(html.includes("<ol><li>Open the docs</li><li>Compare the plan</li></ol>"), true);
  assert.equal(html.includes("<p>Then send the link back.</p>"), true);
});

test("assistant markdown classes add readable section rhythm and list indentation", () => {
  assert.equal(assistantMarkdownClassName.includes("[&_h2]:mt-7"), true);
  assert.equal(assistantMarkdownClassName.includes("[&_ul]:pl-5"), true);
  assert.equal(assistantMarkdownClassName.includes("[&_ol]:pl-5"), true);
  assert.equal(assistantMarkdownClassName.includes("[&_ul]:space-y-2"), true);
  assert.equal(assistantMarkdownClassName.includes("[&_ul_ul]:pl-4"), true);
  assert.equal(assistantMarkdownClassName.includes("[&_li>ul]:mt-2"), true);
});
