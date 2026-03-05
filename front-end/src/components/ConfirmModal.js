import React from "react";

export default function ConfirmModal({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        background: "white",
        padding: 20,
        borderRadius: 10,
        width: 400
      }}>
        <h3>{title}</h3>
        <p>{message}</p>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onCancel}>Cancel</button>
          <button onClick={onConfirm} style={{ background: "#ef4444", color: "white" }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}