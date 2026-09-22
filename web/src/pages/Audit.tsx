import { useEffect, useState } from "react";
import { api, type AuditEvent } from "../api";
import { fmtDate } from "../components/ui";

function actorBadge(actor: string) {
  const cls = actor === "secret" ? "info" : "active";
  return <span className={`badge ${cls}`}>{actor}</span>;
}

export default function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(next?: string) {
    setLoading(true);
    try {
      const res = await api.audit(next);
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
        <div className="eyebrow">Accountability</div>
        <h1 className="page-title">Audit Log</h1>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        {events.length === 0 && !loading ? (
          <p className="muted">No admin actions recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target key</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="muted small">{fmtDate(e.ts)}</td>
                    <td>{actorBadge(e.actor)}</td>
                    <td className="strong mono small">{e.action}</td>
                    <td className="muted small mono">{e.targetKeyId ?? "—"}</td>
                    <td className="muted small mono">
                      {e.detail ? JSON.stringify(e.detail) : "—"}
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
