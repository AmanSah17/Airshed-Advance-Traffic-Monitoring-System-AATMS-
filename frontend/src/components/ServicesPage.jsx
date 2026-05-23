import React, { useState } from "react";
import LineCrossingService from "./services/LineCrossingService";
import PolygonZoneService from "./services/PolygonZoneService";
import {
  ArrowLeftRight, Hexagon, ChevronLeft, ChevronRight,
  LayoutGrid, Zap, Activity, Shield, Database, Cpu,
  Eye, MapPin, TrendingUp, Camera, Lock, CheckCircle2,
  Info, BarChart3, Server, Layers, GitBranch, Clock
} from "lucide-react";

// ── Service catalogue ─────────────────────────────────────────────────────────
const SERVICES = [
  {
    id: "lines",
    label: "Line Crossing Counter",
    icon: ArrowLeftRight,
    accent: "#6366f1",
    accentBg: "rgba(99,102,241,0.1)",
    accentBorder: "rgba(99,102,241,0.3)",
    tag: "Service 1",
    tagColor: "#818cf8",
    badge: "LIVE",
    badgeColor: "#10b981",
    description: "Draw virtual tripwire lines across any lane or road segment. Each time a tracked vehicle's bottom-centre coordinate crosses a line, an IN or OUT event is recorded with vehicle class, track ID, confidence, and exact timestamp.",
    techDetails: "Uses a CCW (counter-clockwise) vector intersection algorithm on the bottom-centre trajectory path of each tracked object. Cooldown logic prevents double-counting for oscillating objects at line boundaries.",
    features: [
      "Multiple named lines simultaneously",
      "IN / OUT direction logic (cross-product based)",
      "Per-class per-line counters",
      "Real-time PostgreSQL event log",
      "Live per-line breakdown analytics",
      "CSV export of all crossing events",
    ],
    useCases: ["Toll gate counting", "Lane-wise traffic flow", "Pedestrian crossing monitoring", "Entry/Exit gates"],
  },
  {
    id: "polygons",
    label: "Polygon Zone Presence",
    icon: Hexagon,
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.1)",
    accentBorder: "rgba(245,158,11,0.3)",
    tag: "Service 2",
    tagColor: "#fbbf24",
    badge: "LIVE",
    badgeColor: "#10b981",
    description: "Draw custom polygon zones over parking bays, intersections, queuing areas, or any region of interest. AATMS tracks the moment each vehicle enters or exits the zone, maintaining live occupancy counts.",
    techDetails: "Utilises Supervision's vectorised PolygonZone with bottom-centre anchoring for spatial efficiency. State per track-ID per zone prevents re-triggering for stationary vehicles.",
    features: [
      "Up to 50 named zones per camera",
      "Entry / Exit timestamp logging",
      "Live zone occupancy counter",
      "Per-zone per-class breakdown",
      "Tracks disappearing vehicles via DB lookup",
      "CSV export of zone events",
    ],
    useCases: ["Parking occupancy", "Intersection dwell time", "Queue detection", "Restricted zone monitoring"],
  },
  {
    id: "coming_heatmap",
    label: "Traffic Heatmap",
    icon: BarChart3,
    accent: "#ec4899",
    accentBg: "rgba(236,72,153,0.1)",
    accentBorder: "rgba(236,72,153,0.25)",
    tag: "Coming Soon",
    tagColor: "#f472b6",
    badge: "PLANNED",
    badgeColor: "#94a3b8",
    description: "Generate density heatmaps from accumulated vehicle trajectories. Identify high-congestion regions, frequent turning zones, and unusual movement patterns over time.",
    techDetails: "Will use Gaussian kernel density estimation over bottom-centre track histories, rendered frame-by-frame as a colour overlay (blue→red intensity map).",
    features: [
      "Temporal heatmap accumulation",
      "Export as PNG / MP4 overlay",
      "Configurable decay rate",
      "Multi-class heatmaps",
    ],
    useCases: ["Congestion hotspot detection", "Road planning analytics", "Accident black-spot identification"],
  },
  {
    id: "coming_speed",
    label: "Speed Estimation",
    icon: TrendingUp,
    accent: "#06b6d4",
    accentBg: "rgba(6,182,212,0.1)",
    accentBorder: "rgba(6,182,212,0.25)",
    tag: "Coming Soon",
    tagColor: "#22d3ee",
    badge: "PLANNED",
    badgeColor: "#94a3b8",
    description: "Estimate vehicle speed in km/h using homographic projection and calibrated real-world distances. Flag over-speed events with track ID and class.",
    techDetails: "Requires user-defined calibration markers (at least 4 ground-plane reference points with known real-world distances). Applies perspective transform to convert pixel displacement per frame to m/s.",
    features: [
      "Real-world km/h estimation",
      "Homographic calibration UI",
      "Speed violation event log",
      "Per-class speed distribution",
    ],
    useCases: ["Speed enforcement", "Average speed analytics", "Heavy vehicle compliance"],
  },
  {
    id: "coming_lpr",
    label: "License Plate Recognition",
    icon: Camera,
    accent: "#84cc16",
    accentBg: "rgba(132,204,22,0.1)",
    accentBorder: "rgba(132,204,22,0.25)",
    tag: "Coming Soon",
    tagColor: "#a3e635",
    badge: "PLANNED",
    badgeColor: "#94a3b8",
    description: "Detect and read Indian vehicle license plates using our custom-trained two-stage pipeline: ALPR detector + OCR. Associates plate text with track ID for persistent identification.",
    techDetails: "Stage 1: Custom YOLOv8 trained on Indian LP dataset detects plate bounding boxes. Stage 2: Plate ROI is passed to a fine-tuned TrOCR / CRNN for character recognition. Results linked to track IDs.",
    features: [
      "Indian plate format support (white/yellow/green)",
      "Multi-state plate formats",
      "Persistent plate–track association",
      "Blacklist / whitelist alerting",
    ],
    useCases: ["Access control", "Parking management", "Traffic enforcement", "Stolen vehicle alerts"],
  },
];

