import React, { useState } from "react";
import LineCrossingService from "./services/LineCrossingService";
import PolygonZoneService from "./services/PolygonZoneService";
import {
  ArrowLeftRight, Hexagon, ChevronLeft, ChevronRight,
  LayoutGrid, Zap, Activity
} from "lucide-react";

const SERVICES = [
  {
    id: "lines",
    label: "Line Crossing Counter",
    icon: ArrowLeftRight,
    accent: "#6366f1",
    accentBg: "rgba(99,102,241,0.12)",
    accentBorder: "rgba(99,102,241,0.3)",
    tag: "Service 1",
    tagColor: "#818cf8",
    description: "Draw virtual tripwire lines across lanes. Count vehicles crossing each line, tracking direction (IN/OUT) per class.",
    features: ["Custom named lines", "IN/OUT direction logic", "Per-class counters", "PostgreSQL event log"],
  },
  {
    id: "polygons",
    label: "Polygon Zone Presence",
    icon: Hexagon,
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.12)",
    accentBorder: "rgba(245,158,11,0.3)",
    tag: "Service 2",
    tagColor: "#fbbf24",
    description: "Draw polygon zones over parking bays, intersections, or lanes. Track vehicle entry/exit events with timestamps.",
    features: ["Up to 6 named zones", "Entry/Exit timestamps", "Zone occupancy tracker", "PostgreSQL event log"],
  },
];

export default function ServicesPage({ token, availableModels, availableJobs, cameraId }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeService, setActiveService] = useState("lines");

  const currentService = SERVICES.find(s => s.id === activeService);
  const Icon = currentService?.icon || LayoutGrid;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "80vh", position: "relative" }}>
      {/* Sidebar */}
      <div className="services-sidebar" style={{ width: sidebarOpen ? 280 : 56, transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)" }}>
        {/* Sidebar header */}
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden">
              <LayoutGrid className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">Traffic Services</span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(p => !p)}
            className="sidebar-toggle-btn"
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Service items */}
        <div className="sidebar-items">
          {SERVICES.map(svc => {
            const SvcIcon = svc.icon;
            const active = activeService === svc.id;
            return (
              <button
                key={svc.id}
                onClick={() => setActiveService(svc.id)}
                className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
                style={active ? {
                  borderColor: svc.accentBorder,
                  background: svc.accentBg,
                } : {}}
                title={!sidebarOpen ? svc.label : undefined}
              >
                <span className="sidebar-item-icon" style={active ? { color: svc.accent } : {}}>
                  <SvcIcon className="w-5 h-5" />
                </span>
                {sidebarOpen && (
                  <span className="sidebar-item-label" style={active ? { color: svc.accent } : {}}>
                    {svc.label}
                    <span className="sidebar-item-tag" style={{ color: svc.tagColor }}>{svc.tag}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar footer - status */}
        {sidebarOpen && (
          <div className="sidebar-footer">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <Activity className="w-3.5 h-3.5 text-emerald-500" />
              Backend Connected
            </div>
            <div className="text-[9px] text-slate-600 mt-1">Camera: {cameraId || "default"}</div>
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="services-main-content">
        {/* Service info banner */}
        {currentService && (
          <div className="service-info-banner" style={{ borderColor: currentService.accentBorder, background: currentService.accentBg }}>
            <div className="flex items-start gap-4">
              <div className="service-banner-icon" style={{ background: `${currentService.accent}20`, border: `1px solid ${currentService.accentBorder}` }}>
                <Icon className="w-6 h-6" style={{ color: currentService.accent }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-base font-bold text-white">{currentService.label}</h2>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                    background: `${currentService.accent}20`,
                    color: currentService.tagColor,
                    border: `1px solid ${currentService.accentBorder}`
                  }}>{currentService.tag}</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                    <Zap className="w-2.5 h-2.5" /> CUDA Accelerated
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{currentService.description}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {currentService.features.map(f => (
                    <span key={f} className="text-[10px] font-medium text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Active service component */}
        <div className="service-body">
          {activeService === "lines" && (
            <LineCrossingService
              cameraId={cameraId}
              token={token}
              availableModels={availableModels}
              availableJobs={availableJobs}
            />
          )}
          {activeService === "polygons" && (
            <PolygonZoneService
              cameraId={cameraId}
              token={token}
              availableModels={availableModels}
              availableJobs={availableJobs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
