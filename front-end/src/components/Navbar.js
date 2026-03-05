import React from "react";
import "./Navbar.css";

export default function Navbar({ userRole, screen, onNavigate, onLogout, dark, onToggleDark }) {
  // Role-specific nav links
  const navLinks = {
    DRIVER: [
      { label: "Dashboard", screen: "driver-profile" },
    ],
    SPONSOR: [
      { label: "Dashboard", screen: "sponsor-profile" },
    ],
    ADMIN: [
      { label: "Dashboard", screen: "admin-dashboard" },
    ],
  };

  const links = navLinks[userRole] || [];

  const roleLabel = {
    DRIVER: "Driver",
    SPONSOR: "Sponsor",
    ADMIN: "Admin",
  }[userRole] || userRole;

  const roleBadgeClass = {
    DRIVER: "badge badge--driver",
    SPONSOR: "badge badge--sponsor",
    ADMIN: "badge badge--admin",
  }[userRole] || "badge";

  return (
    <nav className="navbar">
      {/* Left: Logo + app name */}
      <div className="navbar__left">
        <span className="navbar__logo">🚛</span>
        <span className="navbar__title">Good Driver Incentive</span>
      </div>

      {/* Center: Nav links */}
      <div className="navbar__center">
        {links.map((link) => (
          <button
            key={link.screen}
            type="button"
            className={`navbar__link ${screen === link.screen ? "navbar__link--active" : ""}`}
            onClick={() => onNavigate(link.screen)}
          >
            {link.label}
          </button>
        ))}
      </div>

      {/* Right: Role badge + dark toggle + logout */}
      <div className="navbar__right">
        <span className={roleBadgeClass}>{roleLabel}</span>

        <button
          type="button"
          className={`navbar__link ${screen === "catalogue" ? "navbar__link--active" : ""}`}
          onClick={() => onNavigate("catalogue")}
        >
          Catalogue
        </button>

        <span className={roleBadgeClass}>{roleLabel}</span>

        <button
          type="button"
          className="navbar__icon-btn"
          onClick={onToggleDark}
          aria-label="Toggle dark mode"
          title={dark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {dark ? "☀️" : "🌙"}
        </button>

        <button
          type="button"
          className="navbar__logout"
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </nav>
  );
}