// Data model + JSON builder for the puzzle playground.

export type QType = "choice" | "score" | "noul";

export interface QuestionDraft {
  id: string;
  name: string;
  type: QType | null;
  instructions: string | null;
  options: { key: string; desc: string }[]; // choice criteria
  levels: string[]; // score criteria
  labels: { t: string; f: string }; // noul criteria (optional)
}

export interface Draft {
  stateText: string | null; // JSON (or plain text) for `state`
  questions: QuestionDraft[];
}

let counter = 0;
export const uid = (p = "q") => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export function emptyQuestion(name: string): QuestionDraft {
  return {
    id: uid("q"),
    name,
    type: null,
    instructions: null,
    options: [],
    levels: [],
    labels: { t: "", f: "" },
  };
}

export function emptyDraft(): Draft {
  return { stateText: null, questions: [emptyQuestion("q1")] };
}

// True when a question's criteria slot is satisfied (choice/score need content,
// noul is optional so it is always "complete").
export function criteriaComplete(q: QuestionDraft): boolean {
  if (q.type === "choice") return q.options.length > 0;
  if (q.type === "score") return q.levels.length > 0;
  if (q.type === "noul") return true;
  return false;
}

export interface BuildResult {
  body: { state: unknown; questions: Record<string, unknown> };
  missing: string[]; // human-readable list of empty required slots
}

export function buildBody(draft: Draft): BuildResult {
  const missing: string[] = [];

  let state: unknown = undefined;
  if (!draft.stateText || draft.stateText.trim() === "") missing.push("state");
  else {
    try {
      state = JSON.parse(draft.stateText);
    } catch {
      state = draft.stateText; // allow a plain string state
    }
  }

  const questions: Record<string, unknown> = {};
  for (const q of draft.questions) {
    if (!q.type) missing.push(`${q.name}.type`);
    if (!q.instructions || q.instructions.trim() === "") missing.push(`${q.name}.instructions`);

    const question: Record<string, unknown> = {};
    if (q.type) question.type = q.type;
    if (q.instructions) question.instructions = q.instructions;

    if (q.type === "choice") {
      if (q.options.length === 0) missing.push(`${q.name}.criteria`);
      else question.criteria = Object.fromEntries(q.options.map((o) => [o.key, o.desc || null]));
    } else if (q.type === "score") {
      if (q.levels.length === 0) missing.push(`${q.name}.criteria`);
      else question.criteria = q.levels;
    } else if (q.type === "noul") {
      const c: Record<string, string> = {};
      if (q.labels.t) c.true = q.labels.t;
      if (q.labels.f) c.false = q.labels.f;
      if (Object.keys(c).length) question.criteria = c;
    }
    questions[q.name] = question;
  }

  return { body: { state, questions }, missing };
}

// One-click starter drafts.
export const EXAMPLES: { name: string; label: string; make: () => Draft }[] = [
  {
    name: "route",
    label: "Route a support ticket",
    make: () => ({
      stateText: JSON.stringify(
        { subject: "I was double charged this month", body: "Please refund the extra charge." },
        null,
        2,
      ),
      questions: [
        {
          id: uid("q"),
          name: "department",
          type: "choice",
          instructions: "Route this support ticket to the right department.",
          options: [
            { key: "billing", desc: "billing and payments" },
            { key: "technical", desc: "technical bug or outage" },
            { key: "account", desc: "account access" },
          ],
          levels: [],
          labels: { t: "", f: "" },
        },
      ],
    }),
  },
  {
    name: "urgency",
    label: "Score urgency",
    make: () => ({
      stateText: JSON.stringify(
        { message: "Production is down for all users, revenue impact ongoing." },
        null,
        2,
      ),
      questions: [
        {
          id: uid("q"),
          name: "urgency",
          type: "score",
          instructions: "How urgent is this message?",
          options: [],
          levels: ["low", "medium", "high", "critical"],
          labels: { t: "", f: "" },
        },
      ],
    }),
  },
  {
    name: "phishing",
    label: "Detect phishing (yes/no)",
    make: () => ({
      stateText: JSON.stringify(
        { from: "security@paypa1.com", body: "Verify your account now or it will be closed." },
        null,
        2,
      ),
      questions: [
        {
          id: uid("q"),
          name: "is_phishing",
          type: "noul",
          instructions: "Is this email a phishing attempt?",
          options: [],
          levels: [],
          labels: { t: "looks like phishing", f: "looks legitimate" },
        },
      ],
    }),
  },
];
