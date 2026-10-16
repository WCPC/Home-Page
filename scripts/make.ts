import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  fetchContestAutoData,
  formatProblemResultTime,
  type ContestAutoData,
  type WcpcMember,
} from "./atcoder";

const args = process.argv.slice(2);
const usage = [
  "使い方:",
  "  bun run make <directory>",
  "  bun run make <directory> --contest <contest-id>",
  "",
  "例:",
  "  bun run make abc476-log --contest abc476",
].join("\n");

if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(usage);
  process.exit(0);
}

const directory = args[0];
if (!directory || basename(directory) !== directory || directory === "." || directory.startsWith("-")) {
  console.error(usage);
  process.exit(1);
}

let contestId: string | undefined;
for (let i = 1; i < args.length; i += 1) {
  if (args[i] === "--contest") {
    contestId = args[i + 1];
    i += 1;
    continue;
  }
  console.error(`不明な引数です: ${args[i]}\n${usage}`);
  process.exit(1);
}

const activitiesDirectory = join(import.meta.dir, "../src/content/activities");
const articleDirectory = join(activitiesDirectory, directory);
const articlePath = join(articleDirectory, "index.mdx");
if (existsSync(articleDirectory)) {
  console.error(`既に存在します: ${articleDirectory}`);
  process.exit(1);
}

function formatJstDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function collapseBlankLines(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n(?:[ \t]*\n){2,}/g, "\n\n");
}

function loadMembers(): WcpcMember[] {
  const path = join(import.meta.dir, "wcpc-members.json");
  if (!existsSync(path)) {
    throw new Error(
      "scripts/wcpc-members.json がありません。wcpc-members.example.json をコピーしてAtCoder IDを登録してください。",
    );
  }
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("scripts/wcpc-members.json に1人以上登録してください。");
  }
  return parsed.map((value) => {
    if (!value || typeof value !== "object" || typeof (value as WcpcMember).atcoderId !== "string") {
      throw new Error("wcpc-members.json の形式が不正です。");
    }
    return value as WcpcMember;
  });
}

function blankProblemSection(index: string): string {
  return `### ${index}問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**

**制約**

**入力**

**出力**

</div>

</details>`;
}

function renderAutoArticle(data: ContestAutoData): string {
  const contestDate = formatJstDate(
    new Date(data.contest.start_epoch_second * 1000),
  );
  const rows = data.problems
    .map((problem) => {
      const result = data.fastestByProblem.get(problem.problem_id);
      if (!result) return `| ${problem.problem_index} | - | - | - |`;
      return `| ${problem.problem_index} | ${result.displayName} | ${formatProblemResultTime(result)} | ${result.language} |`;
    })
    .join("\n");

  const statements = data.problems
    .map((problem) => {
      const statement = data.statements.get(problem.problem_id) ?? "問題文の取得に失敗しました。";
      const problemUrl = `https://atcoder.jp/contests/${data.contest.id}/tasks/${problem.problem_id}`;
      return `### ${data.contest.id.toUpperCase()}-${problem.problem_index}

[問題ページ](${problemUrl})

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

${statement}

</div>

</details>`;
    })
    .join("\n\n");

  return `---
title: "${data.contest.id.toUpperCase()}参加記"
date: ${contestDate}
draft: true
author: "著者名"
tags: ["AtCoder"]
description: "AtCoderに参加した所感など"
---

[前回の参加記()](/activities/)

## はじめに



## 結果サマリ

- [${data.contest.id.toUpperCase()}](https://atcoder.jp/contests/${data.contest.id})
- WCPC参加人数: **${data.participantCount}人**
- 各問題の最速解答者（実AC時刻）:

| 問題 | 参加者名 | タイム | 言語 |
| :--- | :------- | :----- | :--- |
${rows}

## 今週の出題

${statements}

## 最後に
`;
}

function renderBlankArticle(): string {
  const sections = ["A", "B", "C", "D", "E", "F", "G"].map(blankProblemSection).join("\n\n");
  return `---
title: "記事タイトル"
date: ${formatJstDate(new Date())}
draft: true
author: "著者名"
tags: []
description: "記事の概要"
---

[前回の参加記()](/activities/)

## はじめに



## 結果サマリ

- [コンテスト名](https://atcoder.jp/contests/)
- WCPC参加人数: **人**
- 各問題の最速解答者（ペナルティ込み）:

| 問題 | 参加者名 | タイム | 言語 |
| :--- | :------- | :----- | :--- |
| A | - | - | - |
| B | - | - | - |
| C | - | - | - |
| D | - | - | - |
| E | - | - | - |
| F | - | - | - |
| G | - | - | - |

## 今週の出題

${sections}

## 最後に
`;
}

let template: string;
if (contestId) {
  console.log(`${contestId} の提出・問題文を取得しています...`);
  template = renderAutoArticle(await fetchContestAutoData(contestId, loadMembers()));
} else {
  template = renderBlankArticle();
}

template = collapseBlankLines(template);

mkdirSync(articleDirectory);
mkdirSync(join(articleDirectory, "images"));
writeFileSync(articlePath, template);
console.log(`作成しました: ${articlePath}`);
console.log(`画像directory: ${join(articleDirectory, "images")}`);
