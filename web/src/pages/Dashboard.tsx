import { useEffect, useState } from "react";
import { api, type ModelStatus, type UsageSummary } from "../api";
import { ModelBadge, StatCard, fmtRelative, fmtUptime } from "../components/ui";

export default function Dashboard() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.usage().then(setUsage).catch((e) => setError(e.message));
    const poll = () => api.status().then(setStatus).catch(() => {});
    poll();
    const t = setInterval(poll, 5000); // live model status
    return () => clearInterval(t);
  }, []);

  return (
    <div className="section-gap">
      <div>
        <div className="eyebrow">Overview</div>
        <h1 className="page-title">Dashboard</h1>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid cols-4">
        <StatCard label="Total keys" value={usage?.totalKeys ?? "—"} />
        <StatCard label="Active keys" value={usage?.activeKeys ?? "—"} />
        <StatCard label="Requests (all time)" value={usage?.totalRequests ?? "—"} />
        <StatCard label="Requests (24h)" value={usage?.requests24h ?? "—"} />
      </div>

      <div className="grid cols-2">
        <div className="panel section-gap">
          <div className="row between">
            <h2 className="section-title">Model status</h2>
            <ModelBadge status={status} />
          </div>
          <div className="grid cols-2">
            <StatCard label="Uptime" value={status ? fmtUptime(status.uptimeSec) : "—"} />
            <StatCard label="Memory (RSS)" value={status ? `${status.rssMB} MB` : "—"} />
          </div>
          {status?.model === "loading" && (
            <div className="card-soft muted small">
              The model is downloading / loading its weights. Inference returns 503
              until this reads <strong>ready</strong>.
            </div>
          )}
          {status?.error && <div className="error">{status.error}</div>}
        </div>

        <div className="panel section-gap">
          <h2 className="section-title">Top keys by usage</h2>
          {!usage ? (
            <p className="muted">Loading…</p>
          ) : usage.byKey.length === 0 ? (
            <p className="muted">No requests yet.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Requests</th>
                    <th>Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.byKey
                    .slice()
                    .sort((a, b) => b.requests - a.requests)
                    .slice(0, 6)
                    .map((k) => (
                      <tr key={k.apiKeyId ?? k.keyPrefix}>
                        <td className="strong">
                          {k.label}
                          <div className="muted small mono">{k.keyPrefix}</div>
                        </td>
                        <td>{k.requests}</td>
                        <td className="muted">{fmtRelative(k.lastUsedAt)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
