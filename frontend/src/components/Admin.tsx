import { useState, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  adminLogin,
  getAdminPassword,
  clearAdminPassword,
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  testConnection,
} from "../api/client";

// --- Types ---

interface ConnectionEntry {
  name: string;
  [key: string]: unknown;
}

interface ConnectionsMap {
  [type: string]: ConnectionEntry[];
}

// --- Connection type definitions ---

interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "textarea" | "boolean" | "file";
  placeholder?: string;
  help?: string;
}

interface ConnectionTypeDef {
  yamlType: string;
  label: string;
  fields: FieldDef[];
}

const CONNECTION_TYPES: ConnectionTypeDef[] = [
  {
    yamlType: "google_cloud_platform",
    label: "BigQuery",
    fields: [
      { key: "project_id", label: "Project ID", required: true, placeholder: "my-gcp-project" },
      { key: "location", label: "Location", required: true, placeholder: "US" },
      { key: "service_account_file", label: "Service Account File", type: "text", placeholder: "/path/to/credentials.json", help: "Path to service account JSON file" },
      { key: "service_account_json", label: "Service Account JSON", type: "textarea", placeholder: '{\n  "type": "service_account",\n  ...\n}', help: "Paste service account JSON directly" },
      { key: "use_application_default_credentials", label: "Use Application Default Credentials", type: "boolean", help: "Use ADC from gcloud auth" },
    ],
  },
  {
    yamlType: "duckdb",
    label: "DuckDB",
    fields: [
      { key: "path", label: "Database Path", required: true, placeholder: "/path/to/database.db" },
      { key: "read_only", label: "Read Only", type: "boolean" },
    ],
  },
  {
    yamlType: "postgres",
    label: "PostgreSQL",
    fields: [
      { key: "host", label: "Host", required: true, placeholder: "localhost" },
      { key: "port", label: "Port", required: true, placeholder: "5432" },
      { key: "database", label: "Database", required: true, placeholder: "mydb" },
      { key: "username", label: "Username", required: true, placeholder: "user" },
      { key: "password", label: "Password", placeholder: "password" },
      { key: "ssl_mode", label: "SSL Mode", placeholder: "disable" },
    ],
  },
];

function getTypeDef(yamlType: string): ConnectionTypeDef | undefined {
  return CONNECTION_TYPES.find((t) => t.yamlType === yamlType);
}

function getTypeLabel(yamlType: string): string {
  return getTypeDef(yamlType)?.label ?? yamlType;
}

// --- Shared input classes ---

const inputClass =
  "w-full px-2.5 py-1.5 text-[13px] font-mono rounded border bg-white text-[#1a1a1a] border-[#d1d5db] outline-none focus:border-[#6366f1] focus:ring-1 focus:ring-[#6366f1]";
const labelClass = "block text-[11px] font-medium uppercase tracking-wider text-[#6b7280] mb-1";
const btnPrimary =
  "px-3 py-1.5 text-[13px] font-medium rounded bg-[#6366f1] text-white cursor-pointer disabled:opacity-50 hover:bg-[#4f46e5] border-0";
const btnSecondary =
  "px-3 py-1.5 text-[13px] rounded border border-[#d1d5db] bg-white text-[#374151] cursor-pointer hover:bg-[#f9fafb]";
const btnDanger =
  "px-2.5 py-1 text-[12px] rounded border border-[#fca5a5] bg-white text-[#dc2626] cursor-pointer hover:bg-[#fef2f2] disabled:opacity-50";
const btnGhost =
  "px-2.5 py-1 text-[12px] rounded border border-[#d1d5db] bg-white text-[#6b7280] cursor-pointer hover:bg-[#f9fafb]";

// --- Structured field editor for known connection types ---

