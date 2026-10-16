export type WcpcMember = {
  atcoderId: string;
  displayName?: string;
};

export type AtCoderContest = {
  id: string;
  start_epoch_second: number;
  duration_second: number;
  title: string;
};

export type ContestProblem = {
  contest_id: string;
  problem_id: string;
  problem_index: string;
};

export type AtCoderSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  user_id: string;
  language: string;
  point: number;
  length: number;
  result: string;
  execution_time: number | null;
};

export type ProblemResult = {
  problemId: string;
  problemIndex: string;
  userId: string;
  displayName: string;
  acceptedAt: number;
  elapsedSeconds: number;
  penaltyCount: number;
  scoreTimeSeconds: number;
  language: string;
};

export type ContestAutoData = {
  contest: AtCoderContest;
  problems: ContestProblem[];
  participantCount: number;
  fastestByProblem: Map<string, ProblemResult>;
  statements: Map<string, string>;
};

const RESOURCES = "https://kenkoooo.com/atcoder/resources";
const API = "https://kenkoooo.com/atcoder/atcoder-api/v3";
const ATCODER = "https://atcoder.jp";
const API_INTERVAL_MS = 1100;
const STATEMENT_INTERVAL_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function showProgress(label: string, current: number, total: number, detail?: string): void {
  if (total <= 0) return;

  const width = 20;
  const ratio = Math.min(Math.max(current / total, 0), 1);
  const filled = Math.round(ratio * width);
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  const percent = Math.round(ratio * 100);
  const countWidth = String(total).length;
  const line = `[${label}] ${String(current).padStart(countWidth, " ")}/${total} [${bar}] ${String(percent).padStart(3, " ")}%${detail ? ` ${detail}` : ""}`;

  if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${line}`);
    if (current >= total) process.stdout.write("\n");
  } else {
    console.log(line);
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": "WCPC-Home-Page article-generator" },
  });
  if (!response.ok) throw new Error(`取得に失敗しました (${response.status}): ${url}`);
  return (await response.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "WCPC-Home-Page article-generator" },
  });
  if (!response.ok) throw new Error(`取得に失敗しました (${response.status}): ${url}`);
  return await response.text();
}

function isPenaltyResult(result: string): boolean {
  // AtCoderではCEはペナルティ対象外。
  return result !== "AC" && result !== "CE";
}

export function calculateUserProblemResults(
  member: WcpcMember,
  submissions: AtCoderSubmission[],
  problems: ContestProblem[],
  contestStart: number,
  contestEnd: number,
  penaltySeconds = 5 * 60,
): Map<string, ProblemResult> {
  const problemIds = new Set(problems.map((problem) => problem.problem_id));
  const problemIndexById = new Map(
    problems.map((problem) => [problem.problem_id, problem.problem_index]),
  );

  const wrongBeforeAc = new Map<string, number>();
  const solved = new Set<string>();
  const results = new Map<string, ProblemResult>();
  let cumulativePenaltyCount = 0;

  const relevant = submissions
    .filter((submission) => submission.user_id === member.atcoderId)
    .filter((submission) => problemIds.has(submission.problem_id))
    .filter(
      (submission) =>
        submission.epoch_second >= contestStart && submission.epoch_second <= contestEnd,
    )
    .sort((a, b) => a.epoch_second - b.epoch_second || a.id - b.id);

  for (const submission of relevant) {
    const problemId = submission.problem_id;
    if (solved.has(problemId)) continue;

    if (submission.result === "AC") {
      // この問題が解けた瞬間にだけ、この問題でAC前に出した誤答を
      // 累積ペナルティへ加える。未AC問題の誤答は一切加えない。
      cumulativePenaltyCount += wrongBeforeAc.get(problemId) ?? 0;
      solved.add(problemId);

      const elapsedSeconds = submission.epoch_second - contestStart;
      results.set(problemId, {
        problemId,
        problemIndex: problemIndexById.get(problemId) ?? problemId,
        userId: member.atcoderId,
        displayName: member.displayName ?? member.atcoderId,
        acceptedAt: submission.epoch_second,
        elapsedSeconds,
        penaltyCount: cumulativePenaltyCount,
        scoreTimeSeconds: elapsedSeconds + cumulativePenaltyCount * penaltySeconds,
        language: submission.language,
      });
      continue;
    }

    if (isPenaltyResult(submission.result)) {
      wrongBeforeAc.set(problemId, (wrongBeforeAc.get(problemId) ?? 0) + 1);
    }
  }

  return results;
}

export function selectFastestByProblem(
  members: WcpcMember[],
  submissionsByUser: Map<string, AtCoderSubmission[]>,
  problems: ContestProblem[],
  contestStart: number,
  contestEnd: number,
  penaltySeconds = 5 * 60,
): Map<string, ProblemResult> {
  const fastest = new Map<string, ProblemResult>();

  for (const member of members) {
    const userResults = calculateUserProblemResults(
      member,
      submissionsByUser.get(member.atcoderId) ?? [],
      problems,
      contestStart,
      contestEnd,
      penaltySeconds,
    );

    for (const [problemId, candidate] of userResults) {
      const current = fastest.get(problemId);
      if (
        !current ||
        candidate.elapsedSeconds < current.elapsedSeconds ||
        (candidate.elapsedSeconds === current.elapsedSeconds &&
          candidate.acceptedAt < current.acceptedAt) ||
        (candidate.elapsedSeconds === current.elapsedSeconds &&
          candidate.acceptedAt === current.acceptedAt &&
          candidate.displayName.localeCompare(current.displayName) < 0)
      ) {
        fastest.set(problemId, candidate);
      }
    }
  }

  return fastest;
}

export function formatContestTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatProblemResultTime(
  result: Pick<ProblemResult, "elapsedSeconds">,
): string {
  return formatContestTime(result.elapsedSeconds);
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    le: "≤",
    ge: "≥",
    times: "×",
    minus: "−",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (/^#x/i.test(entity)) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? match;
  });
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function protectMathFromVar(body: string): string {
  const raw = decodeHtml(stripTags(body)).trim();
  const math = raw.replace(/^\\\((.*)\\\)$/s, "$1");
  return `$${math}$`;
}

function convertListTags(html: string): string {
  const listStack: Array<"ul" | "ol"> = [];

  return html.replace(/<\/?(?:ul|ol|li)\b[^>]*>/gi, (tag) => {
    const match = tag.match(/^<\/?\s*(ul|ol|li)\b/i);
    if (!match) return tag;

    const name = match[1].toLowerCase() as "ul" | "ol" | "li";
    const closing = /^<\//.test(tag);

    if (name === "ul" || name === "ol") {
      if (closing) listStack.pop();
      else listStack.push(name);
      return "\n";
    }

    if (closing) return "";

    const depth = Math.max(listStack.length - 1, 0);
    const marker = listStack.at(-1) === "ol" ? "1. " : "- ";
    return `\n${"  ".repeat(depth)}${marker}`;
  });
}

function htmlToMarkdown(html: string): string {
  const placeholders: string[] = [];
  const hold = (value: string) => `@@WCPC_${placeholders.push(value) - 1}@@`;

  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<details\b[^>]*>([\s\S]*?)<\/details>/gi, (_m, body: string) => {
      const summaryMatch = body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
      const summary = summaryMatch
        ? htmlToMarkdown(summaryMatch[1]).replace(/\s*\n\s*/g, " ").trim()
        : "詳細";
      const detailsBody = summaryMatch ? body.replace(summaryMatch[0], "") : body;
      const detailsContent = htmlToMarkdown(detailsBody);
      return hold(
        `\n\n<details>\n\n<summary>${summary}</summary>\n\n${detailsContent}\n\n</details>\n\n`,
      );
    });

  text = convertListTags(text)
    .replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, body: string) => {
      const lines = body
        .replace(/<var\b[^>]*>([\s\S]*?)<\/var>/gi, (_varMatch, math: string) =>
          protectMathFromVar(math),
        )
        .replace(/<br\s*\/?>/gi, "\n")
        .split(/\r?\n/)
        .map((line) => decodeHtml(stripTags(line)).trim());
      while (lines[0] === "") lines.shift();
      while (lines.at(-1) === "") lines.pop();
      return hold(`\n\n${lines.map((line) => `${line}<br />`).join("\n")}\n\n`);
    })
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, body: string) => {
      const code = decodeHtml(stripTags(body));
      return hold(`\`${code.replaceAll("`", "\\`")}\``);
    })
    .replace(/<var\b[^>]*>([\s\S]*?)<\/var>/gi, (_m, body: string) =>
      hold(protectMathFromVar(body)),
    )
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<[^>]*>/g, "");

  text = decodeHtml(text)
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, math: string) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, math: string) => `$${math.trim()}$`)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]*\n(?=[ \t]*(?:- |1\. ))/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text
    .replace(/@@WCPC_(\d+)@@/g, (_m, index: string) => placeholders[Number(index)] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJapaneseStatement(html: string): string {
  const jaStart = html.search(/<span\b[^>]*class=["'][^"']*lang-ja[^"']*["'][^>]*>/i);
  const source = jaStart >= 0 ? html.slice(jaStart) : html;
  const end = source.search(/<span\b[^>]*class=["'][^"']*lang-en[^"']*["'][^>]*>/i);
  return end >= 0 ? source.slice(0, end) : source;
}

export function extractJapaneseProblemSections(html: string): string {
  const source = extractJapaneseStatement(html);
  const wanted = new Set(["問題文", "制約", "入力", "出力"]);
  const sections: string[] = [];
  const sectionPattern = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(source))) {
    const body = match[1];
    const heading = body.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i);
    if (!heading) continue;
    const title = decodeHtml(stripTags(heading[1])).trim();
    if (!wanted.has(title)) continue;
    const content = body.slice((heading.index ?? 0) + heading[0].length);
    sections.push(`**${title}**\n\n${htmlToMarkdown(content)}`);
  }

  if (sections.length < 4) {
    throw new Error("問題文・制約・入力・出力の抽出に失敗しました。");
  }
  return sections.join("\n\n");
}

async function fetchContest(contestId: string): Promise<AtCoderContest> {
  const contests = await fetchJson<AtCoderContest[]>(`${RESOURCES}/contests.json`);
  const contest = contests.find((item) => item.id.toLowerCase() === contestId.toLowerCase());
  if (!contest) throw new Error(`コンテストが見つかりません: ${contestId}`);
  return contest;
}

async function fetchContestProblems(contestId: string): Promise<ContestProblem[]> {
  const pairs = await fetchJson<ContestProblem[]>(`${RESOURCES}/contest-problem.json`);
  return pairs
    .filter((pair) => pair.contest_id.toLowerCase() === contestId.toLowerCase())
    .sort((a, b) => a.problem_index.localeCompare(b.problem_index, "en", { numeric: true }));
}

async function fetchMemberSubmissions(
  member: WcpcMember,
  fromSecond: number,
): Promise<AtCoderSubmission[]> {
  const url = `${API}/user/submissions?user=${encodeURIComponent(member.atcoderId)}&from_second=${fromSecond}`;
  return fetchJson<AtCoderSubmission[]>(url);
}

async function fetchAllMemberSubmissions(
  members: WcpcMember[],
  contestStart: number,
): Promise<Map<string, AtCoderSubmission[]>> {
  const result = new Map<string, AtCoderSubmission[]>();
  showProgress("提出", 0, members.length, "開始");

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    result.set(member.atcoderId, await fetchMemberSubmissions(member, contestStart));
    showProgress(
      "提出",
      i + 1,
      members.length,
      member.displayName ?? member.atcoderId,
    );
    if (i + 1 < members.length) await sleep(API_INTERVAL_MS);
  }
  return result;
}

function countParticipants(
  members: WcpcMember[],
  submissionsByUser: Map<string, AtCoderSubmission[]>,
  contestId: string,
  contestStart: number,
  contestEnd: number,
): number {
  return members.filter((member) =>
    (submissionsByUser.get(member.atcoderId) ?? []).some(
      (submission) =>
        submission.contest_id === contestId &&
        submission.epoch_second >= contestStart &&
        submission.epoch_second <= contestEnd,
    ),
  ).length;
}

async function fetchStatements(contestId: string, problems: ContestProblem[]) {
  const statements = new Map<string, string>();
  showProgress("問題文", 0, problems.length, "開始");

  for (let i = 0; i < problems.length; i += 1) {
    const problem = problems[i];
    const url = `${ATCODER}/contests/${encodeURIComponent(contestId)}/tasks/${encodeURIComponent(problem.problem_id)}?lang=ja`;
    statements.set(problem.problem_id, extractJapaneseProblemSections(await fetchText(url)));
    showProgress("問題文", i + 1, problems.length, problem.problem_index);
    if (i + 1 < problems.length) await sleep(STATEMENT_INTERVAL_MS);
  }
  return statements;
}

export async function fetchContestAutoData(
  contestId: string,
  members: WcpcMember[],
  penaltySeconds = 5 * 60,
): Promise<ContestAutoData> {
  console.log("[準備] コンテスト情報を取得しています...");
  const contest = await fetchContest(contestId);
  await sleep(API_INTERVAL_MS);

  console.log("[準備] 問題一覧を取得しています...");
  const problems = await fetchContestProblems(contest.id);
  if (problems.length === 0) throw new Error(`問題一覧が見つかりません: ${contest.id}`);

  await sleep(API_INTERVAL_MS);
  const submissionsByUser = await fetchAllMemberSubmissions(members, contest.start_epoch_second);
  const contestEnd = contest.start_epoch_second + contest.duration_second;

  console.log("[集計] 最速解答者とペナルティを計算しています...");
  const fastestByProblem = selectFastestByProblem(
    members,
    submissionsByUser,
    problems,
    contest.start_epoch_second,
    contestEnd,
    penaltySeconds,
  );
  const participantCount = countParticipants(
    members,
    submissionsByUser,
    contest.id,
    contest.start_epoch_second,
    contestEnd,
  );
  const statements = await fetchStatements(contest.id, problems);
  return { contest, problems, participantCount, fastestByProblem, statements };
}
