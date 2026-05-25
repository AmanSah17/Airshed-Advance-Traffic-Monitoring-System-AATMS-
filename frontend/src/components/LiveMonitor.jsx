import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Play, Square, Activity, Bell, ShieldCheck, Settings2,
  CheckCircle2, AlertCircle, Plus, Trash2, Zap, ArrowLeftRight,
  Hexagon, Eye, Cpu, BarChart3, ChevronDown, ChevronRight,
  Car, Truck, PersonStanding, Bike, Bus, Clock, Route, MapPin,
  RefreshCw, Info, Filter, TrendingUp, Hash
} from "lucide-react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from "recharts";

// ── Color & Class Registry ──────────────────────────────────────────────────────
const VEHICLE_CLASSES = [
  { value: "car",              label: "Car",         icon: Car,            color: "#6366f1", bg: "rgba(99,102,241,0.13)" },
  { value: "truck",            label: "Truck",       icon: Truck,          color: "#f59e0b", bg: "rgba(245,158,11,0.13)" },
  { value: "heavy-duty-truck", label: "Heavy Truck", icon: Truck,          color: "#ef4444", bg: "rgba(239,68,68,0.13)" },
  { value: "small-truck",      label: "Small Truck", icon: Truck,          color: "#fb923c", bg: "rgba(251,146,60,0.13)" },
  { value: "bus",              label: "Bus",         icon: Bus,            color: "#10b981", bg: "rgba(16,185,129,0.13)" },
  { value: "motorbike",        label: "Motorbike",   icon: Bike,           color: "#06b6d4", bg: "rgba(6,182,212,0.13)" },
  { value: "motor-bike",       label: "Motorbike",   icon: Bike,           color: "#06b6d4", bg: "rgba(6,182,212,0.13)" },
  { value: "auto",             label: "Auto",        icon: Car,            color: "#8b5cf6", bg: "rgba(139,92,246,0.13)" },
  { value: "person",           label: "Person",      icon: PersonStanding, color: "#a855f7", bg: "rgba(168,85,247,0.13)" },
  { value: "bicycle",          label: "Bicycle",     icon: Bike,           color: "#84cc16", bg: "rgba(132,204,22,0.13)" },
];

const EVENT_TYPES = [
  { value: "Line Crossing",    label: "Line Crossing",       icon: ArrowLeftRight, color: "#6366f1", desc: "Triggered when a vehicle crosses a virtual line" },
  { value: "Region Occupancy", label: "Region Occupancy",    icon: Hexagon,        color: "#f59e0b", desc: "Triggered when a vehicle enters a polygon zone" },
  { value: "Time Spent",       label: "Time Spent in Zone",  icon: Clock,          color: "#10b981", desc: "Triggered when a vehicle stays beyond threshold" },
];

const REGION_COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#06b6d4","#a855f7","#ec4899","#84cc16","#fb923c","#14b8a6"];

const formatModelName = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("quantized") || n.includes("int8")) return "AATMS Edge AI - Quantized";
    if (n.includes("tflite")) return "AATMS Edge AI - TFLite";
    if (n.includes("yolov8n") || n.includes("nano")) return "AATMS Edge AI - Nano";
    if (n.includes("yolov8s") || n.includes("small")) return "AATMS Edge AI - Small";
    if (n.includes("yolov8m") || n.includes("base")) return "AATMS Edge AI - Base";
    if (n.includes("yolov8l") || n.includes("large")) return "AATMS Edge AI - Large";
    return "AATMS Edge AI - Custom";
};

function getClassInfo(cls) {
  const key = (cls || "").toLowerCase().replace(/ /g, "-");
  return VEHICLE_CLASSES.find(v => v.value === key || v.label.toLowerCase() === key)
    || { value: cls, label: cls, icon: Car, color: "#94a3b8", bg: "rgba(148,163,184,0.12)" };
}

// ── Recharts Custom Tooltip ─────────────────────────────────────────────────────
const DarkTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(2,6,23,0.97)", border: "1px solid rgba(99,102,241,0.4)", borderRadius: "12px", padding: "10px 14px" }}>
      {label && <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "6px" }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: "13px", fontWeight: 800, color: p.color || "#f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          {p.name}: <span style={{ color: "#fff" }}>{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── Service Toggle Chip ─────────────────────────────────────────────────────────
