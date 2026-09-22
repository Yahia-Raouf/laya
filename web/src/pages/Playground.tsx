import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { api, ApiError, type Answer, type InferenceResult } from "../api";
import {
  EXAMPLES,
  buildBody,
  criteriaComplete,
  emptyDraft,
  emptyQuestion,
  type Draft,
  type QType,
  type QuestionDraft,
} from "../playground/model";

type PieceKind = "state" | "instructions" | "criteria";
interface ForgedPiece {
  id: string;
  kind: PieceKind;
  label: string;
  value: string; // state/instructions: text; criteria: JSON of {critType, options|levels|labels}
  critType?: QType;
}

const TYPE_META: Record<QType, { label: string; hint: string }> = {
  choice: { label: "choice", hint: "pick one option" },
  score: { label: "score", hint: "rate on a scale" },
  noul: { label: "noul", hint: "yes / no" },
};

export default function Playground() {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [pieces, setPieces] = useState<ForgedPiece[]>([]);
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState("");
  const [authMode, setAuthMode] = useState<"admin" | "key">("admin");
  const [apiKey, setApiKey] = useState("");
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [reject, setReject] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  const built = useMemo(() => buildBody(draft), [draft]);

  function patchQ(id: string, patch: Partial<QuestionDraft>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    }));
  }

  function place(kind: PieceKind | "type", holeQid: string | null, payload: ForgedPiece | QType) {
    if (kind === "type") {
      patchQ(holeQid!, { type: payload as QType });
      return true;
    }
    const piece = payload as ForgedPiece;
    if (kind === "state") {
      setDraft((d) => ({ ...d, stateText: piece.value }));
    } else if (kind === "instructions") {
      patchQ(holeQid!, { instructions: piece.value });
    } else if (kind === "criteria") {
      const q = draft.questions.find((x) => x.id === holeQid);
      if (!q || q.type !== piece.critType) return false; // shape mismatch
      const parsed = JSON.parse(piece.value);
      patchQ(holeQid!, {
        options: parsed.options ?? [],
        levels: parsed.levels ?? [],
        labels: parsed.labels ?? { t: "", f: "" },
      });
    }
    setPieces((p) => p.filter((x) => x.id !== piece.id)); // consume
    return true;
  }

  function onDragEnd(e: DragEndEvent) {
    const a = e.active.data.current as { kind: PieceKind | "type"; piece?: ForgedPiece; typeVal?: QType } | undefined;
    const o = e.over?.data.current as { holeKind: PieceKind | "type"; qid: string | null } | undefined;
    if (!a || !o) return;
    if (o.holeKind !== a.kind) return flashReject();
    const ok = place(a.kind, o.qid, a.kind === "type" ? a.typeVal! : a.piece!);
    if (!ok) flashReject();
  }

  function flashReject() {
    setReject("That piece doesn't fit here.");
    setTimeout(() => setReject(null), 1600);
  }

  // tap-to-place: drop a forged piece into the first matching empty slot
  function autoPlace(piece: ForgedPiece) {
    if (piece.kind === "state") return place("state", null, piece);
    for (const q of draft.questions) {
      if (piece.kind === "instructions" && !q.instructions) return place("instructions", q.id, piece);
      if (piece.kind === "criteria" && q.type === piece.critType && !criteriaComplete(q))
        return place("criteria", q.id, piece);
    }
    flashReject();
  }

  function loadExample(make: () => Draft) {
    setDraft(make());
    setPieces([]);
    setResult(null);
    setError("");
    setRaw(false);
  }

  function resetAll() {
    setDraft(emptyDraft());
    setPieces([]);
    setResult(null);
    setError("");
  }

  function addQuestion() {
    setDraft((d) => ({ ...d, questions: [...d.questions, emptyQuestion(`q${d.questions.length + 1}`)] }));
  }

  function removeQuestion(id: string) {
    setDraft((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== id) }));
  }

  function toggleRaw() {
    if (!raw) setRawText(JSON.stringify(built.body, null, 2));
    setRaw((r) => !r);
  }

  async function run() {
    setError("");
    setResult(null);
    let body: unknown;
    if (raw) {
      try {
        body = JSON.parse(rawText);
      } catch {
        return setError("Raw JSON is not valid.");
      }
    } else {
      if (built.missing.length) return setError(`Fill the missing slots: ${built.missing.join(", ")}`);
      body = built.body;
    }
    if (authMode === "key" && !apiKey.trim()) return setError("Enter an API key, or switch to the admin session.");
    setRunning(true);
    try {
      const res =
        authMode === "key" ? await api.inferenceKey(body, apiKey.trim()) : await api.inferenceAdmin(body);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status}: ${e.message}` : (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="section-gap">
      <div className="row between">
        <div>
          <div className="eyebrow">Try it</div>
          <h1 className="page-title">Playground</h1>
        </div>
        <div className="row" style={{ gap: "0.5rem" }}>
          <button className="btn ghost small" onClick={toggleRaw}>
            {raw ? "Puzzle mode" : "Raw JSON"}
          </button>
          <button className="btn ghost small" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>

      <div className="row" style={{ gap: "0.5rem" }}>
        <span className="muted small">Examples:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex.name} className="btn ghost small" onClick={() => loadExample(ex.make)}>
            {ex.label}
          </button>
        ))}
      </div>

      {reject && <div className="error">{reject}</div>}

      {raw ? (
        <div className="panel section-gap">
          <h2 className="section-title">Raw request body</h2>
          <textarea
            className="mono"
            style={{ minHeight: "320px" }}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="pg-grid">
            {/* board */}
            <div className="panel section-gap">
              <h2 className="section-title">Request body</h2>
              <div className="pg-json">
                <div className="pg-line">
                  <span className="pg-key">"state"</span>:
                  <Hole
                    id="hole-state"
                    holeKind="state"
                    qid={null}
                    filled={draft.stateText != null}
                    onClear={() => setDraft((d) => ({ ...d, stateText: null }))}
                  >
                    <span className="mono pg-val">{preview(draft.stateText)}</span>
                  </Hole>
                </div>

                <div className="pg-line">
                  <span className="pg-key">"questions"</span>:
                </div>
                {draft.questions.map((q) => (
                  <QuestionRow
                    key={q.id}
                    q={q}
                    onClearType={() => patchQ(q.id, { type: null })}
                    onClearInstr={() => patchQ(q.id, { instructions: null })}
                    onClearCrit={() => patchQ(q.id, { options: [], levels: [], labels: { t: "", f: "" } })}
                    onRename={(name) => patchQ(q.id, { name })}
                    onRemove={draft.questions.length > 1 ? () => removeQuestion(q.id) : undefined}
                  />
                ))}
                <button className="btn ghost small" onClick={addQuestion} style={{ marginTop: "0.5rem" }}>
                  + Add question
                </button>
              </div>
            </div>

            {/* tray + forge */}
            <div className="section-gap">
              <div className="panel section-gap">
                <h2 className="section-title">Type pieces</h2>
                <p className="muted small">Drag a type into a question's type slot.</p>
                <div className="pg-tray">
                  {(Object.keys(TYPE_META) as QType[]).map((t) => (
                    <TypePiece key={t} type={t} />
                  ))}
                </div>
              </div>

              <Forge
                draft={draft}
                onForge={(p) => setPieces((prev) => [...prev, p])}
              />

              {pieces.length > 0 && (
                <div className="panel section-gap">
                  <h2 className="section-title">Forged pieces</h2>
                  <p className="muted small">Drag into a slot, or tap to auto-place.</p>
                  <div className="pg-tray">
                    {pieces.map((p) => (
                      <ForgedPieceView key={p.id} piece={p} onTap={() => autoPlace(p)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DndContext>
      )}

      {/* preview + run */}
      <div className="panel section-gap">
        <div className="row between">
          <h2 className="section-title">Run</h2>
          {!raw && (
            <span className={`badge ${built.missing.length ? "warn" : "active"}`}>
              {built.missing.length ? `${built.missing.length} slot(s) left` : "ready"}
            </span>
          )}
        </div>

        <div className="row" style={{ gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}>
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Authenticate with</span>
            <select value={authMode} onChange={(e) => setAuthMode(e.target.value as "admin" | "key")}>
              <option value="admin">Admin session (no key)</option>
              <option value="key">API key (real /v1 path)</option>
            </select>
          </label>
          {authMode === "key" && (
            <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: "220px" }}>
              <span>API key</span>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="laya_…"
                autoComplete="off"
              />
            </label>
          )}
          <button className="btn primary" onClick={run} disabled={running}>
            {running ? "Running…" : "▶ Run inference"}
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {!raw && (
          <details>
            <summary className="muted small" style={{ cursor: "pointer" }}>
              Preview JSON
            </summary>
            <pre className="pg-preview mono">{JSON.stringify(built.body, null, 2)}</pre>
          </details>
        )}

        {result && <ResultView result={result} />}
      </div>
    </div>
  );
}

function preview(v: string | null): string {
  if (v == null) return "";
  const s = v.replace(/\s+/g, " ").trim();
  return s.length > 42 ? s.slice(0, 42) + "…" : s;
}

// ---------- board pieces ----------

function Hole({
  id,
  holeKind,
  qid,
  filled,
  onClear,
  children,
  locked,
  lockedLabel,
}: {
  id: string;
  holeKind: PieceKind | "type";
  qid: string | null;
  filled: boolean;
  onClear?: () => void;
  children?: React.ReactNode;
  locked?: boolean;
  lockedLabel?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { holeKind, qid } });
  return (
    <span
      ref={setNodeRef}
      className={`pg-hole ${filled ? "filled" : ""} ${isOver ? "over" : ""} ${locked ? "locked" : ""}`}
    >
      {filled ? (
        <span className="pg-placed">
          {children}
          {onClear && (
            <button className="pg-x" onClick={onClear} title="clear">
              ×
            </button>
          )}
        </span>
      ) : (
        <span className="pg-empty">{locked ? lockedLabel : holeKind}</span>
      )}
    </span>
  );
}

function QuestionRow({
  q,
  onClearType,
  onClearInstr,
  onClearCrit,
  onRename,
  onRemove,
}: {
  q: QuestionDraft;
  onClearType: () => void;
  onClearInstr: () => void;
  onClearCrit: () => void;
  onRename: (n: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="pg-qrow">
      <div className="row between" style={{ marginBottom: "0.4rem" }}>
        <input
          className="pg-name"
          value={q.name}
          onChange={(e) => onRename(e.target.value)}
          spellCheck={false}
        />
        {onRemove && (
          <button className="btn ghost small" onClick={onRemove}>
            remove
          </button>
        )}
      </div>
      <div className="pg-line">
        <span className="pg-key">"type"</span>:
        <Hole id={`${q.id}-type`} holeKind="type" qid={q.id} filled={!!q.type} onClear={onClearType}>
          <span className={`badge info`}>{q.type}</span>
        </Hole>
      </div>
      <div className="pg-line">
        <span className="pg-key">"instructions"</span>:
        <Hole
          id={`${q.id}-instr`}
          holeKind="instructions"
          qid={q.id}
          filled={!!q.instructions}
          onClear={onClearInstr}
        >
          <span className="mono pg-val">{preview(q.instructions)}</span>
        </Hole>
      </div>
      <div className="pg-line">
        <span className="pg-key">"criteria"</span>:
        <Hole
          id={`${q.id}-crit`}
          holeKind="criteria"
          qid={q.id}
          filled={criteriaComplete(q) && q.type !== "noul" ? true : q.type === "noul" && (q.labels.t || q.labels.f) ? true : false}
          onClear={onClearCrit}
          locked={!q.type}
          lockedLabel="place a type first"
        >
          <span className="mono pg-val">{critPreview(q)}</span>
        </Hole>
        {q.type === "noul" && !q.labels.t && !q.labels.f && (
          <span className="badge warn" style={{ marginLeft: "0.4rem" }}>
            optional
          </span>
        )}
      </div>
    </div>
  );
}

function critPreview(q: QuestionDraft): string {
  if (q.type === "choice") return q.options.map((o) => o.key).join(", ");
  if (q.type === "score") return q.levels.join(" · ");
  if (q.type === "noul") return [q.labels.t, q.labels.f].filter(Boolean).join(" / ");
  return "";
}

// ---------- draggable pieces ----------

function TypePiece({ type }: { type: QType }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `type-${type}`,
    data: { kind: "type", typeVal: type },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pg-piece type ${isDragging ? "dragging" : ""}`}
      {...listeners}
      {...attributes}
    >
      <strong>{TYPE_META[type].label}</strong>
      <span className="muted small">{TYPE_META[type].hint}</span>
    </div>
  );
}

