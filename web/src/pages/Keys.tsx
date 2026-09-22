import { useEffect, useState, type FormEvent } from "react";
import {
  api,
  type ApiKey,
  type CreatedKey,
  type CreateKeyInput,
  type PatchKeyInput,
} from "../api";
import Modal from "../components/Modal";
import { KeyStatusBadge, fmtDate, fmtRelative } from "../components/ui";

const SCOPES = ["choice", "score", "noul"] as const;

export default function Keys() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<CreatedKey | null>(null);
  const [editing, setEditing] = useState<ApiKey | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { keys } = await api.listKeys();
      setKeys(keys);
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

  async function toggleStatus(k: ApiKey) {
    await api.patchKey(k.id, {
      status: k.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
    });
    load();
  }

  async function remove(k: ApiKey) {
    if (!confirm(`Delete key "${k.label}"? This cannot be undone.`)) return;
    await api.deleteKey(k.id);
    load();
  }

  return (
    <div className="section-gap">
      <div className="row between">
        <div>
          <div className="eyebrow">Access</div>
          <h1 className="page-title">API Keys</h1>
        </div>
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          + Create key
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="panel">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="muted">No API keys yet. Create one to get started.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Status</th>
                  <th>Scopes</th>
                  <th>Quota</th>
                  <th>Rate</th>
                  <th>Expires</th>
                  <th>Last used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="strong">
                      {k.label}
                      <div className="muted small mono">{k.keyPrefix}…</div>
                    </td>
                    <td>
                      <KeyStatusBadge k={k} />
                    </td>
                    <td className="muted small">{k.scopes.join(", ")}</td>
                    <td>
                      {k.quotaTotal === null
                        ? `${k.quotaUsed} / ∞`
                        : `${k.quotaUsed} / ${k.quotaTotal}`}
                    </td>
                    <td className="muted">{k.rateLimitPerMin}/min</td>
                    <td className="muted small">{fmtDate(k.expiresAt)}</td>
                    <td className="muted small">{fmtRelative(k.lastUsedAt)}</td>
                    <td>
                      <div className="row" style={{ gap: "0.4rem", flexWrap: "nowrap" }}>
                        <button className="btn ghost small" onClick={() => setEditing(k)}>
                          Edit
                        </button>
                        <button className="btn ghost small" onClick={() => toggleStatus(k)}>
                          {k.status === "ACTIVE" ? "Deactivate" : "Activate"}
                        </button>
                        <button className="btn danger small" onClick={() => remove(k)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateKeyModal
          onClose={() => setShowCreate(false)}
          onCreated={(k) => {
            setShowCreate(false);
            setCreated(k);
            load();
          }}
        />
      )}

      {created && <RevealModal created={created} onClose={() => setCreated(null)} />}

      {editing && (
        <EditKeyModal
          apiKey={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ScopePicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="checks">
      {SCOPES.map((s) => (
        <label key={s}>
          <input
            type="checkbox"
            checked={value.includes(s)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))
            }
          />
          {s}
        </label>
      ))}
    </div>
  );
}

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (k: CreatedKey) => void;
}) {
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<string[]>([...SCOPES]);
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [neverExpires, setNeverExpires] = useState(false);
  const [rateLimitPerMin, setRate] = useState(20);
  const [quotaTotal, setQuota] = useState(10000);
  const [unlimited, setUnlimited] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) return setError("A label is required.");
    if (scopes.length === 0) return setError("Select at least one scope.");
    setError("");
    setBusy(true);
    const body: CreateKeyInput = {
      label: label.trim(),
      scopes,
      expiresInDays: neverExpires ? null : expiresInDays,
      rateLimitPerMin,
      quotaTotal: unlimited ? null : quotaTotal,
    };
    try {
      onCreated(await api.createKey(body));
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Create API key" onClose={onClose}>
      <p className="muted small" style={{ marginBottom: "1rem" }}>
        Defaults are pre-filled; adjust as needed. The full key is shown once.
      </p>
      <form onSubmit={submit}>
        <label className="field">
          <span>Label</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. ticket-router (prod)"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Scopes (question types)</span>
          <ScopePicker value={scopes} onChange={setScopes} />
        </label>
        <div className="grid cols-2">
          <label className="field">
            <span>Expires in (days)</span>
            <input
              type="number"
              min={1}
              value={expiresInDays}
              disabled={neverExpires}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
            />
            <label className="checks" style={{ marginTop: "0.5rem" }}>
              <span>
                <input
                  type="checkbox"
                  checked={neverExpires}
                  onChange={(e) => setNeverExpires(e.target.checked)}
                />{" "}
                Never expires
              </span>
            </label>
          </label>
          <label className="field">
            <span>Rate limit (req/min)</span>
            <input
              type="number"
              min={1}
              value={rateLimitPerMin}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          <span>Quota (total requests)</span>
          <input
            type="number"
            min={1}
            value={quotaTotal}
            disabled={unlimited}
            onChange={(e) => setQuota(Number(e.target.value))}
          />
          <label className="checks" style={{ marginTop: "0.5rem" }}>
            <span>
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />{" "}
              Unlimited
            </span>
          </label>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Creating…" : "Create key"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RevealModal({
  created,
  onClose,
}: {
  created: CreatedKey;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <Modal title="Key created" onClose={onClose}>
      <p className="muted small" style={{ marginBottom: "0.75rem" }}>
        Copy this now — it is shown <strong>only once</strong> and cannot be
        retrieved later.
      </p>
      <div className="keyreveal">{created.key}</div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={copy}>
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

function EditKeyModal({
  apiKey,
  onClose,
  onSaved,
}: {
  apiKey: ApiKey;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(apiKey.label);
  const [scopes, setScopes] = useState<string[]>(apiKey.scopes);
  const [rateLimitPerMin, setRate] = useState(apiKey.rateLimitPerMin);
  const [unlimited, setUnlimited] = useState(apiKey.quotaTotal === null);
  const [quotaTotal, setQuota] = useState(apiKey.quotaTotal ?? 10000);
  const [extendDays, setExtendDays] = useState(0);
  const [resetQuota, setResetQuota] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (scopes.length === 0) return setError("Select at least one scope.");
    setError("");
    setBusy(true);
    const body: PatchKeyInput = {
      label: label.trim(),
      scopes,
      rateLimitPerMin,
      quotaTotal: unlimited ? null : quotaTotal,
      resetQuota: resetQuota || undefined,
      extendDays: extendDays > 0 ? extendDays : undefined,
    };
    try {
      await api.patchKey(apiKey.id, body);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={`Edit "${apiKey.label}"`} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="field">
          <span>Scopes</span>
          <ScopePicker value={scopes} onChange={setScopes} />
        </label>
        <div className="grid cols-2">
          <label className="field">
            <span>Rate limit (req/min)</span>
            <input
              type="number"
              min={1}
              value={rateLimitPerMin}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <label className="field">
            <span>Extend expiry (days)</span>
            <input
              type="number"
              min={0}
              value={extendDays}
              onChange={(e) => setExtendDays(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="field">
          <span>Quota (total requests)</span>
          <input
            type="number"
            min={1}
            value={quotaTotal}
            disabled={unlimited}
            onChange={(e) => setQuota(Number(e.target.value))}
          />
          <div className="checks" style={{ marginTop: "0.5rem" }}>
            <label>
              <input
                type="checkbox"
                checked={unlimited}
                onChange={(e) => setUnlimited(e.target.checked)}
              />
              Unlimited
            </label>
            <label>
              <input
                type="checkbox"
                checked={resetQuota}
                onChange={(e) => setResetQuota(e.target.checked)}
              />
              Reset used count to 0
            </label>
          </div>
        </label>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
