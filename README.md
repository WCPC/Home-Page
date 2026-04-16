# Astro Starter Kit: Basics

```sh
npm create astro@latest -- --template basics
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
│   └── favicon.svg
├── src
│   ├── assets
│   │   └── astro.svg
│   ├── components
│   │   └── Welcome.astro
│   ├── layouts
│   │   └── Layout.astro
│   └── pages
│       └── index.astro
└── package.json
```

To learn more about the folder structure of an Astro project, refer to [our guide on project structure](https://docs.astro.build/en/basics/project-structure/).

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).

##  【重要】開発フローとマージルール

本リポジトリでは、コードの品質維持と安全性を高めるため、以下のルールを適用しています。

### 1. 開発の進め方
- 保護されたブランチ（`main` など）への**直接プッシュは禁止**されています。
- すべての変更は、新しく作成したブランチから **Pull Request (PR)** を作成して反映させてください。

### 2. マージのための必須条件
PRをマージするには、以下の条件をすべて満たす必要があります。

* **レビューと承認（Approve）**
    - 最低 **1名以上のメンバー** によるレビューと承認が必要です。
* **ステータスチェックの合格**
    - 設定されたすべての自動テストやビルド（CI）が正常に完了している必要があります。
* **最新状態の維持**
    - コンフリクトが発生している場合は、解消してからマージしてください。

### 3. 基本的な手順
1. 作業用ブランチを作成する。
2. 変更をコミットし、リモートにプッシュする。
3. GitHub上でPRを作成し、レビュワーをアサインする。
4. CIの結果を確認し、レビューでの指摘があれば修正する。
5. **Approve** を得て、すべてのチェックが緑色になったらマージします。