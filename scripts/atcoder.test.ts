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

  test("AC前のWAだけを累積し、表示には実AC時刻と確定ペナルティを使う", () => {
    const results = calculateUserProblemResults(
      { atcoderId: "twil3" },
      [sub(1, 3, "A", "AC"), sub(2, 6, "B", "WA"), sub(3, 8, "B", "AC")],
      problems,
      start,
      end,
    );

    expect(formatProblemResultTime(results.get("abc999_a")!)).toBe("3:00");
    expect(formatProblemResultTime(results.get("abc999_b")!)).toBe("8:00 (+5)");
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