// ── Tech Stack badges ─────────────────────────────────────────────────────────
const TECH_STACK = [
  { icon: Cpu,       label: "CUDA Accelerated",     detail: "NVIDIA GPU via PyTorch CUDA backend",          color: "#22c55e" },
  { icon: Eye,       label: "Custom YOLO Model",     detail: "Trained on Indian vehicles + license plates",  color: "#6366f1" },
  { icon: GitBranch, label: "DeepSORT Tracker",      detail: "Numba-optimised CUDA DeepSORT for occlusion",  color: "#f59e0b" },
  { icon: Database,  label: "PostgreSQL Storage",    detail: "All events logged with timestamp & metadata",  color: "#06b6d4" },
  { icon: Server,    label: "FastAPI Backend",        detail: "Async WebSocket streaming, REST APIs",         color: "#ec4899" },
  { icon: Layers,    label: "React + Vite Frontend", detail: "Real-time Konva canvas ROI editor",            color: "#84cc16" },
  { icon: Lock,      label: "JWT Auth",              detail: "Role-based access, secure token login",        color: "#a855f7" },
  { icon: MapPin,    label: "3D GIS Map",            detail: "Cesium.js satellite + camera coordinate view", color: "#f97316" },
];

export default function ServicesPage({ token, availableModels, availableJobs, cameraId }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeService, setActiveService] = useState(null); // null = show landing
  const [expandedCard, setExpandedCard] = useState(null);

  const liveServices = SERVICES.filter(s => s.badge === "LIVE");
  const plannedServices = SERVICES.filter(s => s.badge === "PLANNED");

  const currentService = activeService ? SERVICES.find(s => s.id === activeService) : null;
  const Icon = currentService?.icon || LayoutGrid;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "80vh", position: "relative" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <div className="services-sidebar" style={{ width: sidebarOpen ? 260 : 56, transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0 }}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="flex items-center gap-2 overflow-hidden">
              <LayoutGrid className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-widest whitespace-nowrap">Traffic Services</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(p => !p)} className="sidebar-toggle-btn"
            title={sidebarOpen ? "Collapse" : "Expand"}>
            {sidebarOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {/* Overview item */}
        <div className="sidebar-items">
          <button
            onClick={() => setActiveService(null)}
            className={`sidebar-item ${!activeService ? "sidebar-item-active" : ""}`}
            title={!sidebarOpen ? "Overview" : undefined}>
            <span className="sidebar-item-icon" style={!activeService ? { color: "#6366f1" } : {}}>
              <LayoutGrid className="w-5 h-5" />
            </span>
            {sidebarOpen && (
              <span className="sidebar-item-label" style={!activeService ? { color: "#6366f1" } : {}}>
                Services Overview
                <span className="sidebar-item-tag" style={{ color: "#94a3b8" }}>Platform</span>
              </span>
            )}
          </button>

          {/* Live services */}
          {sidebarOpen && <div className="sidebar-section-label mt-3">Active Services</div>}
          {liveServices.map(svc => {
            const SvcIcon = svc.icon;
            const active = activeService === svc.id;
            return (
              <button key={svc.id} onClick={() => setActiveService(svc.id)}
                className={`sidebar-item ${active ? "sidebar-item-active" : ""}`}
                style={active ? { borderColor: svc.accentBorder, background: svc.accentBg } : {}}
                title={!sidebarOpen ? svc.label : undefined}>
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

          {/* Coming soon */}
          {sidebarOpen && <div className="sidebar-section-label mt-3">Coming Soon</div>}
          {plannedServices.map(svc => {
            const SvcIcon = svc.icon;
            return (
              <button key={svc.id}
                className="sidebar-item opacity-50 cursor-not-allowed"
                title={!sidebarOpen ? svc.label + " (planned)" : undefined}
                disabled>
                <span className="sidebar-item-icon"><SvcIcon className="w-5 h-5" /></span>
                {sidebarOpen && (
                  <span className="sidebar-item-label">
                    {svc.label}
                    <span className="sidebar-item-tag" style={{ color: svc.tagColor }}>{svc.tag}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {sidebarOpen && (
          <div className="sidebar-footer">
            <div className="flex items-center gap-2 text-[10px] text-emerald-500 font-semibold">
              <Activity className="w-3.5 h-3.5" /> Backend Connected
            </div>
            <div className="text-[9px] text-slate-600 mt-0.5">Camera: {cameraId || "default"}</div>
            <div className="text-[9px] text-slate-600 mt-0.5 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> Local Dashboard Instance
            </div>
          </div>
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="services-main-content" style={{ flex: 1, minWidth: 0 }}>

        {/* ═══ LANDING PAGE ═══════════════════════════════════════════════ */}
        {!activeService && (
          <div className="svc-landing">

            {/* Hero */}
            <div className="landing-hero">
              <div className="landing-hero-badge">
                <Zap className="w-3.5 h-3.5" /> AATMS · AI-Powered Traffic Analytics
              </div>
              <h1 className="landing-hero-title">
                Advanced Automated Traffic<br />
                <span className="landing-hero-accent">Management Services</span>
              </h1>
              <p className="landing-hero-sub">
                A fully local, privacy-first traffic analytics platform built on custom-trained Indian vehicle detection models,
                CUDA-accelerated DeepSORT tracking, and real-time event logging to PostgreSQL.
                No cloud. No latency. Full control.
              </p>
              <div className="landing-hero-chips">
                <span className="landing-chip green"><CheckCircle2 className="w-3 h-3" /> Runs 100% Locally</span>
                <span className="landing-chip indigo"><Cpu className="w-3 h-3" /> CUDA + CPU Support</span>
                <span className="landing-chip amber"><Database className="w-3 h-3" /> PostgreSQL Backed</span>
                <span className="landing-chip pink"><Camera className="w-3 h-3" /> Indian Vehicle Trained</span>
              </div>
            </div>

            {/* Tech stack grid */}
            <div className="landing-section-title">
              <Shield className="w-4 h-4 text-indigo-400" /> Technology Stack
            </div>
            <div className="tech-grid">
              {TECH_STACK.map(t => {
                const TIcon = t.icon;
                return (
                  <div key={t.label} className="tech-card">
                    <div className="tech-card-icon" style={{ background: t.color + "20", color: t.color }}>
                      <TIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="tech-card-label" style={{ color: t.color }}>{t.label}</p>
                      <p className="tech-card-detail">{t.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Services catalogue */}
            <div className="landing-section-title mt-8">
              <LayoutGrid className="w-4 h-4 text-indigo-400" /> Service Catalogue
            </div>

            {/* Live services */}
            <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-widest mb-3">
              ● Currently Active ({liveServices.length})
            </p>
            <div className="service-cards-grid mb-8">
              {liveServices.map(svc => {
                const SvcIcon = svc.icon;
                const expanded = expandedCard === svc.id;
                return (
                  <div key={svc.id}
                    className="service-desc-card"
                    style={{ borderColor: svc.accentBorder, background: svc.accentBg + "80" }}>
                    <div className="sdc-header">
                      <div className="sdc-icon" style={{ background: svc.accent + "25", border: `1px solid ${svc.accentBorder}` }}>
                        <SvcIcon className="w-6 h-6" style={{ color: svc.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="sdc-title">{svc.label}</h3>
                          <span className="sdc-tag" style={{ background: svc.accent + "20", color: svc.tagColor, borderColor: svc.accentBorder }}>{svc.tag}</span>
                          <span className="sdc-live-badge">● LIVE</span>
                        </div>
                        <p className="sdc-desc">{svc.description}</p>
                      </div>
                    </div>

                    <div className="sdc-features">
                      {svc.features.map(f => (
                        <span key={f} className="sdc-feature-chip">
                          <CheckCircle2 className="w-2.5 h-2.5" style={{ color: svc.accent }} /> {f}
                        </span>
                      ))}
                    </div>

                    {expanded && (
                      <div className="sdc-expanded">
                        <div className="sdc-tech-note">
                          <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                          <span className="text-[11px] text-slate-400">{svc.techDetails}</span>
                        </div>
                        <div className="mt-3">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Use Cases</p>
                          <div className="flex flex-wrap gap-1.5">
                            {svc.useCases.map(u => (
                              <span key={u} className="use-case-chip">{u}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="sdc-footer">
                      <button onClick={() => setExpandedCard(expanded ? null : svc.id)}
                        className="sdc-expand-btn" style={{ color: svc.accent }}>
                        {expanded ? "Show less ↑" : "Learn more ↓"}
                      </button>
                      <button onClick={() => setActiveService(svc.id)}
                        className="btn btn-primary btn-sm gap-1.5"
                        style={{ background: `linear-gradient(135deg,${svc.accent}cc,${svc.accent})`, boxShadow: `0 0 20px ${svc.accent}40` }}>
                        <Zap className="w-3.5 h-3.5" /> Launch Service
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Planned services */}
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-3">
              ⏳ Coming Soon ({plannedServices.length})
            </p>
            <div className="service-cards-grid planned-grid">
              {plannedServices.map(svc => {
                const SvcIcon = svc.icon;
                const expanded = expandedCard === svc.id;
                return (
                  <div key={svc.id} className="service-desc-card planned-card"
                    style={{ borderColor: svc.accentBorder + "60", background: svc.accentBg + "40", opacity: 0.8 }}>
                    <div className="sdc-header">
                      <div className="sdc-icon" style={{ background: svc.accent + "15", border: `1px solid ${svc.accentBorder}` }}>
                        <SvcIcon className="w-6 h-6" style={{ color: svc.accent + "bb" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="sdc-title" style={{ color: "#94a3b8" }}>{svc.label}</h3>
                          <span className="sdc-tag" style={{ background: "#1e293b", color: "#64748b", borderColor: "#334155" }}>Coming Soon</span>
                        </div>
                        <p className="sdc-desc" style={{ color: "#475569" }}>{svc.description}</p>
                      </div>
                    </div>
                    <div className="sdc-features" style={{ opacity: 0.6 }}>
                      {svc.features.map(f => (
                        <span key={f} className="sdc-feature-chip" style={{ borderColor: "#334155", color: "#475569" }}>
                          <CheckCircle2 className="w-2.5 h-2.5 text-slate-600" /> {f}
                        </span>
                      ))}
                    </div>
                    {expanded && (
                      <div className="sdc-expanded">
                        <div className="sdc-tech-note">
                          <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-600" />
                          <span className="text-[11px] text-slate-500">{svc.techDetails}</span>
                        </div>
                      </div>
                    )}
                    <div className="sdc-footer">
                      <button onClick={() => setExpandedCard(expanded ? null : svc.id)}
                        className="sdc-expand-btn" style={{ color: "#64748b" }}>
                        {expanded ? "Show less ↑" : "Learn more ↓"}
                      </button>
                      <span className="text-[10px] text-slate-600 font-semibold px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700">
                        ⏳ In Development
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ ACTIVE SERVICE ═════════════════════════════════════════════ */}
        {activeService && currentService && (
          <>
            {/* Service banner */}
            <div className="service-info-banner"
              style={{ borderColor: currentService.accentBorder, background: currentService.accentBg }}>
              <div className="flex items-start gap-4">
                <div className="service-banner-icon"
                  style={{ background: `${currentService.accent}20`, border: `1px solid ${currentService.accentBorder}` }}>
                  <Icon className="w-6 h-6" style={{ color: currentService.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-base font-bold text-white">{currentService.label}</h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${currentService.accent}20`, color: currentService.tagColor, border: `1px solid ${currentService.accentBorder}` }}>
                      {currentService.tag}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                      <Zap className="w-2.5 h-2.5" /> CUDA Accelerated
                    </span>
                    <button onClick={() => setActiveService(null)}
                      className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3" /> Back to Overview
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-3xl">{currentService.description}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {currentService.features.map(f => (
                      <span key={f} className="text-[10px] font-medium text-slate-300 bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-700/50">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Service component */}
            <div className="service-body">
              {activeService === "lines" && (
                <LineCrossingService cameraId={cameraId} token={token} availableModels={availableModels} availableJobs={availableJobs} />
              )}
              {activeService === "polygons" && (
                <PolygonZoneService cameraId={cameraId} token={token} availableModels={availableModels} availableJobs={availableJobs} />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
