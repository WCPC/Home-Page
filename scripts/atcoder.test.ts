import { describe, expect, test } from "bun:test";
import {
  calculateUserProblemResults,
  extractJapaneseProblemSections,
  formatProblemResultTime,
  selectFastestByProblem,
  type AtCoderSubmission,
  type ContestProblem,
} from "./atcoder";

const start = 1_000_000;
const end = start + 100 * 60;
const problems: ContestProblem[] = ["A", "B", "C", "D"].map((index) => ({
  contest_id: "abc999",
  problem_id: `abc999_${index.toLowerCase()}`,
  problem_index: index,
}));

function sub(
  id: number,
  minute: number,
  problem: string,
  result: string,
): AtCoderSubmission {
  return {
    id,
    epoch_second: start + minute * 60,
    problem_id: `abc999_${problem.toLowerCase()}`,
    contest_id: "abc999",
    user_id: "twil3",
    language: "Rust (1.70.0)",
    point: result === "AC" ? 100 : 0,
    length: 100,
    result,
    execution_time: 1,
  };
}

describe("AtCoder penalty calculation", () => {
  test("未AC問題のWAは後続問題の時間に加算しない", () => {
    const submissions = [
      sub(1, 3, "A", "AC"),
      sub(2, 6, "B", "WA"),
      sub(3, 8, "B", "AC"),
      sub(4, 10, "C", "WA"),
      sub(5, 11, "C", "WA"),
      sub(6, 20, "D", "AC"),
    ];

    const results = calculateUserProblemResults(
      { atcoderId: "twil3" },
      submissions,
      problems,
      start,
      end,
    );

    expect(results.get("abc999_a")?.scoreTimeSeconds).toBe(3 * 60);
    expect(results.get("abc999_b")?.scoreTimeSeconds).toBe(13 * 60);
    expect(results.get("abc999_d")?.scoreTimeSeconds).toBe(25 * 60);
    expect(results.has("abc999_c")).toBe(false);
  });

  test("未ACだった問題を後でACした時点で、その問題のWAだけ加算する", () => {
    const submissions = [
      sub(1, 3, "A", "AC"),
      sub(2, 6, "B", "WA"),
      sub(3, 8, "B", "AC"),
      sub(4, 10, "C", "WA"),
      sub(5, 11, "C", "WA"),
      sub(6, 20, "D", "AC"),
      sub(7, 30, "C", "AC"),
    ];

    const results = calculateUserProblemResults(
      { atcoderId: "twil3" },
      submissions,
      problems,
      start,
      end,
    );

    // A:0 + B:1 + D:0 + C:2 = 3 penalties => 30 + 15 = 45 min
    expect(results.get("abc999_c")?.scoreTimeSeconds).toBe(45 * 60);
    expect(results.get("abc999_c")?.penaltyCount).toBe(3);
  });

  test("結果サマリの表示は実AC時刻だけにしてWA数を出さない", () => {
    const results = calculateUserProblemResults(
      { atcoderId: "twil3" },
      [sub(1, 3, "A", "AC"), sub(2, 6, "B", "WA"), sub(3, 8, "B", "AC")],
      problems,
      start,
      end,
    );

    expect(formatProblemResultTime(results.get("abc999_a")!)).toBe("3:00");
    expect(formatProblemResultTime(results.get("abc999_b")!)).toBe("8:00");
    expect(formatProblemResultTime(results.get("abc999_b")!)).not.toContain("+");
    expect(results.get("abc999_b")?.elapsedSeconds).toBe(8 * 60);
  });

  test("最速者はペナルティ込み時間でなく実AC時刻で決める", () => {
    const slowerWithoutPenalty = [
      { ...sub(1, 8, "A", "WA"), user_id: "early" },
      { ...sub(2, 9, "A", "AC"), user_id: "early" },
    ];
    const fasterWithPenalty = [{ ...sub(3, 10, "A", "AC"), user_id: "late" }];
    const fastest = selectFastestByProblem(
      [{ atcoderId: "early" }, { atcoderId: "late" }],
      new Map([
        ["early", slowerWithoutPenalty],
        ["late", fasterWithPenalty],
      ]),
      problems,
      start,
      end,
    );

    expect(fastest.get("abc999_a")?.userId).toBe("early");
  });
});

describe("AtCoder statement rendering", () => {
  test("入力出力のvar数式と行区切りを保ち、コードフェンスを使わない", () => {
    const html = `<span class="lang-ja"><section><h3>問題文</h3><p>説明 <var>N</var></p></section><section><h3>制約</h3><p><var>N</var> \le 10</p></section><section><h3>入力</h3><pre><var>N</var> <var>M</var>
<var>A_1</var> <var>A_2</var></pre></section><section><h3>出力</h3><pre><var>A_1</var>
B</pre></section></span><span class="lang-en">English</span>`;
    const statement = extractJapaneseProblemSections(html);

    expect(statement).toContain("$N$ $M$<br />\n$A_1$ $A_2$<br />");
    expect(statement).toContain("$A_1$<br />\nB<br />");
    expect(statement).not.toContain("```text");
    expect(statement).toContain("**制約**");
  });

  test("ネストされた箇条書きの深さを保持する", () => {
    const html = `<span class="lang-ja"><section><h3>問題文</h3><ul><li>親<ul><li>子</li></ul></li><li>次</li></ul></section><section><h3>制約</h3><p>なし</p></section><section><h3>入力</h3><pre>A</pre></section><section><h3>出力</h3><pre>B</pre></section></span><span class="lang-en">English</span>`;
    const statement = extractJapaneseProblemSections(html);

    expect(statement).toContain("- 親\n  - 子\n- 次");
  });

  test("問題文中のdetailsをアコーディオンのまま保持する", () => {
    const html = `<span class="lang-ja"><section><h3>問題文</h3><p>説明</p><details><summary>部分文字列とは</summary><p><var>S</var> の<strong>部分文字列</strong>とは、<var>S</var> の先頭から 0 文字以上削除して得られる文字列です。</p><p>例えば、<code>ab</code> は <code>abc</code> の部分文字列です。</p></details></section><section><h3>制約</h3><p>なし</p></section><section><h3>入力</h3><pre>A</pre></section><section><h3>出力</h3><pre>B</pre></section></span><span class="lang-en">English</span>`;
    const statement = extractJapaneseProblemSections(html);

    expect(statement).toContain("<details>");
    expect(statement).toContain("<summary>部分文字列とは</summary>");
    expect(statement).toContain("$S$ の**部分文字列**とは");
    expect(statement).toContain("`ab` は `abc` の部分文字列です。");
    expect(statement).toContain("</details>");
  });
});
