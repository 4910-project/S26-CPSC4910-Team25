import React, { useState, useEffect, useMemo } from "react";
import "./Catalogue.css";
import { useNavigate } from "react-router-dom";
 
const API_BASE       = "http://localhost:8002/api/catalogue";
const DRIVER_API     = "http://localhost:8001/api";
const ITUNES_API     = "https://itunes.apple.com/search";
const POINTS_PER_USD = 100;
 
const CATEGORIES = [
  { label: "Music",   media: "music",    entity: "song"      },
  { label: "Movies",  media: "movie",    entity: "movie"      },
  { label: "Apps",    media: "software", entity: "software"  },
  { label: "Books",   media: "ebook",    entity: "ebook"     },
  { label: "TV",      media: "tvShow",   entity: "tvEpisode" },
];
 
//Take the price from itunes then make it a decimal num
//if the price is free charge 50 points (hopefully the drivers do not find out about that)
//else multiple the price by points, the points are scuffed at this point
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
function usePurchaseLog(serverLog)
{
  const [log, setLog] = useState(() =>
  {
    try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; }
    catch { return []; }
  });
 
  useEffect(() =>
  {
    if (!serverLog?.length) return;
    setLog(prev =>
    {
      const existingIds = new Set(prev.map(e => e.id));
      const merged = [...serverLog.filter(e => !existingIds.has(e.id)), ...prev];
      localStorage.setItem(LOG_KEY, JSON.stringify(merged));
      return merged;
    });
  }, [serverLog]);
 
  function addEntry(entry)
  {
    setLog(prev =>
    {
      const updated = [entry, ...prev];
      localStorage.setItem(LOG_KEY, JSON.stringify(updated));
      return updated;
    });
  }
 
  return [log, addEntry];
}
 
export default function Catalogue({ token, initialPoints = 100, onPointsChange }) 
{
  const navigate = useNavigate();
  const [points,    setPoints]    = useState(initialPoints);
  const [input,     setInput]     = useState("");
  const [cat,       setCat]       = useState(CATEGORIES[0]);
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [buying,    setBuying]    = useState(false);
  const [toast,     setToast]     = useState(null);
  const [serverLog, setServerLog] = useState(null);
  const [log,       addEntry]     = usePurchaseLog(serverLog);
  const [showLog,   setShowLog]   = useState(false);
  const [hiddenIds, setHiddenIds] = useState(new Set());
 
  useEffect(() => { setPoints(initialPoints); }, [initialPoints]);
 
  useEffect(() => 
  {
    if (!token) return;
    fetch(`${API_BASE}/points`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.points != null) setPoints(d.points); })
      .catch(() => {});
  }, [token]);
 
  useEffect(() =>
  {
    if (!token) return;
    fetch(`${API_BASE}/purchases`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setServerLog(d); })
      .catch(err => console.warn("Could not load purchase history:", err));
  }, [token]);
 
  // Fetch hidden product IDs from this driver's sponsor
  useEffect(() =>
  {
    if (!token) return;
    fetch(`${DRIVER_API}/driver/catalog/hidden`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hiddenIds) setHiddenIds(new Set(d.hiddenIds.map(String))); })
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
    catch (err)
    {
      console.error("Search error:", err);
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
    setItems([]);
    setShowLog(false);
    search(input.trim() || "top hits", c);
  }
 
  
  async function handleBuy() 
  {
    const item = selectedItem;
    const cost = toPoints(item.trackPrice ?? item.price ?? 0);
    if (cost > points) { showToast("Not enough points!", "error"); setSelectedItem(null); return; }
 
    setBuying(true);
    try 
    {
      let newPoints = points - cost;
 
      if (token) 
      {
        try
        {
          const res = await fetch(`${API_BASE}/points/deduct`, 
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ amount: cost, itemName: item.trackName || item.collectionName }),
          });
          if (res.ok)
          {
            const d = await res.json();
            if (d.remainingPoints != null) newPoints = d.remainingPoints;
          }
        }
        catch (err)
        {
          console.warn("Could not reach points server, deducting locally:", err);
        }
      }
 
      setPoints(newPoints);
      if (onPointsChange) onPointsChange(newPoints);
 
      const entry = {
        id:          `${Date.now()}`,
        date:        new Date().toISOString(),
        name:        item.trackName || item.collectionName || "Unknown",
        artist:      item.artistName || "",
        kind:        item.kind || cat.label,
        artwork:     bigArt(item.artworkUrl100),
        cost,
        pointsAfter: newPoints,
        trackViewUrl: item.trackViewUrl || item.collectionViewUrl || null,
      };
 
      if (token) 
      {
        fetch(`${API_BASE}/purchases`, 
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(entry),
        }).catch(err => console.error("Failed to save purchase to server:", err));
      }
 
      addEntry(entry);
 
      showToast(`Redeemed for ${cost} pts!`, "success");
      setSelectedItem(null);
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
 
  const confirmCost = useMemo(
    () => selectedItem ? toPoints(selectedItem.trackPrice ?? selectedItem.price ?? 0) : 0,
    [selectedItem]
  );
 
  return (
    <div>
      {/* Hero */}
      <div className="cat-hero">
        <div>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              borderRadius: 8,
              padding: "5px 12px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 10,
            }}
          >
            Back
          </button>
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
            My Purchases {log.length > 0 && `(${log.length})`}
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
              {items.filter(item => !hiddenIds.has(String(item.trackId || item.collectionId))).map(item => {
                const cost      = toPoints(item.trackPrice ?? item.price ?? 0);
                const canAfford = points >= cost;
                const name      = item.trackName || item.collectionName || "Unknown";
                const img       = bigArt(item.artworkUrl100);
                const isFree    = !parseFloat(item.trackPrice ?? item.price ?? 0);
                return (
                  <div key={item.trackId || item.collectionId} className="cat-card" style={{ opacity: canAfford ? 1 : 0.5 }}>
                    {img && <img src={img} alt={name} />}
                    <div className="cat-card-body">
                      <p className="cat-card-artist">{item.artistName}</p>
                      <p className="cat-card-name">{name}</p>
                      {isFree && (
                        <p className="cat-card-free-note">Base price: 50 pts</p>
                      )}
                      <div className="cat-card-footer">
                        <span className="cat-card-pts">{cost.toLocaleString()} pts</span>
                        <button
                          className="cat-buy"
                          disabled={!canAfford}
                          onClick={() => setSelectedItem(item)}
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
      {selectedItem && (
        <div className="cat-overlay" onClick={() => setSelectedItem(null)}>
          <div className="cat-modal" onClick={e => e.stopPropagation()}>
            {bigArt(selectedItem.artworkUrl100) && (
              <img src={bigArt(selectedItem.artworkUrl100)} alt="" />
            )}
            <h3>{selectedItem.trackName || selectedItem.collectionName}</h3>
            <p>{selectedItem.artistName}</p>
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
              <button onClick={() => setSelectedItem(null)}>Cancel</button>
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