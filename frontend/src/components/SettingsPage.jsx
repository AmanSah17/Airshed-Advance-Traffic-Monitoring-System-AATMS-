import React, { useState } from "react";
import { Settings, Palette, User, Database, Terminal, MousePointerClick, ChevronDown, ChevronUp, LogOut, Download } from "lucide-react";
import SystemLogs from "./SystemLogs";
import DrawingCanvas from "./DrawingCanvas";

export default function SettingsPage({ theme, setTheme, user, handleLogout, token, videoSource, cameraId }) {
  const [openSection, setOpenSection] = useState("account");

  const toggleSection = (section) => {
    setOpenSection(openSection === section ? null : section);
  };

  const themes = [
    { id: "theme-dark", name: "Pure Black", bg: "#000000", border: "#333333" },
    { id: "theme-light", name: "Light", bg: "#f8fafc", border: "#e2e8f0" },
    { id: "theme-blue", name: "Deep Blue", bg: "#17153b", border: "#6366f1" },
    { id: "theme-green", name: "Blue-Green", bg: "#042f2e", border: "#14b8a6" },
  ];

  return (
    <div className="settings-container p-6">
      <div className="mb-6 flex items-center gap-3">
        <Settings className="w-6 h-6 text-indigo-400" />
        <h2 className="text-2xl font-bold text-slate-100">System Settings</h2>
      </div>

      {/* Account Section */}
      <div className="settings-section">
        <div className="settings-header" onClick={() => toggleSection("account")}>
          <div className="settings-title"><User className="w-5 h-5 text-indigo-400" /> Account Details</div>
          {openSection === "account" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
        {openSection === "account" && (
          <div className="settings-content">
            <div className="account-row">
              <span className="account-label">Username</span>
              <span className="account-value">{user?.username || "Guest"}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Email</span>
              <span className="account-value">{user?.email || "user@example.com"}</span>
            </div>
            <div className="account-row">
              <span className="account-label">Role</span>
              <span className="account-value">{user?.role || "Admin"}</span>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={handleLogout} className="btn btn-danger gap-2">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Themes Section */}
      <div className="settings-section">
        <div className="settings-header" onClick={() => toggleSection("theme")}>
          <div className="settings-title"><Palette className="w-5 h-5 text-indigo-400" /> Appearance & Theme</div>
          {openSection === "theme" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
        {openSection === "theme" && (
          <div className="settings-content">
            <p className="text-sm text-slate-400 mb-4">Select a color theme for the dashboard interface.</p>
            <div className="theme-options">
              {themes.map(t => (
                <div key={t.id} className="flex flex-col items-center gap-2">
                  <div
                    onClick={() => setTheme(t.id)}
                    className={`theme-circle ${theme === t.id ? "active" : ""}`}
                    style={{ background: t.bg, borderColor: theme === t.id ? t.border : "transparent" }}
                    title={t.name}
                  />
                  <span className="text-xs font-semibold">{t.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Saved Configs (ROIs) Section */}
      <div className="settings-section">
        <div className="settings-header" onClick={() => toggleSection("configs")}>
          <div className="settings-title"><Database className="w-5 h-5 text-indigo-400" /> Saved ROI Configs</div>
          {openSection === "configs" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
        {openSection === "configs" && (
          <div className="settings-content">
            <p className="text-sm text-slate-400 mb-4">Manage globally saved Regions of Interest (ROIs). (Note: Individual services have their own localized drawing tools).</p>
            <DrawingCanvas videoSource={videoSource} cameraId={cameraId} token={token} />
          </div>
        )}
      </div>

      {/* System Logs Section */}
      <div className="settings-section">
        <div className="settings-header" onClick={() => toggleSection("logs")}>
          <div className="settings-title"><Terminal className="w-5 h-5 text-indigo-400" /> System Logs</div>
          {openSection === "logs" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </div>
        {openSection === "logs" && (
          <div className="settings-content" style={{ padding: 0 }}>
             <SystemLogs token={token} />
          </div>
        )}
      </div>

    </div>
  );
}
