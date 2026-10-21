import * as z from "zod";

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a real YYYY-MM-DD date");
const text = (max: number) => z.string().trim().min(1).max(max);
export const PreferencesPatch = z.strictObject({
  interests: z.array(text(80)).max(20).optional(),
  language: text(80).nullable().optional(),
  difficulty: z.enum(["easy", "balanced", "challenging"]).nullable().optional(),
  timeZone: text(80).refine(zone => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }, "Use an IANA time zone").optional(),
});
// Empty feedback removes an existing note; only the native account can write it.
export const FeedbackInput = z.strictObject({ message: z.string().trim().max(1000) });
export const Question = z.strictObject({
  prompt: text(1200), topic: text(80),
  choices: z.array(text(400)).length(4).refine(values => new Set(values.map(v => v.toLocaleLowerCase())).size === 4,
    "Choices must be distinct"),
  correctIndex: z.number().int().min(0).max(3), explanation: text(2400),
  sourceURL: z.url().max(2000).refine(value => /^https:\/\//.test(value), "Use HTTPS").nullable().optional(),
});
export const PackInput = z.strictObject({
  day: Day, title: text(120), hostMessage: text(4000), questions: z.array(Question).length(5),
}).refine(pack => new Set(pack.questions.map(q => q.prompt.toLocaleLowerCase())).size === 5,
  "Questions must be distinct");
export type QuestionData = z.infer<typeof Question>;
export type Preferences = { interests: string[]; language: string | null; difficulty: string | null; timeZone: string };
export type PackRow = { id: string; tenant_id: string; day: string; title: string; host_message: string; questions: string; created_at: string };
export type AnswerRow = { pack_id: string; question_index: number; choice_index: number; correct: number; answered_at: string };

export function dateInZone(now: Date, zone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}

// A streak is consecutive completed calendar days. Today remains open until
// midnight, so yesterday's streak is still current while today's is unfinished.
export type StreakSummary = { lastDay: string | null; run: number; longest: number; completedDays: number };
/// Summarises completed days in calendar order: the run ending on the last
/// one, the longest run and how many there are.
export function summarizeStreaks(days: string[]): StreakSummary {
  let run = 0, longest = 0, last: string | null = null;
  for (const day of days) {
    run = last && addDays(last, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    last = day;
  }
  return { lastDay: last, run, longest, completedDays: days.length };
}
export function currentStreak(summary: StreakSummary, today: string) {
  const current = summary.lastDay === today || summary.lastDay === addDays(today, -1) ? summary.run : 0;
  return { current, longest: summary.longest, completedDays: summary.completedDays };
}
export function streaks(packs: { day: string; completed: boolean }[], today: string) {
  return currentStreak(summarizeStreaks(packs.filter(p => p.completed && p.day <= today).map(p => p.day).sort()), today);
}

export function presentPack(pack: PackRow, answers: AnswerRow[], today: string) {
  const questions: QuestionData[] = JSON.parse(pack.questions);
  return {
    id: pack.id, day: pack.day, title: pack.title, hostMessage: pack.host_message,
    createdAt: pack.created_at, completed: answers.length === 5,
    score: answers.reduce((sum, answer) => sum + answer.correct, 0),
    questions: questions.map((q, index) => {
      const answer = answers.find(a => a.question_index === index);
      const reveal = Boolean(answer) || pack.day < today;
      return { index, prompt: q.prompt, topic: q.topic, choices: q.choices,
        correctIndex: reveal ? q.correctIndex : null, explanation: reveal ? q.explanation : null,
        sourceURL: reveal ? q.sourceURL ?? null : null,
        answer: answer ? { choiceIndex: answer.choice_index, correct: Boolean(answer.correct), answeredAt: answer.answered_at } : null };
    }),
  };
}
