#!/usr/bin/env bun

import pc from "picocolors";

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import type { Root } from "mdast";
import type { Node } from "unist";

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import { visit } from "unist-util-visit";

type Severity = "error" | "warning";

type Diagnostic = {
  file: string;
  offset: number;
  line: number;
  column: number;
  severity: Severity;
  rule: string;
  message: string;
};

type Edit = {
  start: number;
  end: number;
  replacement: string;
  rule: string;
};

type FrontmatterContestIds = {
  title: Set<string>;
  description: Set<string>;
};

type Context = {
  file: string;
  source: string;
  diagnostics: Diagnostic[];
  edits: Edit[];
  fix: boolean;
  frontmatterContestIds: FrontmatterContestIds;
};

type Args = {
  fix: boolean;
  strict: boolean;
  paths: string[];
};

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ["yaml"])
  .use(remarkMath, {
    singleDollarTextMath: true,
  })
  .use(remarkMdx);

const IGNORE_DIRS = new Set([
  ".git",
  ".astro",
  "node_modules",
  "dist",
  "build",
  "coverage",
]);

const ARTICLE_EXTENSIONS = new Set([".md", ".mdx"]);
const MAX_FIX_PASSES = 10;

/**
 * 数式との間に空白を入れない約物。
 *
 * 例:
 *
 *   ここで、$x = 2$ とする。
 *   このとき $x = 0$、$y = 1$ である。
 *   （$N = 1$ の場合）
 */
const NO_SPACE_PUNCTUATION = new Set([
  "、",
  "。",
  "，",
  "．",
  ",",
  ".",
  "！",
  "？",
  "!",
  "?",

  "（",
  "）",
  "(",
  ")",

  "「",
  "」",
  "『",
  "』",

  "【",
  "】",
  "［",
  "］",
  "[",
  "]",

  "〈",
  "〉",
  "《",
  "》",
]);

/**
 * Markdown / MDX の構文上、数式と密着してよいもの。
 *
 * 例:
 *
 *   **$N$**
 *   [$O(N)$](...)
 */
const MARKUP_BOUNDARY = new Set(["*", "_", "~", "<", ">", "{", "}"]);

const JAPANESE_CHAR = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}`;

const COUNT_UNIT_PATTERN = String.raw`(?:人|回|問|位|完|個|本|枚|件|台|日|年|月|時間|分|秒)`;

const COUNT_SUFFIX_PATTERN = new RegExp(
  String.raw`^([ \t\u3000]*)${COUNT_UNIT_PATTERN}`,
  "u",
);

function toHalfwidthAlphanumeric(char: string): string {
  return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
}

function parseArgs(argv: string[]): Args {
  let fix = false;
  let strict = false;
  const paths: string[] = [];

  for (const arg of argv) {
    switch (arg) {
      case "--fix":
        fix = true;
        break;

      case "--strict":
        strict = true;
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);

      default:
        if (arg.startsWith("-")) {
          console.error(`unknown option: ${arg}`);
          process.exit(2);
        }

        paths.push(arg);
        break;
    }
  }

  if (paths.length === 0) {
    console.error(`error: lint target is required

Usage:
  bun run lint:articles -- <file|directory>...
  bun run lint:articles:all`);
    process.exit(2);
  }

  return {
    fix,
    strict,
    paths,
  };
}

function printHelp(): void {
  console.log(`WCPC article style linter

Usage:
  bun scripts/wcpc-lint.ts [options] [file|directory]...

Options:
  --fix       安全に自動修正できる違反を修正する
  --strict    warning が残っている場合も終了コードを 1 にする
  -h, --help  ヘルプを表示する

Examples:
  bun scripts/wcpc-lint.ts src/content
  bun scripts/wcpc-lint.ts --fix src/content
  bun scripts/wcpc-lint.ts --strict src/content
