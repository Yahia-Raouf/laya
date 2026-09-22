import { useEffect, useState } from "react";
import { api, type LogEvent } from "../api";
import { fmtDate } from "../components/ui";

function statusClass(code: number): string {
  if (code < 300) return "active";
  if (code < 500) return "warn";
  return "err";
}

export default function Logs() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(next?: string) {
    setLoading(true);
    try {
      const res = await api.logs(next);
      setEvents((prev) => (next ? [...prev, ...res.events] : res.events));
      setCursor(res.nextCursor);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="section-gap">
      <div>
        <div className="eyebrow">Activity</div>
        <h1 className="page-title">Request Logs</h1>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        {events.length === 0 && !loading ? (
          <p className="muted">No requests logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Key</th>
                  <th>Endpoint</th>
                  <th>Types</th>
                  <th>Tokens</th>
                  <th>Latency</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="muted small">{fmtDate(e.ts)}</td>
                    <td className="strong">
                      {e.keyLabel ?? "(deleted)"}
                      {e.keyPrefix && <div className="muted small mono">{e.keyPrefix}…</div>}
                    </td>
                    <td className="mono small">{e.endpoint}</td>
                    <td className="muted small">{e.questionTypes.join(", ") || "—"}</td>
                    <td className="muted">{e.inputTokens ?? "—"}</td>
                    <td className="muted">{e.latencyMs != null ? `${e.latencyMs} ms` : "—"}</td>
                    <td>
                      <span className={`badge ${statusClass(e.statusCode)}`}>
                        {e.statusCode}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && (
          <div className="row" style={{ justifyContent: "center", marginTop: "1rem" }}>
            <button className="btn ghost" disabled={loading} onClick={() => load(cursor)}>
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
