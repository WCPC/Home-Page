import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const usage = "使い方: bun run make <directory> [--images]";

if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
  console.log(usage);
  process.exit(0);
}

const directories = args.filter((arg) => !arg.startsWith("-"));
const options = args.filter((arg) => arg.startsWith("-"));
const hasImages = options.includes("--images");

if (directories.length !== 1 || options.length !== (hasImages ? 1 : 0)) {
  console.error(usage);
  process.exit(1);
}

const [directory] = directories;

if (basename(directory) !== directory || directory === ".") {
  console.error("ディレクトリ名のみを指定してください。");
  process.exit(1);
}

const activitiesDirectory = join(import.meta.dir, "../src/content/activities");
const articleDirectory = join(activitiesDirectory, directory);
const articlePath = join(articleDirectory, "index.mdx");

if (existsSync(articleDirectory)) {
  console.error(`既に存在します: ${articleDirectory}`);
  process.exit(1);
}

const dateParts = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
  .formatToParts(new Date())
  .reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
const date = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

const template = `---
title: "記事タイトル"
date: ${date}
draft: true
author: "著者名"
tags: []
description: "記事の概要"
---

[前回の参加記()](https://wcpc.pages.dev/activities/)

## はじめに



## 結果サマリ

- [コンテスト名](https://atcoder.jp/contests/)

- WCPC参加人数: **人**

- 各問題の最速解答者(ペナルティ無し):

| 問題 | 参加者名    | タイム | 言語 |
| :--- | :---------- | :----- | :--- |
| A    | -           | -      | -    |
| B    | -           | -      | -    |
| C    | -           | -      | -    |
| D    | -           | -      | -    |
| E    | -           | -      | -    |
| F    | -           | -      | -    |
| G    | -           | -      | -    |

## 今週の出題

### A問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### B問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### C問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### D問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### E問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### F問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

### G問題

<details>

<summary>問題文を表示</summary>

<div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; border: 1px solid #ddd;">

**問題文**<br />

**制約**<br />
- 

**入力**<br />
入力は以下の形式で標準入力から与えられる。<br />

**出力**<br />
答えを $1$ 行で出力せよ。<br />

</div>

</details>

## 最後に
`;

mkdirSync(articleDirectory);

if (hasImages) {
  mkdirSync(join(articleDirectory, "images"));
}

writeFileSync(articlePath, template);

console.log(`作成しました: ${articlePath}`);