`);
}

function positionFromOffset(
  source: string,
  offset: number,
): {
  line: number;
  column: number;
} {
  let line = 1;
  let column = 1;

  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return {
    line,
    column,
  };
}

function report(
  ctx: Context,
  offset: number,
  severity: Severity,
  rule: string,
  message: string,
): void {
  const { line, column } = positionFromOffset(ctx.source, offset);

  ctx.diagnostics.push({
    file: ctx.file,
    offset,
    line,
    column,
    severity,
    rule,
    message,
  });
}

function addEdit(
  ctx: Context,
  start: number,
  end: number,
  replacement: string,
  rule: string,
): void {
  if (!ctx.fix) {
    return;
  }

  if (start < 0 || end < start || end > ctx.source.length) {
    return;
  }

  if (ctx.source.slice(start, end) === replacement) {
    return;
  }

  ctx.edits.push({
    start,
    end,
    replacement,
    rule,
  });
}

function offsets(node: Node): {
  start: number;
  end: number;
} | null {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;

  if (start == null || end == null) {
    return null;
  }

  return {
    start,
    end,
  };
}

function isHorizontalWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\u3000";
}

function isNoSpaceBoundary(char: string | undefined): boolean {
  if (char == null) {
    return false;
  }

  return NO_SPACE_PUNCTUATION.has(char) || MARKUP_BOUNDARY.has(char);
}

function previousBoundary(
  source: string,
  offset: number,
): {
  whitespaceStart: number;
  char: string | undefined;
} {
  let i = offset;

  while (i > 0 && isHorizontalWhitespace(source[i - 1])) {
    i--;
  }

  return {
    whitespaceStart: i,
    char: i > 0 ? source[i - 1] : undefined,
  };
}

function nextBoundary(
  source: string,
  offset: number,
): {
  whitespaceEnd: number;
  char: string | undefined;
} {
  let i = offset;

  while (i < source.length && isHorizontalWhitespace(source[i])) {
    i++;
  }

  return {
    whitespaceEnd: i,
    char: i < source.length ? source[i] : undefined,
  };
}

function getPlainLabelNumberContext(
  source: string,
  range: { start: number; end: number },
  value: string | undefined,
): {
  start: number;
  end: number;
  replacement: string;
} | null {
  if (value == null || !/^\d+$/u.test(value)) {
    return null;
  }

  const before = source.slice(Math.max(0, range.start - 32), range.start);
  const label = before.match(/(クエリ|ケース|タイプ)[ \t\u3000]*$/u);

  if (label == null) {
    return null;
  }

  const trailingWhitespace = source
    .slice(range.end, range.end + 32)
    .match(/^[ \t\u3000]*/u);

  if (trailingWhitespace == null) {
    return null;
  }

  return {
    start: range.start - label[0].length,
    end: range.end + trailingWhitespace[0].length,
    replacement: `${label[1]}${value}`,
  };
}

function lintInlineMathSpacing(
  ctx: Context,
  node: Node & { value?: string },
): void {
  const range = offsets(node);

  if (range == null) {
    return;
  }

  const { start, end } = range;
  const source = ctx.source;
  const value = node.value?.trim();

  if (getPlainLabelNumberContext(source, range, value) != null) {
    return;
  }

  if (
    value != null &&
    /^\d+(?:\.\d+)?$/u.test(value) &&
    COUNT_SUFFIX_PATTERN.test(source.slice(end, end + 32))
  ) {
    return;
  }

  /*
   * 左側
   */
  const left = previousBoundary(source, start);

  const leftAtLineStart =
    left.whitespaceStart === 0 || source[left.whitespaceStart - 1] === "\n";

  if (!leftAtLineStart && left.char != null) {
    const current = source.slice(left.whitespaceStart, start);

    const expected = isNoSpaceBoundary(left.char) ? "" : " ";

    if (current !== expected) {
      if (expected === "") {
        report(
          ctx,
          start,
          "error",
          "math-spacing-before-punctuation",
          "約物・括弧とインライン数式の間には空白を入れません",
        );
      } else {
        report(
          ctx,
          start,
          "error",
          "math-spacing-before",
          "インライン数式の前には半角空白を1つ入れます",
        );
      }

      addEdit(
        ctx,
        left.whitespaceStart,
        start,
        expected,
        "math-spacing-before",
      );
    }
  }

  /*
   * 右側
   */
  const right = nextBoundary(source, end);

  const rightAtLineEnd =
    right.whitespaceEnd >= source.length ||
    source[right.whitespaceEnd] === "\n";

  if (!rightAtLineEnd && right.char != null) {
    const current = source.slice(end, right.whitespaceEnd);

    const expected = isNoSpaceBoundary(right.char) ? "" : " ";

    if (current !== expected) {
      if (expected === "") {
        report(
          ctx,
          end,
          "error",
          "math-spacing-after-punctuation",
          "インライン数式と約物・括弧の間には空白を入れません",
        );
      } else {
        report(
          ctx,
          end,
          "error",
          "math-spacing-after",
          "インライン数式の後には半角空白を1つ入れます",
        );
      }

      addEdit(ctx, end, right.whitespaceEnd, expected, "math-spacing-after");
    }
  }
}

function lintMathContents(ctx: Context, node: Node & { value?: string }): void {
  const range = offsets(node);
  const value = node.value;

  if (range == null || value == null) {
    return;
  }

  const raw = ctx.source.slice(range.start, range.end);

  let fixed = raw;

  /*
   * Big O
   *
   * WCPC 正規形:
   *
   *   $O(N \log N)$
   *
   * 以下は禁止:
   *
   *   $\mathcal{O}(N)$
   *   $\mathrm{O}(N)$
   */
  if (/\\mathcal\s*\{\s*O\s*\}/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "big-o-mathcal",
      `Big O は \\mathcal{O} ではなく O と書きます`,
    );

    fixed = fixed.replace(/\\mathcal\s*\{\s*O\s*\}/gu, "O");
  }

  if (/\\mathrm\s*\{\s*O\s*\}/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "big-o-mathrm",
      `Big O は \\mathrm{O} ではなく O と書きます`,
    );

    fixed = fixed.replace(/\\mathrm\s*\{\s*O\s*\}/gu, "O");
  }

  if (/\bO[ \t]+\(/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "big-o-space",
      "Big O の O と括弧の間には空白を入れません",
    );

    fixed = fixed.replace(/\bO[ \t]+\(/gu, "O(");
  }

  /*
   * ASCII のプログラム用演算子
   */
  const asciiOperators: Array<{
    pattern: RegExp;
    replacement: string;
    shown: string;
    tex: string;
  }> = [
    {
      pattern: /<=/gu,
      replacement: String.raw`\le`,
      shown: "<=",
      tex: String.raw`\le`,
    },
    {
      pattern: />=/gu,
      replacement: String.raw`\ge`,
      shown: ">=",
      tex: String.raw`\ge`,
    },
    {
      pattern: /!=/gu,
      replacement: String.raw`\neq`,
      shown: "!=",
      tex: String.raw`\neq`,
    },
    {
      pattern: /->/gu,
      replacement: String.raw`\to`,
      shown: "->",
      tex: String.raw`\to`,
    },
  ];

  for (const rule of asciiOperators) {
    rule.pattern.lastIndex = 0;

    if (rule.pattern.test(value)) {
      report(
        ctx,
        range.start,
        "error",
        "math-ascii-operator",
        `数式中の ${rule.shown} は ${rule.tex} と書きます`,
      );

      rule.pattern.lastIndex = 0;

      fixed = fixed.replace(rule.pattern, rule.replacement);
    }
  }

  /*
   * Unicode 数学記号
   */
  const unicodeSymbols = new Map([
    ["≤", String.raw`\le`],
    ["≥", String.raw`\ge`],
    ["≠", String.raw`\neq`],
    ["→", String.raw`\to`],
    ["←", String.raw`\leftarrow`],
    ["∈", String.raw`\in`],
    ["∉", String.raw`\notin`],
    ["⊆", String.raw`\subseteq`],
    ["∞", String.raw`\infty`],
    ["×", String.raw`\times`],
  ]);

  for (const [symbol, replacement] of unicodeSymbols) {
    if (!value.includes(symbol)) {
      continue;
    }

    report(
      ctx,
      range.start,
      "error",
      "math-unicode-symbol",
      `数式中の ${symbol} は ${replacement} と書きます`,
    );

    fixed = fixed.replaceAll(symbol, replacement);
  }

  /*
   * ...
   */
  if (value.includes("...")) {
    report(
      ctx,
      range.start,
      "error",
      "math-ellipsis",
      "数式中の ... は \\ldots などの TeX 記法を使用します",
    );

    fixed = fixed.replaceAll("...", String.raw`\ldots`);
  }

  /*
   * log / min / max / gcd / lcm
   */
  const operatorNames = ["log", "min", "max", "gcd", "lcm"];

  for (const name of operatorNames) {
    const pattern = new RegExp(String.raw`(?<!\\)\b${name}\b`, "gu");

    if (pattern.test(value)) {
      report(
        ctx,
        range.start,
        "error",
        "math-operator-name",
        `数式中の ${name} は \\${name} と書きます`,
      );

      fixed = fixed.replace(pattern, `\\${name}`);
    }
  }

  /*
   * mod は意味によって \bmod / \pmod が変わるため
   * 自動修正しない。
   */
  if (/(?<!\\)\bmod\b/u.test(value)) {
    report(
      ctx,
      range.start,
      "warning",
      "math-mod",
      String.raw`mod は用途に応じて \bmod または \pmod を使用してください`,
    );
  }

  /*
   * 関係演算子の前後。
   *
   * 自動修正はしない。
   * \text{a=b} などまで機械的に変更するのを避けるため。
   */
  const relationSpacingPatterns = [
    /(?<![ \t])=(?!=)/u,
    /=(?![=])(?![ \t])/u,

    /(?<![ \t])\\(?:le|ge|neq|in|notin|subseteq|equiv|to)\b/u,
    /\\(?:le|ge|neq|in|notin|subseteq|equiv|to)\b(?![ \t]|$)/u,
  ];

  if (relationSpacingPatterns.some((pattern) => pattern.test(value))) {
    report(
      ctx,
      range.start,
      "warning",
      "math-relation-spacing",
      "関係演算子の前後は空白を入れてください（例: x = 2, A_i \\le B_i）",
    );
  }

  /*
   * カンマ
   */
  if (/,(?![ \t]|$)/u.test(value)) {
    report(
      ctx,
      range.start,
      "warning",
      "math-comma-spacing",
      "数式中のカンマの後には半角空白を入れてください",
    );
  }

  if (fixed !== raw) {
    addEdit(ctx, range.start, range.end, fixed, "math-syntax");
  }
}

function lintNumericMath(ctx: Context, node: Node & { value?: string }): void {
  const range = offsets(node);
  const value = node.value?.trim();

  if (range == null || value == null || !/^\d+(?:\.\d+)?$/u.test(value)) {
    return;
  }

  const after = ctx.source.slice(
    range.end,
    Math.min(ctx.source.length, range.end + 32),
  );

  /*
   * クエリ$1$
   * ケース $2$
   */
  const plainLabel = getPlainLabelNumberContext(ctx.source, range, value);

  if (plainLabel != null) {
    report(
      ctx,
      range.start,
      "error",
      "plain-label-number",
      "クエリ番号・ケース番号などのラベルはTeXにしません",
    );

    addEdit(
      ctx,
      plainLabel.start,
      plainLabel.end,
      plainLabel.replacement,
      "plain-label-number",
    );

    return;
  }

  /*
   * $3$ 人
   * $2$ 回
   *
   * WCPC規約では通常の数量をTeXにしない。
   */
  const countSuffix = after.match(COUNT_SUFFIX_PATTERN);

  if (countSuffix) {
    report(
      ctx,
      range.start,
      "error",
      "plain-count-number",
      "通常の数量ならTeXにせず、3人・2回のように書きます",
    );

    addEdit(ctx, range.start, range.end, value, "plain-count-number");

    addEdit(
      ctx,
      range.end,
      range.end + countSuffix[1].length,
      "",
      "plain-count-number",
    );
  }
}

function lintText(ctx: Context, node: Node & { value?: string }): void {
  const range = offsets(node);
  const value = node.value;

  if (range == null || value == null) {
    return;
  }

  /*
   * 全角英数字
   */
  if (/[０-９Ａ-Ｚａ-ｚ]/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "fullwidth-alphanumeric",
      "英数字は半角で記述します",
    );

    for (const match of value.matchAll(/[０-９Ａ-Ｚａ-ｚ]/gu)) {
      const start = range.start + match.index;

      addEdit(
        ctx,
        start,
        start + match[0].length,
        toHalfwidthAlphanumeric(match[0]),
        "fullwidth-alphanumeric",
      );
    }
  }

  /*
   * ABC 471 / AHC 069
   */
  if (/\b(?:ABC|ARC|AGC|AHC)\s+\d+\b/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "contest-number-spacing",
      "コンテスト略称と番号の間には空白を入れません（例: ABC471）",
    );

    for (const match of value.matchAll(
      /\b(?:ABC|ARC|AGC|AHC)([ \t]+)\d+\b/gu,
    )) {
      const start = range.start + match.index + match[0].indexOf(match[1]);

      addEdit(
        ctx,
        start,
        start + match[1].length,
        "",
        "contest-number-spacing",
      );
    }
  }

  /*
   * 固有名詞
   */
  if (/\bAtcoder\b/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "proper-name-atcoder",
      "AtCoder の表記を確認してください",
    );

    for (const match of value.matchAll(/\bAtcoder\b/gu)) {
      const start = range.start + match.index;

      addEdit(
        ctx,
        start,
        start + match[0].length,
        "AtCoder",
        "proper-name-atcoder",
      );
    }
  }

  if (/\bCodeForces\b/u.test(value)) {
    report(
      ctx,
      range.start,
      "warning",
      "proper-name-codeforces",
      "Codeforces の表記を確認してください",
    );
  }

  /*
   * 日本語(補足)
   *
   * 関数名や英語の括弧と区別し切れないので
   * warning のみ。
   */
  const japaneseParen = new RegExp(
    `\\([^\\n)]*[${JAPANESE_CHAR}][^\\n)]*\\)`,
    "u",
  );

  if (japaneseParen.test(value)) {
    report(
      ctx,
      range.start,
      "warning",
      "japanese-parentheses",
      "日本語の補足には原則として全角括弧（ ）を使用します",
    );
  }

  /*
   * TeX 外の O(N)
   */
  if (/\bO\s*\([^)\n]+\)/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "big-o-outside-math",
      "計算量はTeXで $O(N)$ のように記述します",
    );

    for (const match of value.matchAll(/\bO\s*\([^)\n]+\)/gu)) {
      const start = range.start + match.index;
      const end = start + match[0].length;

      addEdit(ctx, start, start, "$", "big-o-outside-math");

      addEdit(ctx, end, end, "$", "big-o-outside-math");
    }
  }
}

function collectPlainText(
  node: Node & {
    value?: string;
    children?: Node[];
  },
): string {
  if (node.type === "text" && typeof node.value === "string") {
    return node.value;
  }

  if (!node.children) {
    return "";
  }

  return node.children
    .map((child) =>
      collectPlainText(
        child as Node & {
          value?: string;
          children?: Node[];
        },
      ),
    )
    .join("");
}

function lintLink(
  ctx: Context,
  node: Node & {
    children?: Node[];
  },
): void {
  const range = offsets(node);

  if (range == null) {
    return;
  }

  const text = collectPlainText(node).trim();

  if (text === "ここ" || text === "こちら") {
    report(
      ctx,
      range.start,
      "warning",
      "link-text",
      "リンク先の内容が分かるリンクテキストを使用してください",
    );
  }
}

function lintCodeBlock(
  ctx: Context,
  node: Node & {
    lang?: string | null;
  },
): void {
  const range = offsets(node);

  if (range == null) {
    return;
  }

  if (!node.lang) {
    report(
      ctx,
      range.start,
      "warning",
      "code-block-language",
      "コードブロックには可能な限り言語名を指定してください",
    );
  }
}

function contestIds(value: string): Set<string> {
  const ids = new Set<string>();

  for (const match of value.matchAll(/\b(ABC|ARC|AGC|AHC)\s*(\d+)\b/gu)) {
    ids.add(`${match[1]}${match[2]}`);
  }

  const formalPrefixes = new Map([
    ["Beginner", "ABC"],
    ["Regular", "ARC"],
    ["Grand", "AGC"],
    ["Heuristic", "AHC"],
  ]);

  for (const match of value.matchAll(
    /\bAtCoder\s+(Beginner|Regular|Grand|Heuristic)\s+Contest\s+(\d+)\b/gu,
  )) {
    const prefix = formalPrefixes.get(match[1]);

    if (prefix != null) {
      ids.add(`${prefix}${match[2]}`);
    }
  }

  return ids;
}

function onlyContestId(ids: Set<string>): string | null {
  return ids.size === 1 ? [...ids][0] : null;
}

function addFrontmatterContestIds(
  frontmatterContestIds: FrontmatterContestIds,
  value: string,
): void {
  for (const field of ["title", "description"] as const) {
    const values = value.matchAll(new RegExp(`^${field}:\\s*(.+)$`, "gmu"));

    for (const matched of values) {
      for (const id of contestIds(matched[1])) {
        frontmatterContestIds[field].add(id);
      }
    }
  }
}

function resolveContestId(
  frontmatterContestIds: FrontmatterContestIds,
): string | null {
  const ids = new Set([
    ...frontmatterContestIds.title,
    ...frontmatterContestIds.description,
  ]);

  return onlyContestId(ids);
}

function lintHeading(
  ctx: Context,
  node: Node & {
    depth?: number;
    children?: Node[];
  },
): void {
  const range = offsets(node);

  if (range == null) {
    return;
  }

  const text = collectPlainText(node).trim();

  if (/[。.!！?？]$/u.test(text)) {
    report(
      ctx,
      range.start,
      "warning",
      "heading-punctuation",
      "見出し末尾には句点・終止記号を付けません",
    );
  }

  /*
   * 問題見出しだけは
   *
   *   ### ABC471-A
   *
   * を正規形にする。
   */
  if (/^[A-H]問題$/u.test(text)) {
    report(
      ctx,
      range.start,
      "error",
      "problem-heading",
      "問題見出しは ABC471-A のような形式を使用します",
    );

    const contestId = resolveContestId(ctx.frontmatterContestIds);
    const source = ctx.source.slice(range.start, range.end);
    const textStart = source.indexOf(text);

    if (contestId != null && textStart !== -1) {
      addEdit(
        ctx,
        range.start + textStart,
        range.start + textStart + text.length,
        `${contestId}-${text[0]}`,
        "problem-heading",
      );
    }
  }
}

function lintHeadingLevels(ctx: Context, tree: Root): void {
  let previousDepth = 0;

  visit(tree, "heading", (node) => {
    const heading = node as Node & {
      depth?: number;
    };

    const depth = heading.depth;
    const range = offsets(heading);

    if (depth == null || range == null) {
      return;
    }

    if (previousDepth !== 0 && depth > previousDepth + 1) {
      report(
        ctx,
        range.start,
        "warning",
        "heading-level-jump",
        `見出しレベルが h${previousDepth} から h${depth} に飛んでいます`,
      );
    }

    previousDepth = depth;
  });
}

function lintFrontmatter(ctx: Context, node: Node & { value?: string }): void {
  const range = offsets(node);
  const value = node.value;

  if (range == null || value == null) {
    return;
  }

  /*
   * date:
   */
  const dateLine = value.match(/^date:\s*(.+)$/mu);

  if (dateLine) {
    const raw = dateLine[1].trim().replace(/^["']|["']$/gu, "");

    if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) {
      report(
        ctx,
        range.start,
        "warning",
        "frontmatter-date",
        "Frontmatter の date は YYYY-MM-DD 形式に統一します",
      );
    }
  }

  /*
   * 過去にあった:
   *
   *   ARC224--参加記
   *   ARC--219参加記
   */
  if (/(?:ABC|ARC|AGC|AHC)(?:\d+--+|--+\d+)/u.test(value)) {
    report(
      ctx,
      range.start,
      "error",
      "contest-title-hyphen",
      "コンテスト名と参加記のタイトルに不要な -- が含まれています",
    );

    const raw = ctx.source.slice(range.start, range.end);

    const fixed = raw
      .replace(/\b(ABC|ARC|AGC|AHC)--+(\d+)/gu, "$1$2")
      .replace(/\b((?:ABC|ARC|AGC|AHC)\d+)--+/gu, "$1");

    addEdit(ctx, range.start, range.end, fixed, "contest-title-hyphen");
  }
}

function lintSource(
  file: string,
  source: string,
  fix: boolean,
): {
  diagnostics: Diagnostic[];
  edits: Edit[];
} {
  const ctx: Context = {
    file,
    source,
    diagnostics: [],
    edits: [],
    fix,
    frontmatterContestIds: {
      title: new Set<string>(),
      description: new Set<string>(),
    },
  };

  let tree: Root;

  try {
    tree = parser.parse(source) as Root;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    report(
      ctx,
      0,
      "error",
      "parse-error",
      `Markdown/MDXを解析できません: ${message}`,
    );

    return {
      diagnostics: ctx.diagnostics,
      edits: [],
    };
  }

  visit(tree, "yaml", (node) => {
    const value = (
      node as Node & {
        value?: string;
      }
    ).value;

    if (value != null) {
      addFrontmatterContestIds(ctx.frontmatterContestIds, value);
    }
  });

  visit(tree, (node) => {
    switch (node.type) {
      case "inlineMath":
        lintInlineMathSpacing(ctx, node);
        lintMathContents(
          ctx,
          node as Node & {
            value?: string;
          },
        );
        lintNumericMath(
          ctx,
          node as Node & {
            value?: string;
          },
        );
        break;

      case "math":
        lintMathContents(
          ctx,
          node as Node & {
            value?: string;
          },
        );
        break;

      case "text":
        lintText(
          ctx,
          node as Node & {
            value?: string;
          },
        );
        break;

      case "link":
        lintLink(
          ctx,
          node as Node & {
            children?: Node[];
          },
        );
        break;

      case "code":
        lintCodeBlock(
          ctx,
          node as Node & {
            lang?: string | null;
          },
        );
        break;

      case "heading":
        lintHeading(
          ctx,
          node as Node & {
            depth?: number;
            children?: Node[];
          },
        );
        break;

      case "yaml":
        lintFrontmatter(
          ctx,
          node as Node & {
            value?: string;
          },
        );
        break;
    }
  });

  lintHeadingLevels(ctx, tree);

  return {
    diagnostics: ctx.diagnostics,
    edits: ctx.edits,
  };
}

function normalizeEdits(edits: Edit[]): Edit[] {
  const unique = new Map<string, Edit>();

  for (const edit of edits) {
    const key = `${edit.start}:${edit.end}:${edit.replacement}`;

    unique.set(key, edit);
  }

  const result = [...unique.values()].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );

  let previousEnd = -1;

  for (const edit of result) {
    /*
     * start === previousEnd は隣接なのでOK。
     */
    if (edit.start < previousEnd) {
      throw new Error(`overlapping autofix edits: ${edit.rule}`);
    }

    previousEnd = Math.max(previousEnd, edit.end);
  }

  return result;
}

function applyEdits(source: string, edits: Edit[]): string {
  const normalized = normalizeEdits(edits);

  /*
   * 後ろから適用することでoffsetを維持する。
   *
   * 同じstartなら、範囲置換を先に行い、
   * zero-width insertionを後に行う。
   */
  normalized.sort((a, b) => b.start - a.start || b.end - a.end);

  let result = source;

  for (const edit of normalized) {
    result =
      result.slice(0, edit.start) + edit.replacement + result.slice(edit.end);
  }

  return result;
}

function fixSource(file: string, source: string): string {
  let fixed = source;

  for (let pass = 0; pass < MAX_FIX_PASSES; pass++) {
    const result = lintSource(file, fixed, true);

    if (result.edits.length === 0) {
      return fixed;
    }

    const next = applyEdits(fixed, result.edits);

    if (next === fixed) {
      return fixed;
    }

    fixed = next;
  }

  throw new Error(`autofix did not converge within ${MAX_FIX_PASSES} passes`);
}

function collectFiles(target: string): string[] {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    return ARTICLE_EXTENSIONS.has(path.extname(target).toLowerCase())
      ? [target]
      : [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const files: string[] = [];

  for (const entry of fs.readdirSync(target, {
    withFileTypes: true,
  })) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (
      entry.isFile() &&
      ARTICLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatPath(file: string): string {
  const relative = path.relative(process.cwd(), file);

  return relative || file;
}

function formatSeverity(severity: Severity): string {
  switch (severity) {
    case "error":
      return pc.red(pc.bold("error"));

    case "warning":
      return pc.yellow(pc.bold("warning"));
  }
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  let currentFile: string | null = null;

  for (const diagnostic of diagnostics) {
    const file = formatPath(diagnostic.file);

    if (file !== currentFile) {
      if (currentFile !== null) {
        console.log();
      }

      console.log(pc.cyan(pc.bold(file)));

      currentFile = file;
    }

    const location = `${diagnostic.line}:${diagnostic.column}`;

    const severity = formatSeverity(diagnostic.severity);

    const rule = pc.dim(`[${diagnostic.rule}]`);

    console.log(`  ${pc.dim(location.padStart(7))}  ${severity} ${rule}`);

    console.log(`           ${diagnostic.message}`);

    console.log();
  }
}

function formatSummaryCount(count: number, type: "error" | "warning"): string {
  const text = `${count} ${type}${count === 1 ? "" : "s"}`;

  if (count === 0) {
    return pc.dim(text);
  }

  if (type === "error") {
    return pc.red(pc.bold(text));
  }

  return pc.yellow(pc.bold(text));
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  const files = [
    ...new Set(
      args.paths.flatMap((target) => {
        const resolved = path.resolve(target);

        if (!fs.existsSync(resolved)) {
          console.error(`path not found: ${target}`);
          process.exitCode = 2;
          return [];
        }

        return collectFiles(resolved);
      }),
    ),
  ].sort();

  if (process.exitCode === 2) {
    return;
  }

  let fixedFiles = 0;

  /*
   * --fix
   */
  if (args.fix) {
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");

      let fixed: string;

      try {
        fixed = fixSource(file, source);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error(`internal error: ${message}`);
        process.exitCode = 1;
        return;
      }

      if (fixed !== source) {
        fs.writeFileSync(file, fixed, "utf8");

        fixedFiles++;
      }
    }
  }

  /*
   * 修正後の状態をもう一度lintする。
   *
   * --fixで直った違反は最終結果には表示しない。
   */
  const diagnostics: Diagnostic[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");

    const result = lintSource(file, source, false);

    diagnostics.push(...result.diagnostics);
  }

  diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.offset - b.offset ||
      a.rule.localeCompare(b.rule),
  );

  printDiagnostics(diagnostics);

  const errors = diagnostics.filter((item) => item.severity === "error").length;

  const warnings = diagnostics.filter(
    (item) => item.severity === "warning",
  ).length;

  if (args.fix) {
    const fixedText = `${fixedFiles} file${fixedFiles === 1 ? "" : "s"} fixed`;

    const fixed =
      fixedFiles === 0 ? pc.dim(fixedText) : pc.green(pc.bold(fixedText));

    console.log(fixed);
  }

  console.log(
    [
      pc.dim(`${files.length} file${files.length === 1 ? "" : "s"}`),
      formatSummaryCount(errors, "error"),
      formatSummaryCount(warnings, "warning"),
    ].join(pc.dim("  |  ")),
  );

  if (errors > 0 || (args.strict && warnings > 0)) {
    process.exitCode = 1;
  }
}

main();
