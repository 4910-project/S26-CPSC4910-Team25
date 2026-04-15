import React, { useState, useEffect, useCallback } from "react";

const API_BASE = "/api/profile";
const SPONSOR_API = "/sponsor";

function ApplyModal({ sponsor, token, onClose}) {
    const [form, setForm] = useState({ statement: ""});
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async () => {
        if (!form.statement.trim()) return;
        setSubmitting(true);
        setError("");
        try {
            const res = await fetch(`/api/apps`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    sponsor_id: sponsor.sponsorId,
                    statement: form.statement,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "failed to submit application");
            setSubmitted(true);
            setTimeout(() => onClose(data), 2200);
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting (false);
        }
    };

    return (
        <div
        onClick={(e) => e.target === e.currentTarget && onClose()}
        style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 24,
        }}
        >
            <div style={{
                background: "var(--card, #fff)",
                border: "1px solid var(--border, #e5e7eb)",
                borderRadius: 16,
                width: "100%", maxWidth: 480,
                overflow: "hidden",
                boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}>
                <div style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid var(--border, #e5e7eb)",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text, #111)" }}>
                        Apply to {sponsor.sponsorName}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none", border: "none",
                            fontSize: 18, cursor: "pointer",
                            color: "var(--text-muted, #9ca3af)", lineHeight: 1,
                        }}
                    >
                        x
                    </button>
                </div>

            {submitted ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                    <div style={{
                        width: 52, height: 52, borderRadius: "50%",
                        background: "#d1fae5", color: "#065f46",
                        fontSize: 22, display: "flex", alignItems: "center",
                        justifyContent: "center", margin: "0 auto 16px",
                    }}>✓</div>
                    <div style = {{ fontWeight: 700, fontSize: 17, color: "var(--text, #111)", marginBottom: 8 }}>
                        Application Sent!
                    </div>
                    <div style={{fontSize: 14, color: "var(--text-muted, #6b7280)", lineHeight: 1.6 }}>
                        Your application to {sponsor.sponsorName} has been submitted.
                    </div>
                </div>
            ) : (
                <>
                <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{
                            background: "var(--bg, #f9fafb)",
                            border: "1px solid var(--border, #e5e7eb)",
                            borderRadius: 10, padding: "12px 16px",
                            display: "flex", gap: 24, flexWrap: "wrap",
                        }}>
                            {sponsor.point_value && (
                                <div>
                                    <div style={{ fontSize: 11, color: "var(--text-muted, #6b7280)", textTransform: "uppercase", letterSpacing: "0.08em" }}> Point Value</div>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text, #111)", marginTop: 2}}>
                                        ${parseFloat(sponsor.point_value).toFixed(2)} / pt 
                                    </div>
                                </div>
                            )}
                        {sponsor.city && sponsor.state && (
                            <div>
                                <div style={{ fontSize: 11, color: "var(--text-muted, #6b7280)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Location</div>
                                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text, #111)", marginTop: 2}}>
                                    {sponsor.city}, {sponsor.state}
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label style={{
                            display: "block", fontSize: 13, fontWeight: 600,
                            color: "var(--text, #111)", marginBottom: 6,
                        }}>
                            Why do you want to join this sponsor? *
                        </label>
                        <textarea
                            value={form.statement}
                            onChange={(e) => setForm({ ...form, statement: e.target.value })}
                            rows={4}
                            style={{
                                width: "100%", boxSizing: "border-box",
                                padding: "10px 14px", borderRadius: 8,
                                border: "1px solid var(--border, #d1d5db)",
                                background: "var(--card, #fff)",
                                color: "var(--text, #111)",
                                fontSize: 14, resize: "vertical", lineHeight: 1.5,
                                outline: "none", fontFamily: "inherit",
                            }}
                        />
                        </div>

                        {error && (
                            <div style={{
                                background: "#fee2e2", color: "#991b1b",
                                borderRadius: 8, padding: "10px 14px", fontSize: 13,
                            }}>
                                {error}
                            </div>
                        )}
                            <div style={{
                                padding: "16px 24px",
                                borderTop: "1px solid var(--border, #e5e7eb)",
                                display: "flex", justifyContent: "flex-end", gap: 10,
                            }}>
                                <button
                                    onClick={onClose}
                                    style={{
                                        padding: "9px 20px", borderRadius: 8,
                                        border: "1px solid var(--border, #d1d5db)",
                                        background: "transparent", color: "var(--text-muted, #6b7280)",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={submitting || !form.statement.trim()}
                                    style={{
                                        padding: "9px 22px", borderRadius: 8,
                                        border: "none", background: "#4f46e5", color: "#fff",
                                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                                        opacity: (!form.statement.trim() || submitting) ? 0.5 : 1,
                                        transition: "opacity 0.15s",
                                    }}
                                >
                                    {submitting ? "Submitting..." : "Submit Application"}
                                </button>
                            </div>
                        </div>
                        </>
                    )}
                </div>
            </div>
        );
    }


export default function SponsorshipApply({ token }) {
    const [sponsors, setSponsors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [activeSponsor, setActiveSponsor] = useState(null);
    const [applied, setApplied] = useState({});

    const handleWithdraw = async (appId, sponsorId) => {
    try {
        const res = await fetch(`/api/apps/${appId}/cancel`, {
            headers: { Authorization: `Bearer ${token}` },
            method: "PATCH"
        });
        const data = await res.json();
        if (!res.ok) throw new Error (data.error || "Failed to withdraw application");
        setApplied(prev => {
            const updated = {...prev};
            delete updated[sponsorId];
            return updated;
        });
    } catch (err) {
        console.error(err);
    }
    };

    const fetchSponsors = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            const res = await fetch(`/api/driver/sponsors`, {
                headers: { Authorization: `Bearer ${token}` },
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to load sponsors");
            setSponsors(data.sponsors || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchSponsors();
    }, [fetchSponsors]);

    const fetchApplied = useCallback(async () => {
        try {
            const res = await fetch(`/api/driver/applications`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const appsData = await res.json();

            if (res.ok) {
                const appliedMap = {};
                (appsData.applications || [])
                    .filter(a => a.status === "PENDING" || a.status === "pending")
                    .forEach(a => {
                        appliedMap[Number(a.sponsor_id)] = a.applicationId;
                    });
                setApplied(appliedMap);
            }
        } catch (err) {
            console.error(err);
        }
    }, [token]);
    
    useEffect(() => {
        fetchApplied();
    }, [fetchApplied]);


    if (loading) return <p style={{ color: "var(--text-muted, #6b7280)" }}>Loading sponsors...</p>;
    if (error) return <div className="error-message">{error}</div>;
    if (sponsors.length === 0) return <p style={{ color: "var(--text-muted, #6b7280)" }}>No sponsors available right now.</p>;
    
    return (
        <>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {sponsors.map((sponsor) => {
                    const appId = applied[Number(sponsor.sponsorId)];
                    const isApplied = !!appId;
    
                    return (
                        <div
                            key={sponsor.sponsorId}
                            style={{
                                background: "var(--card, #fff)",
                                border: "1px solid var(--border, #e5e7eb)",
                                borderRadius: 12,
                                padding: "16px 20px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 16,
                                flexWrap: "wrap",
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text, #111)" }}>
                                    {sponsor.company_name}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-muted, #6b7280)", marginTop: 3}}>
                                    {[sponsor.sponsorName, sponsor.city && sponsor.state && `${sponsor.city}, ${sponsor.state}` ]
                                        .filter(Boolean).join(" · ")}
                                </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                                {sponsor.point_value && (
                                <span style={{
                                    fontSize: 12, fontWeight: 600,
                                    color: "#4f46e5",
                                    background: "#ede9fe",
                                    borderRadius: 20, padding: "3px 12px",
                                }}>
                                    ${parseFloat(sponsor.point_value).toFixed(2)} / pt
                                </span>
                                )}
                                <button
                                    onClick={() => !isApplied && setActiveSponsor(sponsor)}
                                    disabled={isApplied}
                                    style={{
                                        padding: "8px 18px", borderRadius: 8,
                                        border: "none",
                                        background: isApplied ? "var(--bg, #f3f4f6)" : "#4f46e5",
                                        color: isApplied ? "var(--text-muted, #9ca3af)" : "#fff",
                                        fontWeight: 600, fontSize: 13,
                                        cursor: isApplied ? "default" : "pointer",
                                        transition: "opacity 0.15s",
                                    }}
                                    onMouseEnter={e => { if (!isApplied) e.currentTarget.style.opacity = "0.85"; }}
                                    onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                                >
                                    {isApplied ? "✓ Applied" : "Apply Now"}
                                </button>
                            
                                {isApplied && (
                                    <button
                                        onClick={() => handleWithdraw(appId, Number(sponsor.sponsorId))}
                                        style={{
                                            padding: "8px 18px", borderRadius: 8,
                                            border: "none",
                                            background: "#ef4444",
                                            color: "#fff",
                                            fontWeight: 600, fontSize: 13,
                                            cursor: "pointer"
                                        }}
                                    >
                                        Withdraw Application
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
                    

            {activeSponsor && (
                <ApplyModal
                    sponsor={activeSponsor}
                    token={token}
                    onClose={async () => {
                        setActiveSponsor(null);
                        await fetchApplied();      
                    }}
                />
            )}
        </>
    );
}
