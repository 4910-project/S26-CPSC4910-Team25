import React, { useCallback, useEffect, useState } from "react";

const API_BASE = "/api";

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}

export default function SponsorFeedPanel({ token }) {
  const [posts, setPosts] = useState([]);
  const [commentsByPost, setCommentsByPost] = useState({});
  const [expandedPostIds, setExpandedPostIds] = useState({});
  const [commentDrafts, setCommentDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [commentBusyPostId, setCommentBusyPostId] = useState(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/driver/sponsor-posts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load sponsor posts");
      setPosts(data.posts || []);
    } catch (err) {
      setError(err.message || "Failed to load sponsor posts");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchComments = useCallback(async (postId) => {
    const res = await fetch(`${API_BASE}/driver/sponsor-posts/${postId}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load comments");
    setCommentsByPost((prev) => ({ ...prev, [postId]: data.comments || [] }));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    fetchPosts();
  }, [fetchPosts, token]);

  const handleToggleComments = async (postId) => {
    const nextExpanded = !expandedPostIds[postId];
    setExpandedPostIds((prev) => ({ ...prev, [postId]: nextExpanded }));
    if (nextExpanded && !commentsByPost[postId]) {
      try {
        await fetchComments(postId);
      } catch (err) {
        setError(err.message || "Failed to load comments");
      }
    }
  };

  const handleCommentSubmit = async (postId) => {
    const commentText = String(commentDrafts[postId] || "").trim();
    if (!commentText) {
      setError("Enter a comment before posting.");
      return;
    }

    setCommentBusyPostId(postId);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/driver/sponsor-posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ commentText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post comment");

      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), data.comment],
      }));
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
      setPosts((prev) =>
        prev.map((post) =>
          post.postId === postId
            ? { ...post, commentCount: Number(post.commentCount || 0) + 1 }
            : post
        )
      );
      setExpandedPostIds((prev) => ({ ...prev, [postId]: true }));
    } catch (err) {
      setError(err.message || "Failed to post comment");
    } finally {
      setCommentBusyPostId(null);
    }
  };

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Sponsor Feed</h2>
      <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 0, marginBottom: 20 }}>
        Browse sponsor updates, read comments from other drivers, and add your own.
      </p>

      {error && (
        <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fef2f2", color: "#991b1b", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading sponsor posts…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No sponsor posts are available yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {posts.map((post) => {
            const comments = commentsByPost[post.postId] || [];
            const expanded = !!expandedPostIds[post.postId];
            return (
              <div
                key={post.postId}
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--card, #fff)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{post.sponsorName}</div>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{post.title}</div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: 12, color: "var(--muted)" }}>
                    <div>{formatTimestamp(post.createdAt)}</div>
                    <div>{Number(post.commentCount || 0)} comment(s)</div>
                  </div>
                </div>

                <p style={{ marginTop: 0, marginBottom: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                  {post.body}
                </p>

                <button
                  type="button"
                  onClick={() => handleToggleComments(post.postId)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--border, #d1d5db)",
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 600,
                    cursor: "pointer",
                    marginBottom: expanded ? 12 : 0,
                  }}
                >
                  {expanded ? "Hide Comments" : "View Comments"}
                </button>

                {expanded && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
                      {comments.length === 0 ? (
                        <p style={{ color: "var(--muted)", margin: 0 }}>No comments yet.</p>
                      ) : (
                        comments.map((comment) => (
                          <div
                            key={comment.commentId}
                            style={{
                              padding: "10px 12px",
                              borderRadius: 10,
                              background: "#f8fafc",
                            }}
                          >
                            <div style={{ fontWeight: 700 }}>{comment.driverName}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
                              {formatTimestamp(comment.createdAt)}
                            </div>
                            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{comment.commentText}</div>
                          </div>
                        ))
                      )}
                    </div>

                    <textarea
                      rows={3}
                      value={commentDrafts[post.postId] || ""}
                      placeholder="Add a comment…"
                      onChange={(event) =>
                        setCommentDrafts((prev) => ({
                          ...prev,
                          [post.postId]: event.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid var(--border, #d1d5db)",
                        background: "var(--card, #fff)",
                        color: "var(--text)",
                        resize: "vertical",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleCommentSubmit(post.postId)}
                      disabled={commentBusyPostId === post.postId}
                      style={{
                        marginTop: 10,
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: "none",
                        background: "#2563eb",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: commentBusyPostId === post.postId ? "not-allowed" : "pointer",
                      }}
                    >
                      {commentBusyPostId === post.postId ? "Posting..." : "Post Comment"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
