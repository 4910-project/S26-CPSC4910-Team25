import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8001";

export default function SponsorRules({ token }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newRule, setNewRule] = useState({
    name: "",
    points: 0,
    active: true,
  });

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  // Debug: confirm token is actually arriving
  useEffect(() => {
    console.log("SponsorRules token:", token);
  }, [token]);

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => String(r.name || "").toLowerCase().includes(q));
  }, [rules, query]);

  async function apiFetch(path, options = {}) {
    setError("");
    setNotice("");

    if (!token) {
      throw new Error("Missing token (you may need to log in again).");
    }

    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };

    // Only set JSON headers when sending a body
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    // Try to parse JSON, fall back to text
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      // Your backend often returns { ok:false, error:"..." }
      const msg =
        data?.message ||
        data?.error ||
        `Request failed (${res.status})`;

      // Log full context for debugging
      console.log("API error:", {
        path,
        status: res.status,
        data,
      });

      throw new Error(msg);
    }

    return data;
  }

  async function loadRules() {
    setLoading(true);
    try {
      const data = await apiFetch("/sponsor/rules", { method: "GET" });
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load rules");
      setRules([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Load once when page opens (and again if token changes)
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function addRule() {
    try {
      if (!newRule.name.trim()) {
        setError("Rule name is required.");
        return;
      }

      await apiFetch("/sponsor/rules", {
        method: "POST",
        body: JSON.stringify({
          name: newRule.name.trim(),
          points: Number(newRule.points) || 0,
          active: !!newRule.active,
        }),
      });

      setNotice("Rule created.");
      setNewRule({ name: "", points: 0, active: true });
      await loadRules();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to create rule");
    }
  }

  async function deleteRule(id) {
    if (!window.confirm("Delete this rule?")) return;
    try {
      await apiFetch(`/sponsor/rules/${id}`, { method: "DELETE" });
      setNotice("Rule deleted.");
      await loadRules();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to delete rule");
    }
  }

  async function toggleActive(rule) {
    try {
      await apiFetch(`/sponsor/rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({
          ...rule,
          active: !rule.active,
        }),
      });

      setNotice(rule.active ? "Rule set to inactive." : "Rule set to active.");
      await loadRules();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to update rule");
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
      <h2>Sponsor Behavior Rules</h2>
      <p style={{ color: "#6b7280" }}>
        Create and manage rules that award/deduct driver points.
      </p>

      {/* Status messages */}
      {(error || notice) && (
        <div style={{ marginTop: 12 }}>
          {error && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #fca5a5",
                background: "#fee2e2",
                color: "#991b1b",
                marginBottom: 10,
              }}
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              style={{
                padding: 10,
                borderRadius: 10,
                border: "1px solid #86efac",
                background: "#dcfce7",
                color: "#166534",
              }}
            >
              {notice}
            </div>
          )}
        </div>
      )}

      {/* Create Rule */}
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <input
          placeholder="Rule name"
          value={newRule.name}
          onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
          style={{ flex: 2, padding: 10 }}
        />
        <input
          type="number"
          placeholder="Points"
          value={newRule.points}
          onChange={(e) =>
            setNewRule({ ...newRule, points: Number(e.target.value) })
          }
          style={{ width: 120, padding: 10 }}
        />
        <button onClick={addRule} style={{ padding: "10px 14px" }}>
          Add
        </button>
      </div>

      {/* Search */}
      <div style={{ marginTop: 14 }}>
        <input
          placeholder="Search rules…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: "100%", padding: 10 }}
        />
      </div>

      {/* Rules List */}
      <div style={{ marginTop: 20 }}>
        {loading ? (
          <p>Loading…</p>
        ) : filteredRules.length === 0 ? (
          <p>No rules yet.</p>
        ) : (
          <table
            width="100%"
            cellPadding="10"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                <th>Name</th>
                <th>Points</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                  <td>{r.name}</td>
                  <td>{r.points}</td>
                  <td>
                    <button onClick={() => toggleActive(r)}>
                      {r.active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td>
                    <button onClick={() => deleteRule(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}