function StructuredFieldEditor({
  typeDef,
  fields,
  onChange,
}: {
  typeDef: ConnectionTypeDef;
  fields: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
}) {
  const handleChange = (key: string, value: unknown) => {
    onChange({ ...fields, [key]: value });
  };

  return (
    <div className="space-y-3">
      {typeDef.fields.map((fd) => (
        <div key={fd.key}>
          <label className={labelClass}>
            {fd.label}
            {fd.required && <span className="text-[#dc2626] ml-0.5">*</span>}
          </label>
          {fd.type === "boolean" ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fields[fd.key] === true}
                onChange={(e) => handleChange(fd.key, e.target.checked)}
                className="w-4 h-4 accent-[#6366f1]"
              />
              <span className="text-[13px] text-[#374151]">{fd.help ?? fd.label}</span>
            </label>
          ) : fd.type === "textarea" ? (
            <>
              <textarea
                value={(fields[fd.key] as string) ?? ""}
                onChange={(e) => handleChange(fd.key, e.target.value)}
                placeholder={fd.placeholder}
                rows={4}
                className={inputClass + " resize-y"}
              />
              {fd.help && <p className="text-[11px] text-[#9ca3af] mt-0.5">{fd.help}</p>}
            </>
          ) : (
            <>
              <input
                type="text"
                value={(fields[fd.key] as string) ?? ""}
                onChange={(e) => handleChange(fd.key, e.target.value)}
                placeholder={fd.placeholder}
                className={inputClass}
              />
              {fd.help && <p className="text-[11px] text-[#9ca3af] mt-0.5">{fd.help}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Key-Value field editor for unknown connection types ---

function KeyValueEditor({
  fields,
  onChange,
}: {
  fields: Record<string, unknown>;
  onChange: (fields: Record<string, unknown>) => void;
}) {
  const entries = Object.entries(fields);

  const handleKeyChange = (oldKey: string, newKey: string) => {
    const newFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      newFields[k === oldKey ? newKey : k] = v;
    }
    onChange(newFields);
  };

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...fields, [key]: value });
  };

  const handleRemove = (key: string) => {
    const newFields = { ...fields };
    delete newFields[key];
    onChange(newFields);
  };

  const handleAdd = () => {
    let newKey = "key";
    let i = 1;
    while (newKey in fields) {
      newKey = `key${i}`;
      i++;
    }
    onChange({ ...fields, [newKey]: "" });
  };

  return (
    <div className="space-y-2">
      {entries.map(([key, value], idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={key}
            onChange={(e) => handleKeyChange(key, e.target.value)}
            placeholder="key"
            className={"flex-1 " + inputClass}
          />
          <input
            type="text"
            value={String(value ?? "")}
            onChange={(e) => handleValueChange(key, e.target.value)}
            placeholder="value"
            className={"flex-[2] " + inputClass}
          />
          <button type="button" onClick={() => handleRemove(key)} className={btnGhost + " hover:text-[#dc2626] hover:border-[#fca5a5]"}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={handleAdd}
        className="px-2.5 py-1.5 text-[12px] text-[#6b7280] hover:text-[#374151] rounded border border-dashed border-[#d1d5db] hover:border-[#9ca3af] bg-transparent cursor-pointer"
      >
        + Add Field
      </button>
    </div>
  );
}

// --- Add Connection Form ---

function AddConnectionForm({
  onSave,
  onCancel,
}: {
  onSave: () => void;
  onCancel: () => void;
}) {
  const [selectedType, setSelectedType] = useState("");
  const [customType, setCustomType] = useState("");
  const [name, setName] = useState("");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCustom = selectedType === "__custom__";
  const effectiveYamlType = isCustom ? customType : selectedType;
  const typeDef = isCustom ? undefined : getTypeDef(selectedType);

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setFields({});
    setCustomType("");
  };

  const handleSubmit = async () => {
    const yamlType = effectiveYamlType.trim();
    if (!yamlType || !name.trim()) {
      setError("Type and name are required");
      return;
    }
    // Filter out empty values (keep booleans even if false)
    const cleanFields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "boolean" || (typeof v === "string" && v !== "")) cleanFields[k] = v;
    }
    setSaving(true);
    setError(null);
    try {
      await createConnection(yamlType, name.trim(), cleanFields);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded border border-[#d1d5db] bg-white p-4 space-y-3">
      <div className="text-[14px] font-medium text-[#111827]">New Connection</div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelClass}>Type</label>
          <select
            value={selectedType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select type...</option>
            {CONNECTION_TYPES.map((t) => (
              <option key={t.yamlType} value={t.yamlType}>
                {t.label}
              </option>
            ))}
            <option value="__custom__">Other...</option>
          </select>
        </div>
        {isCustom && (
          <div className="flex-1">
            <label className={labelClass}>YAML Type Key</label>
            <input
              type="text"
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              placeholder="e.g. mysql, snowflake"
              className={inputClass}
            />
          </div>
        )}
        <div className="flex-1">
          <label className={labelClass}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. my-database"
            className={inputClass}
          />
        </div>
      </div>

      {selectedType && (
        <div>
          <label className={labelClass}>Fields</label>
          {typeDef ? (
            <StructuredFieldEditor typeDef={typeDef} fields={fields} onChange={setFields} />
          ) : (
            <KeyValueEditor fields={fields} onChange={setFields} />
          )}
        </div>
      )}

      {error && (
        <div className="text-[12px] font-mono text-[#dc2626]">{error}</div>
      )}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={saving} className={btnPrimary}>
          {saving ? "Creating..." : "Create"}
        </button>
        <button onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Edit Connection Form ---

function EditConnectionForm({
  type,
  name,
  initialFields,
  onSave,
  onCancel,
}: {
  type: string;
  name: string;
  initialFields: Record<string, unknown>;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(initialFields);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeDef = getTypeDef(type);

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateConnection(type, name, fields);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pt-3 border-t border-[#e5e7eb] mt-3">
      {typeDef ? (
        <StructuredFieldEditor typeDef={typeDef} fields={fields} onChange={setFields} />
      ) : (
        <KeyValueEditor fields={fields} onChange={setFields} />
      )}
      {error && (
        <div className="text-[12px] font-mono text-[#dc2626]">{error}</div>
      )}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving} className={btnPrimary}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Connection Item ---

function ConnectionItem({
  type,
  conn,
  onRefresh,
}: {
  type: string;
  conn: ConnectionEntry;
  onRefresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(conn)) {
    if (k !== "name") fields[k] = String(v);
  }

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testConnection(type, conn.name);
      setTestResult({ ok: result.ok });
    } catch (err) {
      setTestResult({ error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteConnection(type, conn.name);
      onRefresh();
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="rounded border border-[#e5e7eb] bg-white px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium font-mono text-[#111827]">{conn.name}</div>
          {!editing && Object.keys(fields).length > 0 && (
            <div className="mt-1.5 space-y-0.5">
              {Object.entries(fields).map(([k, v]) => (
                <div key={k} className="text-[12px] font-mono text-[#9ca3af]">
                  <span className="text-[#6b7280]">{k}</span>
                  {": "}
                  {v}
                </div>
              ))}
            </div>
          )}
        </div>
        {!editing && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={handleTest} disabled={testing} className={btnGhost + " disabled:opacity-50"}>
              {testing ? "Testing..." : "Test"}
            </button>
            <button onClick={() => setEditing(true)} className={btnGhost}>
              Edit
            </button>
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className={btnGhost}>
                Delete
              </button>
            ) : (
              <button onClick={handleDelete} disabled={deleting} className={btnDanger}>
                {deleting ? "Deleting..." : "Confirm"}
              </button>
            )}
          </div>
        )}
      </div>

      {testResult && (
        <div
          className="mt-2 text-[12px] font-mono px-2.5 py-1.5 rounded"
          style={{
            color: testResult.ok ? "#059669" : "#dc2626",
            background: testResult.ok ? "#ecfdf5" : "#fef2f2",
          }}
        >
          {testResult.ok ? "Connection successful" : testResult.error}
        </div>
      )}

      {editing && (
        <EditConnectionForm
          type={type}
          name={conn.name}
          initialFields={fields}
          onSave={() => { setEditing(false); onRefresh(); }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// --- Connections Manager ---

function ConnectionsManager({ onLogout }: { onLogout: () => void }) {
  const [connections, setConnections] = useState<ConnectionsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listConnections();
      setConnections(data.connections);
    } catch (err) {
      if (err instanceof Error && err.message.includes("401")) {
        clearAdminPassword();
        onLogout();
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  const handleLogout = () => {
    clearAdminPassword();
    onLogout();
  };

  const typeEntries = connections ? Object.entries(connections) : [];

  return (
    <div className="min-h-screen bg-[#f9fafb] text-[#111827]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#111827]">Connections</h1>
            <p className="text-[12px] mt-0.5 text-[#9ca3af]">
              Manage database connections in .bruin.yml
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[12px] no-underline text-[#6b7280] hover:text-[#374151]">
              Dashboards
            </Link>
            <button onClick={handleLogout} className={btnGhost}>
              Logout
            </button>
          </div>
        </div>

        {loading && (
          <div className="text-[13px] text-[#9ca3af]">Loading connections...</div>
        )}

        {error && (
          <div className="text-[13px] font-mono text-[#dc2626] mb-4">{error}</div>
        )}

        {!loading && !error && (
          <>
            {typeEntries.length === 0 && !showAdd && (
              <div className="border border-dashed border-[#d1d5db] rounded px-6 py-10 text-center mb-6">
                <p className="text-[13px] text-[#6b7280] mb-1">No connections configured</p>
                <p className="text-[12px] text-[#9ca3af]">Add a connection to get started.</p>
              </div>
            )}

            {typeEntries.map(([type, conns]) => (
              <div key={type} className="mb-6">
                <div className="text-[11px] font-medium font-mono uppercase tracking-wider text-[#9ca3af] mb-2">
                  {getTypeLabel(type)}
                  <span className="ml-1.5 normal-case tracking-normal text-[#d1d5db]">({type})</span>
                </div>
                <div className="space-y-2">
                  {conns.map((conn) => (
                    <ConnectionItem
                      key={`${type}-${conn.name}`}
                      type={type}
                      conn={conn}
                      onRefresh={loadConnections}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-6">
              {showAdd ? (
                <AddConnectionForm
                  onSave={() => { setShowAdd(false); loadConnections(); }}
                  onCancel={() => setShowAdd(false)}
                />
              ) : (
                <button onClick={() => setShowAdd(true)} className={btnPrimary}>
                  Add Connection
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// --- Login Form ---

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await adminLogin(password);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f9fafb]">
      <div className="w-full max-w-[360px] px-4">
        <div className="text-center mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-[#111827]">Admin</h1>
          <p className="text-[12px] mt-1 text-[#9ca3af]">Enter password to manage connections</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className={"w-full px-3 py-2 text-[14px] " + inputClass}
          />
          {error && (
            <div className="text-[12px] font-mono text-[#dc2626]">{error}</div>
          )}
          <button type="submit" disabled={loading} className={btnPrimary + " w-full py-2"}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
        <div className="text-center mt-4">
          <Link to="/" className="text-[12px] no-underline text-[#9ca3af] hover:text-[#6b7280]">
            Back to Dashboards
          </Link>
        </div>
      </div>
    </div>
  );
}

// --- Admin Page ---

export function Admin() {
  const [authenticated, setAuthenticated] = useState(!!getAdminPassword());

  if (!authenticated) {
    return <LoginForm onLogin={() => setAuthenticated(true)} />;
  }

  return <ConnectionsManager onLogout={() => setAuthenticated(false)} />;
}
