import React, { useCallback, useEffect, useState } from "react";

const API_BASE = "/api";

const cardStyle = {
  border: "1px solid var(--border, #e5e7eb)",
  borderRadius: 12,
  padding: 16,
  background: "var(--card, #fff)",
};

export default function DriverFriendsPanel({ token }) {
  const [friends, setFriends] = useState([]);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyFriendId, setBusyFriendId] = useState(null);

  const fetchFriends = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/driver/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load friends");
      setFriends(data.friends || []);
      setAvailableDrivers(data.availableDrivers || []);
    } catch (err) {
      setError(err.message || "Failed to load friends");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchFriends();
  }, [fetchFriends, token]);

  const handleAddFriend = async (friendUserId) => {
    setBusyFriendId(friendUserId);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/driver/friends/${friendUserId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add friend");
      await fetchFriends();
    } catch (err) {
      setError(err.message || "Failed to add friend");
    } finally {
      setBusyFriendId(null);
    }
  };

  const handleRemoveFriend = async (friendUserId) => {
    setBusyFriendId(friendUserId);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/driver/friends/${friendUserId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove friend");
      await fetchFriends();
    } catch (err) {
      setError(err.message || "Failed to remove friend");
    } finally {
      setBusyFriendId(null);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Driver Friends</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        View your current friends list and connect with other active drivers.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading friends…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Your Friends</h3>
            {friends.length === 0 ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>You have not added any friends yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {friends.map((friend) => (
                  <div
                    key={friend.friendUserId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f8fafc",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{friend.username}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{friend.email}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {friend.sponsorName || "No sponsor"} · {String(friend.driverStatus || "ACTIVE").toLowerCase()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFriend(friend.friendUserId)}
                      disabled={busyFriendId === friend.friendUserId}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        background: "#fff",
                        color: "#b91c1c",
                        cursor: busyFriendId === friend.friendUserId ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {busyFriendId === friend.friendUserId ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>Add Other Drivers</h3>
            {availableDrivers.length === 0 ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>No additional active drivers are available right now.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {availableDrivers.map((driver) => (
                  <div
                    key={driver.driverUserId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 10,
                      background: "#f8fafc",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700 }}>{driver.username}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{driver.email}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{driver.sponsorName || "No sponsor"}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddFriend(driver.driverUserId)}
                      disabled={busyFriendId === driver.driverUserId}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        cursor: busyFriendId === driver.driverUserId ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {busyFriendId === driver.driverUserId ? "Adding..." : "Add Friend"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