function ForgedPieceView({ piece, onTap }: { piece: ForgedPiece; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: piece.id,
    data: { kind: piece.kind, piece },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`pg-piece ${piece.kind} ${isDragging ? "dragging" : ""}`}
      onClick={onTap}
      {...listeners}
      {...attributes}
    >
      <strong>{piece.label}</strong>
      <span className="mono small pg-piece-val">{preview(piece.value)}</span>
    </div>
  );
}

// ---------- forge ----------

function Forge({ draft, onForge }: { draft: Draft; onForge: (p: ForgedPiece) => void }) {
  const [kind, setKind] = useState<PieceKind>("state");
  const [text, setText] = useState("");
  const [critType, setCritType] = useState<QType>("choice");
  const [options, setOptions] = useState<{ key: string; desc: string }[]>([{ key: "", desc: "" }]);
  const [levels, setLevels] = useState<string[]>(["", ""]);
  const [labels, setLabels] = useState({ t: "", f: "" });

  const nextId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function forge() {
    if (kind === "state" || kind === "instructions") {
      if (!text.trim()) return;
      onForge({ id: nextId(), kind, label: kind, value: text });
      setText("");
      return;
    }
    // criteria
    let value: string;
    if (critType === "choice") {
      const opts = options.filter((o) => o.key.trim());
      if (!opts.length) return;
      value = JSON.stringify({ options: opts });
    } else if (critType === "score") {
      const lv = levels.map((l) => l.trim()).filter(Boolean);
      if (!lv.length) return;
      value = JSON.stringify({ levels: lv });
    } else {
      value = JSON.stringify({ labels });
    }
    onForge({ id: nextId(), kind: "criteria", label: `criteria (${critType})`, value, critType });
  }

  return (
    <div className="panel section-gap">
      <h2 className="section-title">Forge a piece</h2>
      <div className="checks">
        {(["state", "instructions", "criteria"] as PieceKind[]).map((k) => (
          <label key={k}>
            <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {k}
          </label>
        ))}
      </div>

      {kind === "state" && (
        <label className="field">
          <span>state (JSON or text)</span>
          <textarea
            className="mono"
            style={{ minHeight: "120px" }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='{"email": "…"}'
          />
        </label>
      )}

      {kind === "instructions" && (
        <label className="field">
          <span>instructions</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Route this ticket…" />
        </label>
      )}

      {kind === "criteria" && (
        <div className="section-gap">
          <label className="field" style={{ marginBottom: 0 }}>
            <span>for type</span>
            <select value={critType} onChange={(e) => setCritType(e.target.value as QType)}>
              <option value="choice">choice — options</option>
              <option value="score">score — ordered levels</option>
              <option value="noul">noul — true/false labels (optional)</option>
            </select>
          </label>

          {critType === "choice" &&
            options.map((o, i) => (
              <div className="row" key={i} style={{ gap: "0.5rem" }}>
                <input
                  placeholder="option key"
                  value={o.key}
                  onChange={(e) =>
                    setOptions((os) => os.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                  }
                />
                <input
                  placeholder="description (optional)"
                  value={o.desc}
                  onChange={(e) =>
                    setOptions((os) => os.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))
                  }
                />
              </div>
            ))}
          {critType === "choice" && (
            <button className="btn ghost small" onClick={() => setOptions((o) => [...o, { key: "", desc: "" }])}>
              + option
            </button>
          )}

          {critType === "score" &&
            levels.map((l, i) => (
              <input
                key={i}
                placeholder={`level ${i} (${i === 0 ? "lowest" : "higher"})`}
                value={l}
                onChange={(e) => setLevels((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
              />
            ))}
          {critType === "score" && (
            <button className="btn ghost small" onClick={() => setLevels((l) => [...l, ""])}>
              + level
            </button>
          )}

          {critType === "noul" && (
            <div className="row" style={{ gap: "0.5rem" }}>
              <input placeholder="true label" value={labels.t} onChange={(e) => setLabels((l) => ({ ...l, t: e.target.value }))} />
              <input placeholder="false label" value={labels.f} onChange={(e) => setLabels((l) => ({ ...l, f: e.target.value }))} />
            </div>
          )}
        </div>
      )}

      <button className="btn primary" onClick={forge}>
        Forge piece
      </button>
      {kind === "criteria" && !draft.questions.some((q) => q.type === critType) && (
        <p className="muted small">Tip: place a "{critType}" type piece first so this criteria has a slot to fit.</p>
      )}
    </div>
  );
}

// ---------- result ----------

function ResultView({ result }: { result: InferenceResult }) {
  return (
    <div className="section-gap">
      <div className="highlight">
        <div className="row between">
          <strong>Result</strong>
          <span className="sub small">
            {result.usage.input_tokens} input tokens · model {result.model}
          </span>
        </div>
      </div>
      {Object.entries(result.answers).map(([name, ans]) => (
        <div className="card-soft section-gap" key={name}>
          <div className="row between">
            <strong>{name}</strong>
            <span className="badge info">{ans.type}</span>
          </div>
          <AnswerView answer={ans} />
        </div>
      ))}
    </div>
  );
}

function Bars({ probs, chosen }: { probs: Record<string, number>; chosen?: string }) {
  const entries = Object.entries(probs).sort((a, b) => b[1] - a[1]);
  return (
    <div className="pg-bars">
      {entries.map(([k, v]) => (
        <div className="pg-bar" key={k}>
          <div className="pg-bar-head">
            <span className={k === chosen ? "strong" : ""}>{k}</span>
            <span className="muted">{(v * 100).toFixed(1)}%</span>
          </div>
          <div className="pg-bar-track">
            <div className={`pg-bar-fill ${k === chosen ? "chosen" : ""}`} style={{ width: `${v * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function AnswerView({ answer }: { answer: Answer }) {
  if (answer.type === "choice") {
    return (
      <>
        <p className="muted small">
          chose <strong>{answer.choice}</strong> · confidence {(answer.confidence * 100).toFixed(0)}%
        </p>
        <Bars probs={answer.probabilities} chosen={answer.choice} />
      </>
    );
  }
  if (answer.type === "score") {
    const legend = answer.legend ?? {};
    const chosen = Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])[0]?.[0];
    return (
      <>
        <p className="muted small">
          expected score <strong>{answer.score.toFixed(2)}</strong> · confidence{" "}
          {(answer.confidence * 100).toFixed(0)}%
        </p>
        <Bars
          probs={Object.fromEntries(
            Object.entries(answer.probabilities).map(([k, v]) => [legend[k] ? `${k} (${legend[k]})` : k, v]),
          )}
          chosen={legend[chosen] ? `${chosen} (${legend[chosen]})` : chosen}
        />
      </>
    );
  }
  // noul
  return (
    <>
      <p className="muted small">
        P(true) = <strong>{(answer.noul * 100).toFixed(1)}%</strong>
      </p>
      <div className="pg-bar-track">
        <div className="pg-bar-fill chosen" style={{ width: `${answer.noul * 100}%` }} />
      </div>
    </>
  );
}
