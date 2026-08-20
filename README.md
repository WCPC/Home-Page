# WCPC Home Page

WCPC Home PageのRepositoryです。このガイドでは、環境構築、記事の作成・検証、Pull Requestの提出までを説明します。

## Quick Start

Git・Bunのセットアップとcloneが完了している場合は、次の流れで記事を作成できます。

```sh
git switch main
git pull
git switch -c write/abc472-log

bun install
bun run make abc472-log
# 記事を編集する

bun run lint:articles -- src/content/activities/abc472-log/index.mdx
bun run format
bun run build

git status
git diff
git add src/content/activities/abc472-log/
git commit -m "write: ABC472参加記を作成"
git push -u origin write/abc472-log
```

GitHubで `base: main`、`compare: write/abc472-log` のPull Requestを作成します。

## はじめて開発する方

### 必要なもの

開発には次の3つが必要です。Node.jsはこのRepositoryの必須要件ではありません。

- Git
- Bun
- GitHubアカウント

### Git

インストール済みか確認します。

```sh
git --version
```

表示されなければ、[Git公式サイト](https://git-scm.com/)または利用中のOSのパッケージ管理手順でインストールしてください。Windowsでは[Git for Windows](https://gitforwindows.org/)も利用できます。

### Bun

インストール済みか確認します。

```sh
bun --version
```

未導入の場合は、[Bun公式ドキュメント](https://bun.sh/docs/installation)の手順に従ってください。インストール後はターミナルを開き直し、もう一度 `bun --version` を実行します。

### Git初期設定

Gitを初めて使用する場合は、GitHubで使用する名前とメールアドレスを設定します。

```sh
git config --global user.name "GitHubのユーザー名"
git config --global user.email "GitHubで使用するメールアドレス"
```

設定は次で確認できます。

```sh
git config --global --list
```

### Repository clone

Repositoryをcloneして移動します。

```sh
git clone https://github.com/WCPC/Home-Page.git
cd Home-Page
```

### bun install

依存関係をインストールします。初回clone時と、`package.json`または`bun.lock`が変わったときに実行します。

```sh
bun install
```

### bun run dev

開発サーバーを起動し、表示されたlocalhostのURLをブラウザで開きます。終了は `Ctrl + C` です。

```sh
bun run dev
```

## 開発の進め方

### main更新

作業開始前に`main`を最新にします。`main`へ直接pushしてはいけません。

```sh
git switch main
git pull
```

### branch作成

変更内容ごとに作業branchを作成します。

```sh
git switch -c write/abc472-log
```

命名例です。

- 記事: `write/abc472-log`
- 機能追加: `feat/article-linter`
- 修正: `fix/article-layout`

## 記事を書く

### bun run make

Issue #48に対応する記事生成scriptです。記事directoryと`index.mdx`を作成します。

```sh
bun run make abc472-log
```

画像を置く記事では、`images/`も同時に作成できます。

```sh
bun run make abc472-log --images
```

`bun run make --help`で使い方を確認できます。既存directoryは上書きせず、不正なdirectory指定は拒否します。

### Frontmatter

生成された記事には、日付入りのFrontmatter skeletonが入ります。初期値は`draft: true`なので、意図せず公開されません。

```md
---
title: "記事タイトル"
date: 2026-08-20
draft: true
author: "著者名"
tags: []
description: "記事の概要"
---
```

公開前に、タイトル、著者、タグ、概要、`draft`を確認してください。

### 画像

画像は記事directoryの`images/`に置き、記事から相対パスで参照します。

```md
![説明](./images/example.png)
```

### 記事執筆

本文はMarkdown / MDXで書けます。既存の記事を参考にし、問題ごとの見出し、数式、画像が正しく表示されるかブラウザで確認してください。

## WCPC Article Linter

Linterは、Frontmatter、Markdown / MDX、数式、表記揺れなど、WCPC記事で頻発する問題を診断します。formatterの代替ではありません。出力にはfile、行・列、severity、rule、メッセージが表示されます。

### lint

単一記事を検査します。対象pathは必須です。

```sh
bun run lint:articles -- src/content/activities/abc472-log/index.mdx
```

### fix

機械的に安全な修正だけを適用します。適用後は再検査されるため、必ず`git diff`で内容を確認してください。

```sh
bun run lint:articles:fix -- src/content/activities/abc472-log/index.mdx
git diff
```

### all

全記事を検査する場合は、明示的なall用commandを使います。

```sh
bun run lint:articles:all
```

全記事へ安全なautofixを適用するcommandもあります。広い変更になるため、実行前後に必ず差分を確認してください。

```sh
bun run lint:articles:fix:all
git diff
```

### diagnosticへの対応

`error`は修正が必要な違反です。`warning`は文脈確認が必要な指摘です。`--strict`ではwarningも終了失敗の対象になります。

1. メッセージと行・列を読む
2. 修正するか、必要なら内容を確認する
3. `--fix`を使った場合は差分を確認する
4. 同じlint commandをもう一度実行する

個別ruleの詳細はLinterの`--help`と[`scripts/wcpc-lint.ts`](scripts/wcpc-lint.ts)を正とします。

## Pull Request前の確認

記事を提出する前に、対象記事をlintし、format・build・表示を確認します。

```sh
bun run lint:articles -- src/content/activities/abc472-log/index.mdx
bun run format
bun run build
bun run dev
git status
git diff
```

`bun run format`はRepository内の複数fileを変更することがあります。今回の変更と無関係な差分はstageやcommitに混ぜないでください。

ブラウザでは、少なくとも次を確認します。

- 見出しとレイアウト
- 数式
- 画像とリンク
- PC / mobileでの大きな崩れ

## Commit / Push

まず、変更内容とstage対象を確認します。

```sh
git status
git diff
```

必要なfileまたはdirectoryだけをstageします。初心者向けの標準操作として`git add .`は使いません。

```sh
git add src/content/activities/abc472-log/
git commit -m "write: ABC472参加記を作成"
git push -u origin write/abc472-log
```

review修正時も同じbranchへcommitしてpushします。新しいPull Requestを作り直す必要はありません。

```sh
git add <file-or-directory>
git commit -m "fix: review指摘を修正"
git push
```

## Pull Request

push後にGitHubでPull Requestを作成します。

- `base: main`
- `compare: 作業branch`
- 変更内容が分かるtitleとdescription

Issueに対応する場合は、PR本文へ `Closes #48` のように記載します。Reviewerを設定し、CIとreviewを待ちます。

## Merge後

Pull Requestがmergeされたら、ローカルの`main`を更新します。

```sh
git switch main
git pull
```

不要になったlocal branchは、merge済みであることを確認してから削除できます。

```sh
git branch -d write/abc472-log
```

## よく使うコマンド

| やりたいこと           | コマンド                              |
| ---------------------- | ------------------------------------- |
| 依存関係をインストール | `bun install`                         |
| 開発サーバー           | `bun run dev`                         |
| build                  | `bun run build`                       |
| format                 | `bun run format`                      |
| 記事を作成             | `bun run make <name>`                 |
| 画像付き記事を作成     | `bun run make <name> --images`        |
| 記事をlint             | `bun run lint:articles -- <path>`     |
| 記事をautofix          | `bun run lint:articles:fix -- <path>` |
| 全記事をlint           | `bun run lint:articles:all`           |
| 全記事をautofix        | `bun run lint:articles:fix:all`       |
| branchを作成           | `git switch -c <name>`                |
| 変更を確認             | `git status` / `git diff`             |
| stage                  | `git add <file-or-directory>`         |
| commit                 | `git commit -m "<message>"`           |

## トラブルシューティング

### `bun: command not found`

`bun --version`を確認し、[Bun公式ドキュメント](https://bun.sh/docs/installation)に従ってインストールまたはPATHを設定してください。

### packageが見つからない

依存関係を再インストールします。

```sh
bun install
```

### 開発サーバーがおかしい

一度 `Ctrl + C` で終了してから、再起動します。

```sh
bun run dev
```

### 現在のbranchが分からない

```sh
git branch
```

`*`が付いたbranchが現在のbranchです。

### stageするfileを間違えた

commit前であれば、次でstageから外せます。file自体の変更は消えません。

```sh
git restore --staged <file>
```

### Conflictが発生した

無理に解消せず、必要なら他のメンバーへ相談してください。自力で対応する場合は、`main`を更新してから作業branchへ取り込みます。

```sh
git switch main
git pull
git switch <branch-name>
git merge main
```

解消後は対象fileだけをstageしてcommit・pushします。

## 開発・マージルール

- `main`への直接pushは禁止です。必ず作業branchとPull Requestを使用します。
- mergeには最低1名のreview・Approve、すべてのCIの成功、Conflictの解消が必要です。
- commitは意味のある単位に分け、意図しないfileを含めません。
- 未commit変更を破棄する操作は内容を確認してから行ってください。
