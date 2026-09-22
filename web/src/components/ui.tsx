import type { ApiKey, ModelStatus } from "../api";

export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function KeyStatusBadge({ k }: { k: ApiKey }) {
  const s = k.effectiveStatus;
  const cls = s === "ACTIVE" ? "active" : s === "EXPIRED" ? "expired" : "inactive";
  return <span className={`badge ${cls}`}>{s.toLowerCase()}</span>;
}

export function ModelBadge({ status }: { status: ModelStatus | null }) {
  if (!status) return <span className="badge inactive">unknown</span>;
  const map: Record<ModelStatus["model"], { cls: string; dot: string }> = {
    ready: { cls: "active", dot: "green" },
    loading: { cls: "warn", dot: "amber" },
    error: { cls: "err", dot: "red" },
    disabled: { cls: "inactive", dot: "grey" },
  };
  const m = map[status.model];
  return (
    <span className={`badge ${m.cls}`}>
      <span className={`dot ${m.dot}`} />
      {status.model}
    </span>
  );
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
