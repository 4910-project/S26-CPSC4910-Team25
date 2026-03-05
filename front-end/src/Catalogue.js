import React, { useState, useEffect } from "react";
import "./Catalogue.css";

const API_BASE       = "http://localhost:8002/api/catalogue";
const ITUNES_API     = "https://itunes.apple.com/search";
const POINTS_PER_USD = 100;

const CATEGORIES = [
  { label: "Music",   media: "music",    entity: "song"      },
  { label: "Movies",  media: "movie",    entity: "movie"     },
  { label: "Apps",    media: "software", entity: "software"  },
  { label: "Books",   media: "ebook",    entity: "ebook"     },
  { label: "TV",      media: "tvShow",   entity: "tvEpisode" },
];

function toPoints(price) 
{
  const p = parseFloat(price);
  return (!p || p <= 0) ? 50 : Math.round(p * POINTS_PER_USD);
}

function bigArt(url) 
{
  return url ? url.replace("100x100bb", "200x200bb") : null;
}

const LOG_KEY = "driver_purchase_log";
function loadLog() 
{
  try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
  catch { return []; }
}

export default function Catalogue({ token, initialPoints = 1000, onPointsChange }) 
{
  const [points,   setPoints]   = useState(initialPoints);
  const [input,    setInput]    = useState("");
  const [cat,      setCat]      = useState(CATEGORIES[0]);
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [confirm,  setConfirm]  = useState(null);
  const [buying,   setBuying]   = useState(false);
  const [toast,    setToast]    = useState(null);
  const [log,      setLog]      = useState(loadLog);
  const [showLog,  setShowLog]  = useState(false);

 
  useEffect(() => 
  {
    if (!token) return;
    fetch(`${API_BASE}/points`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.points != null) setPoints(d.points); })
      .catch(() => {});
  }, [token]);

  
  async function search(term, category) 
  {
    setLoading(true);
    setItems([]);
    try 
    {
      const url = `${ITUNES_API}?term=${encodeURIComponent(term || "top hits")}&media=${category.media}&entity=${category.entity}&limit=24&country=US`;
      const res  = await fetch(url);
      const data = await res.json();
      setItems(data.results || []);
    } 
    catch 
    {
      showToast("Search failed, try again.", "error");
    }
    setLoading(false);
  }

  useEffect(() => { search("top hits", cat); }, []); // eslint-disable-line

  function handleSearch(e) 
  {
    e.preventDefault();
    search(input.trim() || "top hits", cat);
  }

  function handleCategory(c) 
  {
    setCat(c);
    search(input.trim() || "top hits", c);
  }

  
  async function handleBuy() 
  {
    const cost = toPoints(confirm.trackPrice ?? confirm.price ?? 0);
    if (cost > points) { showToast("Not enough points!", "error"); setConfirm(null); return; }

    setBuying(true);
    try 
    {
      let newPoints = points - cost;

      if (token) 
      {
        const res = await fetch(`${API_BASE}/points/deduct`, 
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ amount: cost, itemName: confirm.trackName || confirm.collectionName }),
        });
        if (res.ok)
        {
          const d = await res.json();
          if (d.remainingPoints != null) newPoints = d.remainingPoints;
        }
      }

      setPoints(newPoints);
      if (onPointsChange) onPointsChange(newPoints);

      const entry = {
        id:          `${Date.now()}`,
        date:        new Date().toISOString(),
        name:        confirm.trackName || confirm.collectionName || "Unknown",
        artist:      confirm.artistName || "",
        kind:        confirm.kind || cat.label,
        artwork:     bigArt(confirm.artworkUrl100),
        cost,
        pointsAfter: newPoints,
        trackViewUrl: confirm.trackViewUrl || confirm.collectionViewUrl || null,
      };

      if (token) 
      {
        fetch(`${API_BASE}/purchases`, 
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(entry),
        }).catch(() => {});
      }

      const newLog = [entry, ...log];
      setLog(newLog);
      localStorage.setItem(LOG_KEY, JSON.stringify(newLog));

      showToast(`✓ Redeemed for ${cost} pts!`, "success");
      setConfirm(null);
    } 
    catch 
    {
      showToast("Purchase failed.", "error");
    }
    setBuying(false);
  }

  function showToast(msg, type = "success") 
  {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  const confirmCost = confirm ? toPoints(confirm.trackPrice ?? confirm.price ?? 0) : 0;

  return (
    <div>
      {/* Hero */}
      <div className="cat-hero">
        <div>
          <h1>Points Catalogue</h1>
          <p>Redeem your points on your choice of media</p>
        </div>
        <div className="cat-points">
          <span>Your Balance</span>
          <strong>{points.toLocaleString()} pts</strong>
        </div>
      </div>

      <div className="cat-body">
        {/* Search */}
        <form className="cat-search-row" onSubmit={handleSearch}>
          <input
            type="text"
            placeholder="Search…"
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button className="cat-btn" type="submit" disabled={loading}>
            {loading ? "…" : "Search"}
          </button>
        </form>

        {/* Category pills */}
        <div className="cat-pills">
          {CATEGORIES.map(c => (
            <button
              key={c.media}
              className={`cat-pill ${cat.media === c.media ? "active" : ""}`}
              onClick={() => handleCategory(c)}
            >
              {c.label}
            </button>
          ))}
          <button
            className={`cat-pill ${showLog ? "active" : ""}`}
            onClick={() => setShowLog(v => !v)}
          >
            🧾 My Purchases {log.length > 0 && `(${log.length})`}
          </button>
        </div>

        {/* Purchase log */}
        {showLog && (
          <div>
            <h3 style={{ color: "var(--text)", marginBottom: 12 }}>Purchase History</h3>
            {log.length === 0 ? (
              <div className="cat-empty">No purchases yet.</div>
            ) : log.map(entry => (
              <div key={entry.id} className="cat-log-item">
                {entry.artwork && <img src={entry.artwork} alt={entry.name} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{entry.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{entry.artist} · {entry.kind}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: "#e53935", fontWeight: 700 }}>−{entry.cost} pts</div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(entry.date).toLocaleDateString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Grid */}
        {!showLog && (
          <>
            {loading && <div className="cat-empty">Loading…</div>}
            {!loading && items.length === 0 && <div className="cat-empty">No results found.</div>}
            <div className="cat-grid">
              {items.map(item => {
                const cost      = toPoints(item.trackPrice ?? item.price ?? 0);
                const canAfford = points >= cost;
                const name      = item.trackName || item.collectionName || "Unknown";
                const img       = bigArt(item.artworkUrl100);
                return (
                  <div key={item.trackId || item.collectionId} className="cat-card" style={{ opacity: canAfford ? 1 : 0.5 }}>
                    {img && <img src={img} alt={name} />}
                    <div className="cat-card-body">
                      <p className="cat-card-artist">{item.artistName}</p>
                      <p className="cat-card-name">{name}</p>
                      <div className="cat-card-footer">
                        <span className="cat-card-pts">{cost.toLocaleString()} pts</span>
                        <button
                          className="cat-buy"
                          disabled={!canAfford}
                          onClick={() => setConfirm(item)}
                        >
                          {canAfford ? "Redeem" : "Need pts"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="cat-overlay" onClick={() => setConfirm(null)}>
          <div className="cat-modal" onClick={e => e.stopPropagation()}>
            {bigArt(confirm.artworkUrl100) && (
              <img src={bigArt(confirm.artworkUrl100)} alt="" />
            )}
            <h3>{confirm.trackName || confirm.collectionName}</h3>
            <p>{confirm.artistName}</p>
            <div className="cat-modal-row">
              <span>Cost</span>
              <strong style={{ color: "#e53935" }}>−{confirmCost.toLocaleString()} pts</strong>
            </div>
            <div className="cat-modal-row">
              <span>Balance after</span>
              <strong style={{ color: points - confirmCost >= 0 ? "#059669" : "#dc2626" }}>
                {(points - confirmCost).toLocaleString()} pts
              </strong>
            </div>
            <div className="cat-modal-actions">
              <button onClick={() => setConfirm(null)}>Cancel</button>
              <button className="cat-btn" onClick={handleBuy} disabled={buying}>
                {buying ? "Processing…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`cat-toast ${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}