import React, { useCallback, useEffect, useState } from "react";

const SPONSOR_API = "http://localhost:8001/sponsor";

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

export default function SponsorPostsManager({ token }) {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SPONSOR_API}/posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load posts");
      setPosts(data.posts || []);
    } catch (err) {
      setError(err.message || "Failed to load posts");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchPosts();
  }, [fetchPosts, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch(`${SPONSOR_API}/posts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish post");

      setTitle("");
      setBody("");
      setSuccess("Post published successfully.");
      await fetchPosts();
    } catch (err) {
      setError(err.message || "Failed to publish post");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (postId) => {
    setDeletingPostId(postId);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${SPONSOR_API}/posts/${postId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete post");
      setSuccess("Post deleted.");
      await fetchPosts();
    } catch (err) {
      setError(err.message || "Failed to delete post");
    } finally {
      setDeletingPostId(null);
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0, marginBottom: 6, fontSize: 18 }}>Sponsor Posts</h3>
      <p style={{ marginTop: 0, marginBottom: 16, color: "#6b7280", fontSize: 14 }}>
        Publish updates that drivers can browse, read, and comment on.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#ecfdf5", color: "#065f46", marginBottom: 12 }}>
          {success}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          background: "var(--card, #fff)",
          marginBottom: 16,
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="sponsor-post-title" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Title
          </label>
          <input
            id="sponsor-post-title"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={150}
            placeholder="Share an update with your drivers"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "var(--card, #fff)",
              color: "var(--text)",
            }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="sponsor-post-body" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Post Body
          </label>
          <textarea
            id="sponsor-post-body"
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            placeholder="Write the message drivers should see"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "var(--card, #fff)",
              color: "var(--text)",
              resize: "vertical",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "9px 16px",
            borderRadius: 8,
            border: "none",
            background: "#111827",
            color: "#fff",
            fontWeight: 700,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Publishing..." : "Publish Post"}
        </button>
      </form>

      {loading ? (
        <p style={{ color: "#6b7280" }}>Loading posts…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No posts yet. Publish the first one above.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {posts.map((post) => (
            <div
              key={post.postId}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                background: "var(--card, #fff)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{post.title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {formatTimestamp(post.createdAt)} · {Number(post.commentCount || 0)} comment(s)
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(post.postId)}
                  disabled={deletingPostId === post.postId}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: "#b91c1c",
                    fontWeight: 600,
                    cursor: deletingPostId === post.postId ? "not-allowed" : "pointer",
                  }}
                >
                  {deletingPostId === post.postId ? "Deleting..." : "Delete"}
                </button>
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{post.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
