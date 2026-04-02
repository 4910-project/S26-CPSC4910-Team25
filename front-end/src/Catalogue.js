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

function getItemId(item) {
  return String(item.trackId || item.collectionId || item.id || "");
}

function toCartItem(item, fallbackKind = "Media") {
  const id = getItemId(item);
  return {
    id,
    name: item.trackName || item.collectionName || item.name || "Unknown",
    artist: item.artistName || item.artist || "",
    kind: item.kind || fallbackKind,
    artwork: bigArt(item.artworkUrl100 || item.artwork),
    cost: Number(item.cost ?? toPoints(item.trackPrice ?? item.price ?? 0)),
    trackViewUrl: item.trackViewUrl || item.collectionViewUrl || null,
  };
}
 
const LOG_KEY = "driver_purchase_log";
const CART_KEY = "driver_cart_items";
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
 
export default function Catalogue({ token, userRole, initialPoints = 100, onPointsChange })
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
  const [showCart,  setShowCart]  = useState(false);
  const [cart,      setCart]      = useState(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch { return []; }
  });
  const [hiddenIds, setHiddenIds] = useState(new Set());

  // wishlistMap: { [itunesTrackId]: dbRowId }
  const [wishlistMap,     setWishlistMap]     = useState({});
  const [wishlistPending, setWishlistPending] = useState(new Set());

  // Seed cart from backend on mount (backend is source of truth for persistence)
  useEffect(() => {
    if (!token) return;
    fetch(`${DRIVER_API}/driver/cart`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.cart) return;
        const serverCart = d.cart.map(row => ({
          id:       String(row.itunes_track_id),
          name:     row.product_name,
          artist:   row.artist   || "",
          kind:     row.kind     || "Media",
          artwork:  row.product_image_url || null,
          cost:     row.price_in_points,
          dbCartId: row.id,
        }));
        setCart(serverCart);
        localStorage.setItem(CART_KEY, JSON.stringify(serverCart));
      })
      .catch(() => {}); // keep localStorage cart on failure
  }, [token]);
 
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
 
  // Fetch existing wishlist for drivers
  useEffect(() =>
  {
    if (!token || userRole !== "DRIVER") return;
    fetch(`${DRIVER_API}/driver/wishlist`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.wishlist) return;
        const map = {};
        d.wishlist.forEach(w => { map[String(w.itunes_track_id)] = w.id; });
        setWishlistMap(map);
      })
      .catch(() => {});
  }, [token, userRole]);

  async function toggleWishlist(item)
  {
    const trackId = getItemId(item);
    if (!trackId || wishlistPending.has(trackId)) return;

    setWishlistPending(prev => new Set([...prev, trackId]));
    try {
      if (wishlistMap[trackId] != null) {
        // Remove
        await fetch(`${DRIVER_API}/driver/wishlist/${wishlistMap[trackId]}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setWishlistMap(prev => { const n = { ...prev }; delete n[trackId]; return n; });
      } else {
        // Add
        const res = await fetch(`${DRIVER_API}/driver/wishlist`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            itunes_track_id:   trackId,
            product_name:      item.trackName || item.collectionName || "Unknown",
            product_image_url: bigArt(item.artworkUrl100) || null,
            price_in_points:   toPoints(item.trackPrice ?? item.price ?? 0),
          }),
        });
        const d = await res.json();
        if (d.ok) setWishlistMap(prev => ({ ...prev, [trackId]: d.id }));
      }
    } catch (err) {
      console.error("Wishlist toggle failed:", err);
    } finally {
      setWishlistPending(prev => { const n = new Set(prev); n.delete(trackId); return n; });
    }
  }

  // Fetch hidden product IDs from this driver's sponsor
  useEffect(() =>
  {
    if (!token) return;
    fetch(`${DRIVER_API}/driver/catalog/hidden`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hiddenIds) setHiddenIds(new Set(d.hiddenIds.map(String))); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);
 
  
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
    setShowCart(false);
    search(input.trim() || "top hits", c);
  }
 
  function addToCart(item) {
    const cartItem = toCartItem(item, cat.label);
    if (!cartItem.id) {
      showToast("Could not add this item to cart.", "error");
      return;
    }

    setCart((prev) => {
      if (prev.some((entry) => entry.id === cartItem.id)) {
        showToast("Item is already in your cart.", "error");
        return prev;
      }
      showToast("Added to cart.", "success");
      return [cartItem, ...prev];
    });
    setSelectedItem(null);

    // Persist to backend (best-effort; store returned DB id back into cart item)
    if (token) {
      fetch(`${DRIVER_API}/driver/cart`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          itunes_track_id:   cartItem.id,
          product_name:      cartItem.name,
          product_image_url: cartItem.artwork || null,
          price_in_points:   cartItem.cost,
          artist:            cartItem.artist  || null,
          kind:              cartItem.kind    || null,
        }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d?.ok && d.id) {
            setCart(prev => prev.map(c => c.id === cartItem.id ? { ...c, dbCartId: d.id } : c));
          }
        })
        .catch(() => {});
    }
  }

  function removeFromCart(itemId) {
    // Persist removal to backend (best-effort)
    if (token) {
      const target = cart.find(c => c.id === itemId);
      if (target?.dbCartId) {
        fetch(`${DRIVER_API}/driver/cart/${target.dbCartId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
      }
    }
    setCart((prev) => prev.filter((item) => item.id !== itemId));
  }

  async function redeemItem(item, options = {}) {
    const { closePreview = false, removeFromCartId = null } = options;
    const normalized = toCartItem(item, cat.label);
    const cost = normalized.cost;

    if (cost > points) {
      showToast("Not enough points!", "error");
      if (closePreview) setSelectedItem(null);
      return;
    }
 
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
            body: JSON.stringify({ amount: cost, itemName: normalized.name }),
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
        name:        normalized.name,
        artist:      normalized.artist,
        kind:        normalized.kind,
        artwork:     normalized.artwork,
        cost,
        pointsAfter: newPoints,
        trackViewUrl: normalized.trackViewUrl,
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
      if (removeFromCartId) {
        removeFromCart(removeFromCartId);
      }
 
      showToast(`Redeemed for ${cost} pts!`, "success");
      if (closePreview) setSelectedItem(null);
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

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + Number(item.cost || 0), 0),
    [cart]
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
            onClick={() => {
              setShowLog((v) => {
                const next = !v;
                if (next) setShowCart(false);
                return next;
              });
            }}
          >
            My Purchases {log.length > 0 && `(${log.length})`}
          </button>
          <button
            className={`cat-pill ${showCart ? "active" : ""}`}
            onClick={() => {
              setShowCart((v) => {
                const next = !v;
                if (next) setShowLog(false);
                return next;
              });
            }}
          >
            Cart {cart.length > 0 && `(${cart.length})`}
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

        {/* Cart */}
        {showCart && (
          <div>
            <h3 style={{ color: "var(--text)", marginBottom: 12 }}>Cart</h3>
            {cart.length === 0 ? (
              <div className="cat-empty">Your cart is empty.</div>
            ) : (
              <>
                <div style={{ marginBottom: 10, color: "var(--muted)", fontSize: 13 }}>
                  Total Cart Cost: <strong style={{ color: "var(--text)" }}>{cartTotal.toLocaleString()} pts</strong>
                </div>
                {cart.map((item) => {
                  const canAfford = points >= Number(item.cost || 0);
                  return (
                    <div key={item.id} className="cat-log-item">
                      {item.artwork && <img src={item.artwork} alt={item.name} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{item.artist} · {item.kind}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 6,
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--text)",
                            cursor: "pointer",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Remove
                        </button>
                        <button
                          className="cat-buy"
                          disabled={!canAfford || buying}
                          onClick={() => redeemItem(item, { removeFromCartId: item.id })}
                        >
                          {buying ? "..." : canAfford ? `Redeem ${Number(item.cost).toLocaleString()} pts` : "Need pts"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
 
        {/* Grid */}
        {!showLog && !showCart && (
          <>
            {loading && <div className="cat-empty">Loading…</div>}
            {!loading && items.length === 0 && <div className="cat-empty">No results found.</div>}
            <div className="cat-grid">
              {items.filter(item => !hiddenIds.has(String(item.trackId || item.collectionId))).map(item => {
                const cost        = toPoints(item.trackPrice ?? item.price ?? 0);
                const canAfford   = points >= cost;
                const name        = item.trackName || item.collectionName || "Unknown";
                const img         = bigArt(item.artworkUrl100);
                const isFree      = !parseFloat(item.trackPrice ?? item.price ?? 0);
                const trackId     = getItemId(item);
                const isWishlisted = wishlistMap[trackId] != null;
                const isPending    = wishlistPending.has(trackId);
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
                        {userRole === "DRIVER" && (
                          <button
                            type="button"
                            className="cat-wishlist-btn"
                            title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
                            disabled={isPending}
                            onClick={(e) => { e.stopPropagation(); toggleWishlist(item); }}
                            style={{ color: isWishlisted ? "#e53935" : "var(--muted)" }}
                          >
                            {isWishlisted ? "♥" : "♡"}
                          </button>
                        )}
                        <button
                          className="cat-buy"
                          disabled={!canAfford}
                          onClick={() => setSelectedItem(item)}
                        >
                          {canAfford ? "Preview" : "Need pts"}
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
 
      {/* Product preview modal */}
      {selectedItem && (
        <div className="cat-overlay" onClick={() => setSelectedItem(null)}>
          <div className="cat-modal" onClick={e => e.stopPropagation()}>
            {bigArt(selectedItem.artworkUrl100) && (
              <img src={bigArt(selectedItem.artworkUrl100)} alt="" />
            )}
            <h3>{selectedItem.trackName || selectedItem.collectionName}</h3>
            <p>{selectedItem.artistName}</p>
            <div className="cat-modal-row">
              <span>Type</span>
              <strong>{selectedItem.kind || cat.label}</strong>
            </div>
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
              <button onClick={() => setSelectedItem(null)}>Close</button>
              <button onClick={() => addToCart(selectedItem)}>Add to Cart</button>
              <button
                className="cat-btn"
                onClick={() => redeemItem(selectedItem, { closePreview: true })}
                disabled={buying}
              >
                {buying ? "Processing…" : "Redeem Now"}
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
