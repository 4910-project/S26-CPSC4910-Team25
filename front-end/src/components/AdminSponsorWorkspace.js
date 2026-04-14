import React, { useEffect, useState } from "react";

const ADMIN_API = "http://localhost:8001/admin";
const BACKEND_BASE = "http://localhost:8001";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function StatusPill({ children, background = "#eef2ff", color = "#3730a3" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        background,
        color,
      }}
    >
      {children}
    </span>
  );
}

export default function AdminSponsorWorkspace({ token, sponsor, onClose }) {
  const sponsorId = sponsor?.id;
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [accountData, setAccountData] = useState(null);

  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportData, setReportData] = useState(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    setAccountData(null);
    setReportData(null);
    setAccountError("");
    setReportError("");
    setSelectedDriverId("");
  }, [sponsorId]);

  useEffect(() => {
    if (!sponsorId) return;

    let cancelled = false;

    (async () => {
      setAccountLoading(true);
      setAccountError("");
      try {
        const res = await fetch(`${ADMIN_API}/sponsors/${sponsorId}/account`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load sponsor account");
        if (!cancelled) setAccountData(data);
      } catch (err) {
        if (!cancelled) {
          setAccountError(err?.message || "Unknown error");
          setAccountData(null);
        }
      } finally {
        if (!cancelled) setAccountLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sponsorId, token]);

  useEffect(() => {
    if (!sponsorId) return;
    if (selectedDriverId && !accountData?.drivers?.some((driver) => String(driver.driverId) === String(selectedDriverId))) {
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedDriverId) params.set("driverId", selectedDriverId);

    (async () => {
      setReportLoading(true);
      setReportError("");
      try {
        const url = `${ADMIN_API}/sponsors/${sponsorId}/reports/points${
          params.toString() ? `?${params.toString()}` : ""
        }`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load sponsor report");
        if (!cancelled) setReportData(data);
      } catch (err) {
        if (!cancelled) {
          setReportError(err?.message || "Unknown error");
          setReportData(null);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accountData?.drivers, selectedDriverId, sponsorId, token]);

  const handleExport = async (kind) => {
    if (!sponsorId) return;

    const params = new URLSearchParams();
    if (selectedDriverId) params.set("driverId", selectedDriverId);

    const url = `${ADMIN_API}/sponsors/${sponsorId}/reports/points.${kind}${
      params.toString() ? `?${params.toString()}` : ""
    }`;

    kind === "csv" ? setExportingCsv(true) : setExportingPdf(true);
    setReportError("");
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        let message = `Failed to export ${kind.toUpperCase()}`;
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // Ignore non-JSON error responses.
        }
        throw new Error(message);
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const fileSuffix = selectedDriverId ? `driver-${selectedDriverId}` : "all-drivers";
      link.href = downloadUrl;
      link.download = `admin-sponsor-report-${sponsorId}-${fileSuffix}.${kind}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setReportError(err?.message || "Unknown error");
    } finally {
      kind === "csv" ? setExportingCsv(false) : setExportingPdf(false);
    }
  };

  const snapshot = accountData?.sponsor || sponsor;
  const drivers = accountData?.drivers || [];
  const applications = accountData?.applications || [];
  const counts = accountData?.counts || {
    totalDrivers: 0,
    activeDrivers: 0,
    probationDrivers: 0,
    droppedDrivers: 0,
    pendingApplications: 0,
  };

  return (
    <div
      style={{
        marginBottom: 18,
        border: "1px solid #d1d5db",
        borderRadius: 16,
        background: "var(--card, #fff)",
        boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: 20,
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {snapshot?.orgPhotoUrl ? (
            <img
              src={`${BACKEND_BASE}${snapshot.orgPhotoUrl}`}
              alt={`${snapshot.name} logo`}
              style={{ width: 64, height: 64, borderRadius: 14, objectFit: "cover", border: "1px solid #e5e7eb" }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 14,
                background: "#e5e7eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
              }}
            >
              🏢
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase" }}>
              Sponsor Workspace
            </div>
            <h2 style={{ margin: "4px 0 6px", fontSize: 24 }}>{snapshot?.name || "Sponsor Account"}</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill>{snapshot?.status || "Unknown"}</StatusPill>
              <StatusPill background={snapshot?.acceptingDrivers ? "#dcfce7" : "#fee2e2"} color={snapshot?.acceptingDrivers ? "#166534" : "#991b1b"}>
                {snapshot?.acceptingDrivers ? "Accepting Drivers" : "Locked"}
              </StatusPill>
              {snapshot?.flagged ? <StatusPill background="#fee2e2" color="#991b1b">Flagged</StatusPill> : null}
              <StatusPill background="#f3f4f6" color="#111827">Admin View Only</StatusPill>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "transparent",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Close Workspace
        </button>
      </div>

      <div style={{ padding: 20 }}>
        {(accountError || reportError) && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#fef2f2",
              color: "#991b1b",
            }}
          >
            {accountError || reportError}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 18 }}>
          {[
            { label: "Total Drivers", value: counts.totalDrivers },
            { label: "Active", value: counts.activeDrivers },
            { label: "Probation", value: counts.probationDrivers },
            { label: "Dropped", value: counts.droppedDrivers },
            { label: "Pending Apps", value: counts.pendingApplications },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 14,
                background: "#f8fafc",
              }}
            >
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          <section style={panelStyle}>
            <h3 style={sectionTitleStyle}>Account Details</h3>
            {accountLoading && !accountData ? <p style={mutedStyle}>Loading sponsor account...</p> : null}
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={labelStyle}>Contact Name</div>
                <div>{snapshot?.contactName || "—"}</div>
              </div>
              <div>
                <div style={labelStyle}>Contact Email</div>
                <div>{snapshot?.contactEmail || "—"}</div>
              </div>
              <div>
                <div style={labelStyle}>Contact Phone</div>
                <div>{snapshot?.contactPhone || "—"}</div>
              </div>
              <div>
                <div style={labelStyle}>Address</div>
                <div>{snapshot?.address || "—"}</div>
              </div>
              <div>
                <div style={labelStyle}>Admin Note</div>
                <div>{snapshot?.adminNote || "—"}</div>
              </div>
            </div>
          </section>

          <section style={panelStyle}>
            <h3 style={sectionTitleStyle}>Applications</h3>
            {accountLoading && !accountData ? <p style={mutedStyle}>Loading applications...</p> : null}
            {!accountLoading && applications.length === 0 ? <p style={mutedStyle}>No recent sponsor applications.</p> : null}
            <div style={{ display: "grid", gap: 10 }}>
              {applications.slice(0, 6).map((application) => (
                <div
                  key={application.applicationId}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>{application.email}</strong>
                    <StatusPill background="#eff6ff" color="#1d4ed8">
                      {application.status}
                    </StatusPill>
                  </div>
                  <div style={{ ...mutedStyle, marginTop: 6 }}>Applied {formatDate(application.appliedAt)}</div>
                  {application.decisionMessage ? (
                    <div style={{ marginTop: 8, fontSize: 13 }}>{application.decisionMessage}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </div>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={sectionTitleStyle}>Reports</h3>
              <p style={{ ...mutedStyle, marginTop: 0 }}>
                View the sponsor report across all drivers or limit it to one individual driver, then export the same filtered dataset.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                style={{
                  minWidth: 220,
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: "1px solid #d1d5db",
                  background: "#fff",
                }}
              >
                <option value="">All drivers</option>
                {drivers.map((driver) => (
                  <option key={driver.driverId} value={driver.driverId}>
                    {driver.email}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={exportingCsv}
                onClick={() => handleExport("csv")}
                style={secondaryButtonStyle}
              >
                {exportingCsv ? "Preparing CSV..." : "Export CSV"}
              </button>

              <button
                type="button"
                disabled={exportingPdf}
                onClick={() => handleExport("pdf")}
                style={primaryButtonStyle}
              >
                {exportingPdf ? "Preparing PDF..." : "Export PDF"}
              </button>
            </div>
          </div>

          {reportLoading && !reportData ? <p style={mutedStyle}>Loading report preview...</p> : null}

          {reportData ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 18 }}>
                <div style={summaryCardStyle}>
                  <div style={labelStyle}>Filter</div>
                  <div style={{ fontWeight: 700 }}>{reportData.filter?.label || "All drivers"}</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={labelStyle}>Drivers in Report</div>
                  <div style={{ fontWeight: 700 }}>{reportData.summary?.totalDrivers ?? 0}</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={labelStyle}>Awarded</div>
                  <div style={{ fontWeight: 700 }}>{reportData.summary?.totalAwarded ?? 0} pts</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={labelStyle}>Reversed</div>
                  <div style={{ fontWeight: 700 }}>{reportData.summary?.totalReversed ?? 0} pts</div>
                </div>
                <div style={summaryCardStyle}>
                  <div style={labelStyle}>Current Total</div>
                  <div style={{ fontWeight: 700 }}>{reportData.summary?.currentTotal ?? 0} pts</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
                <div>
                  <h4 style={subheadingStyle}>Driver Summary</h4>
                  {!reportData.driverRows?.length ? (
                    <p style={mutedStyle}>No drivers matched the selected filter.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {reportData.driverRows.map((row) => (
                        <div
                          key={row.driverId}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: 12,
                            background: "#fff",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <strong>{row.email}</strong>
                            <StatusPill background="#f3f4f6" color="#111827">
                              {row.driverStatus}
                            </StatusPill>
                          </div>
                          <div style={{ ...mutedStyle, marginTop: 8 }}>
                            Current: {row.currentPoints} pts · Awarded: {row.totalAwarded} pts · Reversed: {row.totalReversed} pts · Net: {row.netChange} pts
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 style={subheadingStyle}>Recent Point Activity</h4>
                  {!reportData.historyRows?.length ? (
                    <p style={mutedStyle}>No point history is available for this filter.</p>
                  ) : (
                    <div style={{ display: "grid", gap: 10 }}>
                      {reportData.historyRows.slice(0, 8).map((row, index) => (
                        <div
                          key={`${row.occurredAt}-${row.email}-${index}`}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: 12,
                            background: "#fff",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <strong>{row.email}</strong>
                            <span style={{ fontWeight: 700, color: Number(row.pointsChange || 0) >= 0 ? "#166534" : "#991b1b" }}>
                              {Number(row.pointsChange || 0) >= 0 ? "+" : ""}
                              {row.pointsChange} pts
                            </span>
                          </div>
                          <div style={{ ...mutedStyle, marginTop: 6 }}>{formatDate(row.occurredAt)}</div>
                          <div style={{ marginTop: 6, fontSize: 13 }}>{row.reason || "No reason provided"}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section style={{ ...panelStyle, marginTop: 16 }}>
          <h3 style={sectionTitleStyle}>Drivers</h3>
          {accountLoading && !accountData ? <p style={mutedStyle}>Loading drivers...</p> : null}
          {!accountLoading && drivers.length === 0 ? <p style={mutedStyle}>This sponsor does not have any assigned drivers.</p> : null}
          {drivers.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {drivers.slice(0, 8).map((driver) => (
                <div
                  key={driver.driverId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: 12,
                    background: "#fff",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{driver.email}</strong>
                    <div style={{ ...mutedStyle, marginTop: 6 }}>
                      Joined: {formatDate(driver.joinedOn)} · Current points: {driver.currentPoints ?? 0}
                    </div>
                    {driver.adminNote ? <div style={{ marginTop: 6, fontSize: 13 }}>Note: {driver.adminNote}</div> : null}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {driver.flagged ? <StatusPill background="#fee2e2" color="#991b1b">Flagged</StatusPill> : null}
                    <StatusPill background="#f3f4f6" color="#111827">{driver.status}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

const panelStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: 16,
  background: "#f8fafc",
};

const sectionTitleStyle = {
  margin: "0 0 10px",
  fontSize: 18,
};

const subheadingStyle = {
  margin: "0 0 10px",
  fontSize: 15,
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const mutedStyle = {
  color: "#6b7280",
  fontSize: 13,
};

const primaryButtonStyle = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "none",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle = {
  padding: "9px 16px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};

const summaryCardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "#fff",
};
