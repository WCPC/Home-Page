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

## はじめに

## 本文

## 最後に
`;

mkdirSync(articleDirectory);

if (hasImages) {
  mkdirSync(join(articleDirectory, "images"));
}

writeFileSync(articlePath, template);

console.log(`作成しました: ${articlePath}`);