function ServiceChip({ active, onClick, icon: Icon, label, color }) {
  return (
    <button onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px", borderRadius: "12px", border: `1px solid ${active ? color + "55" : "rgba(51,65,85,0.5)"}`, background: active ? color + "18" : "rgba(15,23,42,0.5)", color: active ? color : "#475569", fontSize: "13px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s", width: "100%", boxShadow: active ? `0 0 16px ${color}22` : "none" }}>
      <Icon style={{ width: "20px", height: "20px", flexShrink: 0 }} />
      <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: active ? color : "#1e293b", boxShadow: active ? `0 0 8px ${color}` : "none", transition: "all 0.2s", flexShrink: 0 }} />
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────────
export default function LiveMonitor({
  videoSource, cameraId, yoloModelPath, setYoloModel,
  token, trackerType, setTrackerType, availableModels = []
}) {
  const [running, setRunning] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [classCounts, setClassCounts] = useState({});
  const [regionCounts, setRegionCounts] = useState({});
  const [eventLogs, setEventLogs] = useState([]);
  const [totalVehicles, setTotalVehicles] = useState(0);
  const [fps, setFps] = useState(0);
  const [statusText, setStatusText] = useState("Ready to start");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // time-series data: [{time, total}, ...]
  const [timeSeries, setTimeSeries] = useState([]);

  const [dbRegions, setDbRegions] = useState([]);
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({ name: "", eventType: "Line Crossing", className: "car", regionLabel: "", minTime: "5", emailAlert: false });
  const [rulesExpanded, setRulesExpanded] = useState(true);
  const [activeServices, setActiveServices] = useState({ lines: true, polygons: true });
  const [smokeTestResult, setSmokeTestResult] = useState(null);
  const [testingService, setTestingService] = useState(null);
  const [rightTab, setRightTab] = useState("counts");
  const [classFilter, setClassFilter] = useState("all");
  const [countView, setCountView] = useState("bar"); // bar | pie | area

  const wsRef = useRef(null);
  const lastFrameTimeRef = useRef(Date.now());
  const prevTotalRef = useRef(0);
  const frameSkip = 1;

  const fetchRegions = () => {
    axios.get(`http://localhost:8000/api/v1/regions?camera_id=${cameraId}`)
      .then(res => setDbRegions(res.data)).catch(() => {});
  };
  useEffect(() => {
    fetchRules(); fetchRegions();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [cameraId]);

  const fetchRules = () => {
    axios.get(`http://localhost:8000/api/v1/rules?camera_id=${cameraId}`)
      .then(res => setRules(res.data)).catch(() => {});
  };

  const addRule = () => {
    if (!newRule.name.trim()) { alert("Please enter a rule name."); return; }
    if (!newRule.regionLabel) { alert("Please select a region."); return; }
    const payload = {
      name: newRule.name,
      conditions: { event_type: newRule.eventType, class_name: newRule.className, region_label: newRule.regionLabel,
        ...(newRule.eventType === "Time Spent" ? { min_time_seconds: newRule.minTime } : {}) },
      email_alert: newRule.emailAlert
    };
    axios.post(`http://localhost:8000/api/v1/rules?camera_id=${cameraId}`, payload)
      .then(() => { fetchRules(); setNewRule({ name: "", eventType: "Line Crossing", className: "car", regionLabel: "", minTime: "5", emailAlert: false }); })
      .catch(err => alert("Failed: " + (err.response?.data?.detail || err.message)));
  };

  const deleteRule = (id) => axios.delete(`http://localhost:8000/api/v1/rules/${id}`).then(fetchRules).catch(() => {});

  const runSmokeTest = (service) => {
    setTestingService(service); setSmokeTestResult(null);
    axios.get(`http://localhost:8000/api/v1/test/${service}`)
      .then(res => { setSmokeTestResult({ success: true, service, message: res.data.message, frames: res.data.frames_processed, events: res.data.events_captured_count }); setTestingService(null); })
      .catch(err => { setSmokeTestResult({ success: false, service, message: err.response?.data?.detail || "Failed." }); setTestingService(null); });
  };

  const startProcessing = () => {
    if (!videoSource) { alert("Please select a video source first!"); return; }
    setStatusText("Connecting..."); setRunning(true);
    setEventLogs([]); setClassCounts({}); setRegionCounts({}); setTotalVehicles(0); setTimeSeries([]);
    prevTotalRef.current = 0;
    const params = new URLSearchParams({ video_source: videoSource, camera_id: cameraId, frame_skip: frameSkip });
    if (yoloModelPath) params.append("model_path", yoloModelPath);
    if (trackerType) params.append("tracker_type", trackerType);
    params.append("services", Object.keys(activeServices).filter(k => activeServices[k]).join(",") || "none");
    if (token) params.append("token", token);
    wsRef.current = new WebSocket(`ws://localhost:8000/api/v1/ws/stream?${params.toString()}`);
    wsRef.current.onopen = () => setStatusText("Streaming live predictions...");
    wsRef.current.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "error") { setStatusText(`Error: ${data.message}`); setRunning(false); return; }
      if (data.frame) {
        setCurrentFrame(data.frame);
        const now = Date.now();
        setFps(Math.round(1000 / Math.max(1, now - lastFrameTimeRef.current)));
        lastFrameTimeRef.current = now;
      }
      if (data.counts) {
        setClassCounts(data.counts);
        const total = Object.values(data.counts).reduce((a, b) => a + b, 0);
        setTotalVehicles(total);
        // time-series: only add a point when total changes
        if (total !== prevTotalRef.current) {
          prevTotalRef.current = total;
          const ts = new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
          setTimeSeries(prev => [...prev.slice(-29), { time: ts, total, ...data.counts }]);
        }
      }
      if (data.region_counts) setRegionCounts(data.region_counts);
      if (data.events?.length > 0) setEventLogs(prev => [...data.events, ...prev].slice(0, 300));
    };
    wsRef.current.onclose = () => { setStatusText("Stream disconnected."); setRunning(false); };
    wsRef.current.onerror = () => { setStatusText("WebSocket error."); setRunning(false); };
  };

  const stopProcessing = () => { if (wsRef.current) wsRef.current.close(); setRunning(false); setStatusText("Stopped."); };

  const lineRegions = dbRegions.filter(r => r.type === "line");
  const polyRegions = dbRegions.filter(r => r.type === "polygon");
  const relevantRegions = newRule.eventType === "Line Crossing" ? lineRegions : polyRegions;
  const selectedET = EVENT_TYPES.find(e => e.value === newRule.eventType) || EVENT_TYPES[0];

  // Recharts data
  const barData = useMemo(() => Object.entries(classCounts)
    .map(([cls, value]) => ({ name: cls.replace(/-/g, " "), value, fill: getClassInfo(cls).color }))
    .sort((a, b) => b.value - a.value), [classCounts]);

  const pieData = useMemo(() => Object.entries(classCounts)
    .map(([cls, value]) => ({ name: cls.replace(/-/g, " "), value, color: getClassInfo(cls).color })), [classCounts]);

  const regionBarData = useMemo(() => Object.entries(regionCounts).map(([region, counts]) => ({
    region: region.length > 10 ? region.slice(0, 10) + "…" : region,
    ...counts
  })), [regionCounts]);

  const allRegionClasses = useMemo(() => {
    const s = new Set();
    Object.values(regionCounts).forEach(counts => Object.keys(counts).forEach(k => s.add(k)));
    return [...s];
  }, [regionCounts]);

  const filteredEvents = useMemo(() =>
    classFilter === "all" ? eventLogs : eventLogs.filter(e => (e.class_name || e.vehicle_id?.split("_")[0]) === classFilter),
    [eventLogs, classFilter]);

  const uniqueClasses = useMemo(() => [...new Set(eventLogs.map(e => e.class_name || e.vehicle_id?.split("_")[0]).filter(Boolean))], [eventLogs]);

  const S = { // shared style helpers
    panel: { background: "rgba(2,6,23,0.75)", border: "1px solid rgba(51,65,85,0.7)", borderRadius: "20px", backdropFilter: "blur(20px)" },
    label: { fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#475569" },
    sectionTitle: (color = "#818cf8") => ({ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color, display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }),
  };

  return (
    <div style={{ display: "flex", gap: "18px", minHeight: "88vh", alignItems: "stretch" }}>

      {/* ════════════════════════════════════════════════════════════════
          LEFT SIDEBAR — Pipeline Settings & Rule Builder
      ════════════════════════════════════════════════════════════════ */}
      <div style={{ width: sidebarOpen ? "300px" : "0px", flexShrink: 0, overflow: sidebarOpen ? "auto" : "hidden", transition: "width 0.3s cubic-bezier(0.4,0,0.2,1)", maxHeight: "90vh" }}>
        {sidebarOpen && (
          <div style={{ ...S.panel, padding: "22px", display: "flex", flexDirection: "column", gap: "22px", height: "100%", overflowY: "auto" }}>
            
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "16px", borderBottom: "1px solid rgba(51,65,85,0.5)" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Settings2 style={{ width: "20px", height: "20px", color: "#818cf8" }} />
              </div>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>Pipeline Engine</p>
                <p style={{ fontSize: "11px", color: running ? "#10b981" : "#64748b", fontWeight: 600 }}>● {running ? "ACTIVE — Processing" : "IDLE"}</p>
              </div>
            </div>

            {/* Traffic Services */}
            <div>
              <p style={S.label}>Traffic Services</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                <ServiceChip active={activeServices.lines} onClick={() => setActiveServices(s => ({ ...s, lines: !s.lines }))} icon={ArrowLeftRight} label="Line Crossing Counter" color="#6366f1" />
                <ServiceChip active={activeServices.polygons} onClick={() => setActiveServices(s => ({ ...s, polygons: !s.polygons }))} icon={Hexagon} label="Polygon Zone Tracker" color="#f59e0b" />
              </div>
            </div>

            {/* Smoke Tests */}
            <div>
              <p style={S.label}>Engine Diagnostics</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }}>
                {[{ key: "lines", label: "Verify Line Engine", color: "#6366f1" }, { key: "polygons", label: "Verify Polygon Engine", color: "#f59e0b" }].map(svc => (
                  <button key={svc.key} onClick={() => runSmokeTest(svc.key)} disabled={testingService !== null}
                    style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 14px", borderRadius: "12px", border: `1px solid ${svc.color}35`, background: svc.color + "10", color: svc.color, fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
                    {testingService === svc.key ? <RefreshCw style={{ width: "17px", height: "17px", animation: "spin 1s linear infinite" }} /> : <CheckCircle2 style={{ width: "17px", height: "17px" }} />}
                    {testingService === svc.key ? "Running test…" : svc.label}
                  </button>
                ))}
              </div>
              {smokeTestResult && (
                <div style={{ marginTop: "10px", padding: "12px", borderRadius: "12px", border: `1px solid ${smokeTestResult.success ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`, background: smokeTestResult.success ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: smokeTestResult.success ? "#10b981" : "#ef4444", display: "flex", alignItems: "center", gap: "6px" }}>
                      {smokeTestResult.success ? <CheckCircle2 style={{ width: "14px", height: "14px" }} /> : <AlertCircle style={{ width: "14px", height: "14px" }} />}
                      {smokeTestResult.service} Engine
                    </span>
                    <button onClick={() => setSmokeTestResult(null)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>×</button>
                  </div>
                  <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.5 }}>{smokeTestResult.message}</p>
                  {smokeTestResult.success && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", paddingTop: "8px", borderTop: "1px solid rgba(51,65,85,0.4)", fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                      <span>Frames: {smokeTestResult.frames}</span><span>Events: {smokeTestResult.events}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Alert Rules */}
            <div style={{ borderTop: "1px solid rgba(51,65,85,0.5)", paddingTop: "20px", flex: 1 }}>
              <button onClick={() => setRulesExpanded(p => !p)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Bell style={{ width: "16px", height: "16px", color: "#f87171" }} />
                  </div>
                  <p style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Alert Rules</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#f87171", background: "rgba(239,68,68,0.12)", padding: "2px 9px", borderRadius: "20px", border: "1px solid rgba(239,68,68,0.2)" }}>{rules.length}</span>
                  {rulesExpanded ? <ChevronDown style={{ width: "15px", height: "15px", color: "#64748b" }} /> : <ChevronRight style={{ width: "15px", height: "15px", color: "#64748b" }} />}
                </div>
              </button>

              {rulesExpanded && (
                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  {/* Builder card */}
                  <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(51,65,85,0.6)", borderRadius: "16px", padding: "18px", display: "flex", flexDirection: "column", gap: "16px" }}>

                    {/* Name */}
                    <div>
                      <p style={{ ...S.label, marginBottom: "7px" }}>Rule Name</p>
                      <input type="text" placeholder="e.g. Heavy Truck in Zone A"
                        value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))}
                        style={{ width: "100%", background: "rgba(2,6,23,0.8)", border: "1px solid rgba(51,65,85,0.6)", borderRadius: "10px", padding: "11px 13px", fontSize: "13px", color: "#f1f5f9", outline: "none", boxSizing: "border-box" }} />
                    </div>

                    {/* Event Type */}
                    <div>
                      <p style={{ ...S.label, marginBottom: "9px" }}>Event Type</p>
                      {EVENT_TYPES.map(et => {
                        const EI = et.icon; const sel = newRule.eventType === et.value;
                        return (
                          <button key={et.value} onClick={() => setNewRule(p => ({ ...p, eventType: et.value, regionLabel: "" }))}
                            style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 13px", borderRadius: "12px", border: `1px solid ${sel ? et.color + "55" : "rgba(51,65,85,0.5)"}`, background: sel ? et.color + "15" : "rgba(15,23,42,0.4)", color: sel ? et.color : "#64748b", cursor: "pointer", textAlign: "left", marginBottom: "6px", width: "100%" }}>
                            <EI style={{ width: "20px", height: "20px", flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: "12px", fontWeight: 700 }}>{et.label}</p>
                              <p style={{ fontSize: "10px", opacity: 0.7, marginTop: "1px" }}>{et.desc}</p>
                            </div>
                            {sel && <CheckCircle2 style={{ width: "15px", height: "15px", flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Vehicle Class */}
                    <div>
                      <p style={{ ...S.label, marginBottom: "9px" }}>Vehicle Class</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                        {VEHICLE_CLASSES.filter((v, i, a) => a.findIndex(x => x.value === v.value) === i).map(vc => {
                          const VI = vc.icon; const sel = newRule.className === vc.value;
                          return (
                            <button key={vc.value} onClick={() => setNewRule(p => ({ ...p, className: vc.value }))}
                              style={{ display: "flex", alignItems: "center", gap: "9px", padding: "10px 11px", borderRadius: "10px", border: `1px solid ${sel ? vc.color + "55" : "rgba(51,65,85,0.5)"}`, background: sel ? vc.bg : "rgba(15,23,42,0.4)", color: sel ? vc.color : "#64748b", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                              <VI style={{ width: "17px", height: "17px", flexShrink: 0 }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{vc.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Region selector */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "9px" }}>
                        <p style={S.label}>{newRule.eventType === "Line Crossing" ? "Select Line" : "Select Zone"}</p>
                        <button onClick={fetchRegions} style={{ background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontSize: "10px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                          <RefreshCw style={{ width: "11px", height: "11px" }} /> Refresh
                        </button>
                      </div>
                      {relevantRegions.length === 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "11px 13px", borderRadius: "10px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.22)", color: "#fbbf24", fontSize: "11px", lineHeight: 1.5 }}>
                          <Info style={{ width: "17px", height: "17px", flexShrink: 0 }} />
                          No {newRule.eventType === "Line Crossing" ? "lines" : "zones"} found for camera "{cameraId}". Draw them in Services → {newRule.eventType === "Line Crossing" ? "Line Crossing" : "Polygon Zone"} first.
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          {relevantRegions.map((r, i) => {
                            const sel = newRule.regionLabel === r.label;
                            const c = REGION_COLORS[i % REGION_COLORS.length];
                            return (
                              <button key={r.id || r.label} onClick={() => setNewRule(p => ({ ...p, regionLabel: r.label }))}
                                style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "10px", border: `1px solid ${sel ? c + "55" : "rgba(51,65,85,0.5)"}`, background: sel ? c + "15" : "rgba(15,23,42,0.4)", color: sel ? c : "#64748b", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                                {newRule.eventType === "Line Crossing" ? <ArrowLeftRight style={{ width: "15px", height: "15px" }} /> : <Hexagon style={{ width: "15px", height: "15px" }} />}
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Min time */}
                    {newRule.eventType === "Time Spent" && (
                      <div>
                        <p style={{ ...S.label, marginBottom: "7px" }}>Min. Time Threshold (seconds)</p>
                        <input type="number" min="1" value={newRule.minTime}
                          onChange={e => setNewRule(p => ({ ...p, minTime: e.target.value }))}
                          style={{ width: "100%", background: "rgba(2,6,23,0.8)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: "10px", padding: "11px 13px", fontSize: "14px", fontWeight: 700, color: "#10b981", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    )}

                    <button onClick={addRule}
                      style={{ padding: "13px 16px", borderRadius: "12px", border: "none", fontWeight: 700, fontSize: "13px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: `linear-gradient(135deg, ${selectedET.color}cc, ${selectedET.color})`, boxShadow: `0 4px 20px ${selectedET.color}35` }}>
                      <Plus style={{ width: "18px", height: "18px" }} /> Create Alert Rule
                    </button>
                  </div>

                  {/* Active rules list */}
                  {rules.map(rule => {
                    const et = EVENT_TYPES.find(e => e.value === rule.conditions?.event_type) || EVENT_TYPES[0];
                    const vc = getClassInfo(rule.conditions?.class_name);
                    const VI = vc.icon;
                    return (
                      <div key={rule.id} style={{ padding: "12px 14px", borderRadius: "14px", border: `1px solid ${et.color}28`, background: et.color + "08", display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: vc.color + "20", border: `1px solid ${vc.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <VI style={{ width: "19px", height: "19px", color: vc.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.name}</p>
                          <p style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {rule.conditions?.class_name} @ {rule.conditions?.region_label}{rule.conditions?.min_time_seconds ? ` › ${rule.conditions.min_time_seconds}s` : ""}
                          </p>
                        </div>
                        <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", padding: "4px", borderRadius: "6px" }}
                          onMouseEnter={e => e.currentTarget.style.color = "#f87171"} onMouseLeave={e => e.currentTarget.style.color = "#475569"}>
                          <Trash2 style={{ width: "16px", height: "16px" }} />
                        </button>
                      </div>
                    );
                  })}

                  {rules.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px", color: "#334155", fontSize: "12px" }}>
                      <Bell style={{ width: "28px", height: "28px", opacity: 0.25, margin: "0 auto 8px" }} />
                      No alert rules. Create one above.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════
          CENTER + RIGHT  —  Video Feed & Analytics Dashboard
      ════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>

        {/* Inference Engine Control Bar */}
        <div style={{ ...S.panel, padding: "14px 20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <button onClick={() => setSidebarOpen(p => !p)}
            style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
            <Settings2 style={{ width: "20px", height: "20px", color: "#818cf8" }} />
          </button>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#f1f5f9", display: "flex", alignItems: "center", gap: "8px" }}>
              <Activity style={{ width: "17px", height: "17px", color: "#10b981" }} /> Inference Engine
            </p>
            <p style={{ fontSize: "11px", color: "#64748b" }}>CUDA-Accelerated Detection & Tracking</p>
          </div>

          {[
            { title: "Model", value: yoloModelPath, options: availableModels.map(m => ({ val: m, lbl: formatModelName(m) })), onChange: e => setYoloModel(e.target.value) },
            { title: "Tracker", value: trackerType, options: [{ val: "deepsort", lbl: "AATMS Advanced Tracker (v1)" }, { val: "bytetrack", lbl: "AATMS Fast Tracker (v2)" }, { val: "botsort", lbl: "AATMS Accurate Tracker (v3)" }], onChange: e => setTrackerType(e.target.value) },
          ].map(sel => (
            <div key={sel.title}>
              <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: "#475569", marginBottom: "4px" }}>{sel.title}</p>
              <select value={sel.value} onChange={sel.onChange}
                style={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(51,65,85,0.6)", borderRadius: "10px", padding: "9px 13px", fontSize: "12px", fontWeight: 600, color: "#f1f5f9", outline: "none", minWidth: "155px" }}>
                {sel.options.map(o => <option key={o.val} value={o.val}>{o.lbl}</option>)}
              </select>
            </div>
          ))}

          {running && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "10px", padding: "8px 14px" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#10b981" }}>LIVE</span>
              </div>
              <div style={{ background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "10px", padding: "8px 14px", fontSize: "12px", fontWeight: 700, color: "#94a3b8" }}>{fps} FPS</div>
            </>
          )}
        </div>

        {/* Main Grid: Video (left) + Dashboard (right) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 390px", gap: "16px", flex: 1, minHeight: 0 }}>

          {/* ── Video column ─────────────────────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", display: "flex", alignItems: "center", gap: "6px" }}>
                <Eye style={{ width: "15px", height: "15px" }} /> {statusText}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                {["lines", "polygons"].filter(k => activeServices[k]).map(k => (
                  <span key={k} style={{ fontSize: "10px", fontWeight: 700, padding: "4px 11px", borderRadius: "8px", background: k === "lines" ? "rgba(99,102,241,0.15)" : "rgba(245,158,11,0.15)", border: `1px solid ${k === "lines" ? "rgba(99,102,241,0.35)" : "rgba(245,158,11,0.35)"}`, color: k === "lines" ? "#818cf8" : "#fbbf24" }}>
                    {k === "lines" ? "Lines" : "Zones"}
                  </span>
                ))}
              </div>
            </div>

            {/* Video frame */}
            <div style={{ borderRadius: "20px", overflow: "hidden", border: `2px solid ${running ? "rgba(16,185,129,0.4)" : "rgba(51,65,85,0.5)"}`, background: "#020617", aspectRatio: "16/9", position: "relative", boxShadow: running ? "0 0 40px rgba(16,185,129,0.1)" : "none" }}>
              {currentFrame ? (
                <img src={currentFrame} alt="Live Stream" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px", textAlign: "center" }}>
                  <div style={{ position: "relative", marginBottom: "24px" }}>
                    <div style={{ width: "88px", height: "88px", borderRadius: "22px", background: "rgba(15,23,42,0.8)", border: "1px solid rgba(51,65,85,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Cpu style={{ width: "44px", height: "44px", color: "#1e293b" }} />
                    </div>
                    <div style={{ position: "absolute", top: "-5px", right: "-5px", width: "24px", height: "24px", borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 12px #6366f180" }}>
                      <Zap style={{ width: "13px", height: "13px", color: "#fff" }} />
                    </div>
                  </div>
                  <p style={{ fontSize: "17px", fontWeight: 700, color: "#475569", marginBottom: "8px" }}>Stream Not Active</p>
                  <p style={{ fontSize: "12px", color: "#334155", maxWidth: "280px", lineHeight: 1.7 }}>
                    Select a video source from the top bar then click <span style={{ color: "#10b981", fontWeight: 700 }}>Start Analysis</span> to begin.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "28px", width: "100%" }}>
                    {[
                      { icon: Eye, label: "AATMS Detection", color: "#6366f1" },
                      { icon: Route, label: "AATMS Tracking", color: "#10b981" },
                      { icon: MapPin, label: "Zone Analytics", color: "#f59e0b" },
                    ].map(f => (
                      <div key={f.label} style={{ padding: "14px 8px", borderRadius: "14px", background: "rgba(15,23,42,0.7)", border: "1px solid rgba(51,65,85,0.4)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <f.icon style={{ width: "20px", height: "20px", color: f.color }} />
                        <span style={{ fontSize: "10px", color: "#475569", textAlign: "center", lineHeight: 1.4 }}>{f.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {running && (
                <>
                  {/* Top-left: status + rules */}
                  <div style={{ position: "absolute", top: "12px", left: "12px", display: "flex", gap: "8px", zIndex: 10 }}>
                    <span style={{ background: "rgba(2,6,23,0.85)", backdropFilter: "blur(8px)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: "9px", padding: "6px 11px", fontSize: "11px", fontWeight: 700, color: "#10b981", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} /> Live
                    </span>
                    {rules.length > 0 && (
                      <span style={{ background: "rgba(2,6,23,0.85)", backdropFilter: "blur(8px)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: "9px", padding: "6px 11px", fontSize: "11px", fontWeight: 700, color: "#f87171", display: "flex", alignItems: "center", gap: "6px" }}>
                        <Bell style={{ width: "11px", height: "11px" }} /> {rules.length} Rules
                      </span>
                    )}
                  </div>

                  {/* Top-right: FPS + Detections overlay */}
                  <div style={{ position: "absolute", top: "12px", right: "12px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", zIndex: 10 }}>
                    {/* FPS badge */}
                    <div style={{ background: "rgba(2,6,23,0.88)", backdropFilter: "blur(10px)", border: "1px solid rgba(99,102,241,0.45)", borderRadius: "10px", padding: "7px 13px", display: "flex", alignItems: "baseline", gap: "5px" }}>
                      <span style={{ fontSize: "20px", fontWeight: 900, color: fps >= 20 ? "#818cf8" : fps >= 10 ? "#fbbf24" : "#f87171", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{fps}</span>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>FPS</span>
                    </div>
                    {/* Total detections badge */}
                    {totalVehicles > 0 && (
                      <div style={{ background: "rgba(2,6,23,0.88)", backdropFilter: "blur(10px)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: "10px", padding: "6px 12px", display: "flex", alignItems: "baseline", gap: "5px" }}>
                        <span style={{ fontSize: "18px", fontWeight: 900, color: "#fbbf24", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{totalVehicles}</span>
                        <span style={{ fontSize: "9px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Objects</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Start / Stop */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              {!running ? (
                <button onClick={startProcessing}
                  style={{ padding: "14px 44px", borderRadius: "16px", border: "none", fontWeight: 700, fontSize: "15px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", background: "linear-gradient(135deg,#059669,#0d9488)", boxShadow: "0 4px 28px rgba(5,150,105,0.45)" }}>
                  <Play style={{ width: "22px", height: "22px" }} /> Start Analysis Pipeline
                </button>
              ) : (
                <button onClick={stopProcessing}
                  style={{ padding: "14px 44px", borderRadius: "16px", border: "none", fontWeight: 700, fontSize: "15px", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", background: "linear-gradient(135deg,#dc2626,#db2777)", boxShadow: "0 4px 28px rgba(220,38,38,0.45)" }}>
                  <Square style={{ width: "22px", height: "22px" }} /> Stop Analysis Pipeline
                </button>
              )}
            </div>
          </div>

          {/* ══ RIGHT ANALYTICS DASHBOARD ══════════════════════════════════════════ */}
          <div style={{ ...S.panel, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Tab Bar */}
            <div style={{ display: "flex", padding: "8px", gap: "4px", borderBottom: "1px solid rgba(51,65,85,0.5)", background: "rgba(15,23,42,0.4)", flexShrink: 0 }}>
              {[
                { key: "counts", label: "Analytics", icon: BarChart3 },
                { key: "events", label: "Events", icon: Bell, badge: eventLogs.length },
                { key: "rules",  label: "Rules",   icon: ShieldCheck, badge: rules.length },
              ].map(tab => {
                const TI = tab.icon; const active = rightTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setRightTab(tab.key)}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "10px 6px", borderRadius: "12px", border: `1px solid ${active ? "rgba(99,102,241,0.4)" : "transparent"}`, background: active ? "rgba(99,102,241,0.15)" : "transparent", color: active ? "#818cf8" : "#475569", fontSize: "12px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}>
                    <TI style={{ width: "16px", height: "16px" }} />
                    {tab.label}
                    {tab.badge > 0 && (
                      <span style={{ background: active ? "rgba(99,102,241,0.3)" : "rgba(51,65,85,0.6)", color: active ? "#c7d2fe" : "#64748b", fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "20px" }}>{tab.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Scrollable Content — fixed height so all tabs are contained */}
            <div style={{ height: "calc(100vh - 280px)", minHeight: "420px", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px",
              scrollbarWidth: "thin", scrollbarColor: "rgba(99,102,241,0.3) transparent" }}>

              {/* ─── ANALYTICS TAB ─────────────────────────────────────────────── */}
              {rightTab === "counts" && (
                <>
                  {/* Hero Card */}
                  <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.05))", border: "1px solid rgba(99,102,241,0.35)", borderRadius: "18px", padding: "20px", display: "flex", alignItems: "center", gap: "18px" }}>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "52px", fontWeight: 900, color: "#fff", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{totalVehicles}</p>
                      <p style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#818cf8", marginTop: "4px" }}>Total Detections</p>
                    </div>
                    <div style={{ flex: 1, borderLeft: "1px solid rgba(99,102,241,0.2)", paddingLeft: "18px" }}>
                      {[
                        { label: "Classes", value: Object.keys(classCounts).length, color: "#818cf8" },
                        { label: "Regions", value: Object.keys(regionCounts).length, color: "#f59e0b" },
                        { label: "Events", value: eventLogs.length, color: "#10b981" },
                        { label: "Rules", value: rules.length, color: "#f87171" },
                      ].map(s => (
                        <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                          <span style={{ fontSize: "11px", color: "#64748b" }}>{s.label}</span>
                          <span style={{ fontSize: "12px", fontWeight: 800, color: s.color }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chart toggle */}
                  {barData.length > 0 && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[{ k: "bar", l: "Bar", i: BarChart3 }, { k: "pie", l: "Pie", i: Hash }, { k: "area", l: "Timeline", i: TrendingUp }].map(v => {
                        const VI = v.i; const active = countView === v.k;
                        return (
                          <button key={v.k} onClick={() => setCountView(v.k)}
                            style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", padding: "8px 6px", borderRadius: "10px", border: `1px solid ${active ? "rgba(99,102,241,0.5)" : "rgba(51,65,85,0.4)"}`, background: active ? "rgba(99,102,241,0.15)" : "rgba(15,23,42,0.4)", color: active ? "#818cf8" : "#64748b", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>
                            <VI style={{ width: "13px", height: "13px" }} />{v.l}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* BAR chart */}
                  {countView === "bar" && barData.length > 0 && (
                    <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "16px", padding: "16px" }}>
                      <p style={S.sectionTitle()}><BarChart3 style={{ width: "14px", height: "14px" }} /> Class Distribution</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={barData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b", fontWeight: 600 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<DarkTooltip />} />
                          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={40}>
                            {barData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* PIE chart */}
                  {countView === "pie" && pieData.length > 0 && (
                    <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "16px", padding: "16px" }}>
                      <p style={S.sectionTitle()}><Hash style={{ width: "14px", height: "14px" }} /> Vehicle Composition</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={3} strokeWidth={0}>
                            {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip content={<DarkTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px", color: "#64748b" }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* AREA / timeline chart */}
                  {countView === "area" && timeSeries.length > 1 && (
                    <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "16px", padding: "16px" }}>
                      <p style={S.sectionTitle("#10b981")}><TrendingUp style={{ width: "14px", height: "14px" }} /> Detections Over Time</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <AreaChart data={timeSeries} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                          <defs>
                            <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" vertical={false} />
                          <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <Tooltip content={<DarkTooltip />} />
                          <Area type="monotone" dataKey="total" stroke="#6366f1" fill="url(#totalGrad)" strokeWidth={2} dot={false} name="Total" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {countView === "area" && timeSeries.length <= 1 && (
                    <div style={{ textAlign: "center", padding: "30px", color: "#334155", fontSize: "12px" }}>
                      <TrendingUp style={{ width: "28px", height: "28px", opacity: 0.2, margin: "0 auto 8px" }} />
                      Timeline builds as pipeline processes frames.
                    </div>
                  )}

                  {barData.length === 0 && (
                    <div style={{ textAlign: "center", padding: "30px", color: "#334155", fontSize: "12px" }}>
                      <BarChart3 style={{ width: "32px", height: "32px", opacity: 0.2, margin: "0 auto 10px" }} />
                      Start the pipeline to see live analytics.
                    </div>
                  )}

                  {/* Region breakdown stacked bar */}
                  {regionBarData.length > 0 && allRegionClasses.length > 0 && (
                    <div style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.5)", borderRadius: "16px", padding: "16px" }}>
                      <p style={S.sectionTitle("#f59e0b")}><MapPin style={{ width: "14px", height: "14px" }} /> Region-wise Breakdown</p>
                      <ResponsiveContainer width="100%" height={Math.max(160, regionBarData.length * 38)}>
                        <BarChart data={regionBarData} layout="vertical" margin={{ top: 0, right: 0, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.4)" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="region" tick={{ fontSize: 10, fill: "#94a3b8", fontWeight: 600 }} axisLine={false} tickLine={false} width={60} />
                          <Tooltip content={<DarkTooltip />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "10px", color: "#64748b" }} />
                          {allRegionClasses.map((cls, i) => (
                            <Bar key={cls} dataKey={cls} stackId="a" fill={getClassInfo(cls).color} radius={i === allRegionClasses.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]} maxBarSize={20} />
                          ))}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

              {/* ─── EVENTS TAB ────────────────────────────────────────────────── */}
              {rightTab === "events" && (
                <>
                  {/* Stats row */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    {[
                      { label: "Total", value: eventLogs.length, color: "#6366f1" },
                      { label: "IN", value: eventLogs.filter(e => e.direction === "IN").length, color: "#10b981" },
                      { label: "OUT", value: eventLogs.filter(e => e.direction === "OUT").length, color: "#ef4444" },
                    ].map(s => (
                      <div key={s.label} style={{ padding: "14px 10px", borderRadius: "14px", background: s.color + "10", border: `1px solid ${s.color}28`, textAlign: "center" }}>
                        <p style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em", color: s.color + "bb", marginBottom: "4px" }}>{s.label}</p>
                        <p style={{ fontSize: "26px", fontWeight: 900, color: "#fff" }}>{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Class filter chips */}
                  {uniqueClasses.length > 0 && (
                    <div>
                      <p style={{ ...S.label, marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <Filter style={{ width: "12px", height: "12px" }} /> Filter by Class
                      </p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        <button onClick={() => setClassFilter("all")}
                          style={{ fontSize: "11px", fontWeight: 700, padding: "5px 12px", borderRadius: "9px", border: `1px solid ${classFilter === "all" ? "rgba(99,102,241,0.5)" : "rgba(51,65,85,0.5)"}`, background: classFilter === "all" ? "rgba(99,102,241,0.15)" : "rgba(15,23,42,0.4)", color: classFilter === "all" ? "#818cf8" : "#64748b", cursor: "pointer" }}>All</button>
                        {uniqueClasses.map(cls => {
                          const info = getClassInfo(cls); const sel = classFilter === cls;
                          return (
                            <button key={cls} onClick={() => setClassFilter(cls)}
                              style={{ fontSize: "11px", fontWeight: 700, padding: "5px 12px", borderRadius: "9px", border: `1px solid ${sel ? info.color + "55" : "rgba(51,65,85,0.5)"}`, background: sel ? info.bg : "rgba(15,23,42,0.4)", color: sel ? info.color : "#64748b", cursor: "pointer" }}>{cls}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <p style={S.label}>Crossing Log ({filteredEvents.length})</p>
                    {eventLogs.length > 0 && (
                      <button onClick={() => setEventLogs([])}
                        style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "11px", fontWeight: 700, display: "flex", alignItems: "center", gap: "4px" }}>
                        <Trash2 style={{ width: "12px", height: "12px" }} /> Clear
                      </button>
                    )}
                  </div>

                  {filteredEvents.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "36px", color: "#334155", fontSize: "13px" }}>
                      <Bell style={{ width: "32px", height: "32px", opacity: 0.2, margin: "0 auto 10px" }} />
                      {running ? "Waiting for crossing events…" : "Start the pipeline to see events."}
                    </div>
                  ) : filteredEvents.map((log, idx) => {
                    const info = getClassInfo(log.class_name || log.vehicle_id?.split("_")[0]);
                    const VI = info.icon; const isIn = log.direction === "IN";
                    return (
                      <div key={idx} style={{ padding: "11px 13px", borderRadius: "13px", border: "1px solid rgba(51,65,85,0.45)", background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", gap: "11px", marginBottom: "5px" }}>
                        <div style={{ width: "40px", height: "40px", borderRadius: "11px", background: info.color + "18", border: `1px solid ${info.color}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <VI style={{ width: "20px", height: "20px", color: info.color }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: "12px", fontWeight: 700, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.vehicle_id}</p>
                          <p style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{log.region_label} • {new Date(log.timestamp).toLocaleTimeString()}</p>
                        </div>
                        <span style={{ padding: "5px 11px", borderRadius: "9px", fontSize: "11px", fontWeight: 800, flexShrink: 0, background: isIn ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)", color: isIn ? "#10b981" : "#ef4444", border: `1px solid ${isIn ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}` }}>{log.direction}</span>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ─── RULES TAB ─────────────────────────────────────────────────── */}
              {rightTab === "rules" && (
                <>
                  {rules.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "44px 20px", color: "#334155" }}>
                      <ShieldCheck style={{ width: "40px", height: "40px", opacity: 0.2, margin: "0 auto 14px" }} />
                      <p style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>No Alert Rules</p>
                      <p style={{ fontSize: "12px", lineHeight: 1.6 }}>Use the left panel to create custom event rules for your camera regions.</p>
                    </div>
                  ) : rules.map(rule => {
                    const et = EVENT_TYPES.find(e => e.value === rule.conditions?.event_type) || EVENT_TYPES[0];
                    const vc = getClassInfo(rule.conditions?.class_name);
                    const EI = et.icon; const VI = vc.icon;
                    return (
                      <div key={rule.id} style={{ padding: "18px", borderRadius: "18px", border: `1px solid ${et.color}30`, background: et.color + "08", marginBottom: "10px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ width: "46px", height: "46px", borderRadius: "13px", background: et.color + "20", border: `1px solid ${et.color}35`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <EI style={{ width: "22px", height: "22px", color: et.color }} />
                            </div>
                            <div>
                              <p style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9" }}>{rule.name}</p>
                              <p style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>{rule.conditions?.event_type}</p>
                            </div>
                          </div>
                          <button onClick={() => deleteRule(rule.id)}
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "9px", padding: "7px", cursor: "pointer", color: "#f87171" }}>
                            <Trash2 style={{ width: "15px", height: "15px" }} />
                          </button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "7px" }}>
                          <span style={{ fontSize: "12px", fontWeight: 700, padding: "6px 13px", borderRadius: "10px", background: vc.bg, color: vc.color, border: `1px solid ${vc.color}30`, display: "flex", alignItems: "center", gap: "6px" }}>
                            <VI style={{ width: "14px", height: "14px" }} /> {rule.conditions?.class_name}
                          </span>
                          <span style={{ fontSize: "12px", fontWeight: 700, padding: "6px 13px", borderRadius: "10px", background: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)", display: "flex", alignItems: "center", gap: "6px" }}>
                            <MapPin style={{ width: "14px", height: "14px" }} /> {rule.conditions?.region_label}
                          </span>
                          {rule.conditions?.min_time_seconds && (
                            <span style={{ fontSize: "12px", fontWeight: 700, padding: "6px 13px", borderRadius: "10px", background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)", display: "flex", alignItems: "center", gap: "6px" }}>
                              <Clock style={{ width: "14px", height: "14px" }} /> &gt; {rule.conditions.min_time_seconds}s
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Debug panel */}
                  <div style={{ padding: "16px", borderRadius: "16px", background: "rgba(15,23,42,0.5)", border: "1px solid rgba(51,65,85,0.5)" }}>
                    <p style={{ ...S.label, display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                      <Info style={{ width: "13px", height: "13px" }} /> Pipeline Debug
                    </p>
                    {[
                      { l: "Camera ID", v: cameraId, c: "#94a3b8" },
                      { l: "Active Rules", v: rules.length, c: "#818cf8" },
                      { l: "Events Logged", v: eventLogs.length, c: "#fbbf24" },
                      { l: "Lines in DB", v: lineRegions.length, c: "#10b981" },
                      { l: "Polygons in DB", v: polyRegions.length, c: "#f59e0b" },
                      { l: "Pipeline", v: running ? "● Running" : "○ Idle", c: running ? "#10b981" : "#475569" },
                    ].map(d => (
                      <div key={d.l} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(51,65,85,0.3)", fontSize: "12px", fontFamily: "monospace" }}>
                        <span style={{ color: "#64748b" }}>{d.l}</span>
                        <span style={{ fontWeight: 700, color: d.c }}>{d.v}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
