import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text as KonvaText, Rect } from "react-konva";
import axios from "axios";
import {
  Play, Square, UploadCloud, Wifi, Video, Hexagon,
  LogIn, LogOut, CheckCircle2, XCircle, Trash2,
  ChevronRight, ChevronLeft, Database, Zap, Activity,
  Info, MousePointerClick, Download, Eye, EyeOff,
  BarChart3, PlusCircle
} from "lucide-react";
import { useStepWizard } from "../../hooks/useStepWizard";
import TrafficNodeDashboard from "../TrafficNodeDashboard";

const API_BASE = "http://localhost:8000/api/v1";

const ZONE_COLORS = [
  "#f59e0b","#8b5cf6","#ec4899","#06b6d4",
  "#84cc16","#f97316","#10b981","#3b82f6","#a855f7","#ef4444"
];

const CANVAS_MAX_W = 1280;
const CANVAS_MAX_H = 720;
const CANVAS_ASPECT = CANVAS_MAX_H / CANVAS_MAX_W;

const STEPS = [
  { id: 1, label: "Select Source", icon: Video },
  { id: 2, label: "Draw Zones",    icon: MousePointerClick },
  { id: 3, label: "Live Analysis", icon: BarChart3 },
];

export default function PolygonZoneService({ cameraId = "default", token, availableModels = [], availableJobs = [], onBack }) {
  const { step, goTo, next } = useStepWizard(1);

  // Step 1
  const [sourceMode, setSourceMode]     = useState("upload");
  const [videoSource, setVideoSource]   = useState("");
  const [rtspUrl, setRtspUrl]           = useState("");
  const [selectedJob, setSelectedJob]   = useState("");
  const [model, setModel]               = useState(availableModels[0] || "yolov8n.pt");
  const [tracker, setTracker]           = useState("deepsort");
  const [uploading, setUploading]       = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [stepError, setStepError]       = useState("");
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  // Step 2 — canvas fixed size
  const [bgImage, setBgImage]       = useState(null);
  const [canvasW, setCanvasW]       = useState(CANVAS_MAX_W);
  const [canvasH, setCanvasH]       = useState(CANVAS_MAX_H);
  const [polygons, setPolygons]     = useState([]);
  const [currentPts, setCurrentPts] = useState([]);
  const [zoneLabel, setZoneLabel]   = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [roiSaved, setRoiSaved]     = useState(false);
  const [roiError, setRoiError]     = useState("");
  const [mousePos, setMousePos]     = useState(null);
  const stageRef = useRef(null);
  const canvasWrapperRef = useRef(null);

  // Step 3 — inference
  const [running, setRunning]           = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [classCounts, setClassCounts]   = useState({});
  const [regionMatrix, setRegionMatrix] = useState({}); // { region: { class: { IN, OUT } } }
  const [occupancy, setOccupancy]       = useState({});
  const [totalIN, setTotalIN]           = useState(0);
  const [totalOUT, setTotalOUT]         = useState(0);
  const [eventLogs, setEventLogs]       = useState([]);
  const [fps, setFps]                   = useState(0);
  const [streamFps, setStreamFps]       = useState(0);
  const [statusMsg, setStatusMsg]       = useState("Ready");
  const [showMinimap, setShowMinimap]   = useState(true);
  const [activePolygons, setActivePolygons] = useState(0);
  const [frameCount, setFrameCount]     = useState(0);
  const wsRef  = useRef(null);
  const fpsRef = useRef(Date.now());

  const MINI_W = 200, MINI_H = 112;

  // Fixed canvas — window resize only
  useEffect(() => {
    const calcSize = () => {
      if (!canvasWrapperRef.current) return;
      const w = Math.min(canvasWrapperRef.current.offsetWidth, CANVAS_MAX_W);
      setCanvasW(w); setCanvasH(Math.round(w * CANVAS_ASPECT));
    };
    calcSize();
    window.addEventListener("resize", calcSize);
    return () => window.removeEventListener("resize", calcSize);
  }, [step]);

  useEffect(() => { if (availableModels.length > 0) setModel(availableModels[0]); }, [availableModels]);

  const effectiveSource = sourceMode === "rtsp" ? rtspUrl : videoSource;
  const currentCameraId = effectiveSource || cameraId;

  useEffect(() => {
    axios.get(`${API_BASE}/regions`, { params: { camera_id: currentCameraId, type: "polygon" } })
      .then(res => setPolygons(res.data)).catch(() => {});
  }, [currentCameraId]);

  const loadFrame = async () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) { setStepError("Please select a video source first."); return; }
    setFrameLoading(true); setStepError("");
    try {
      const res = await axios.get(`${API_BASE}/frame`, { params: { video_source: src } });
      const img = new window.Image(); img.src = res.data.frame;
      img.onload = () => { setBgImage(img); setFrameLoading(false); next(); };
    } catch { setStepError("Could not load frame."); setFrameLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    axios.post(`${API_BASE}/upload`, fd, { headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` } })
      .then(res => { setVideoSource(res.data.filepath); setUploading(false); })
      .catch(() => { setUploading(false); setStepError("Upload failed."); });
  };

  const handleCanvasClick = (e) => {
    if (e.target.getClassName && e.target.getClassName() === "Circle") return;
    const pos = stageRef.current.getPointerPosition();
    setCurrentPts(prev => [...prev, [pos.x / canvasW, pos.y / canvasH]]);
    setRoiError("");
  };

  const handleMouseMove = useCallback(() => {
    if (!stageRef.current || currentPts.length === 0) return;
    setMousePos(stageRef.current.getPointerPosition());
  }, [currentPts.length]);

  const closePolygon = () => {
    if (currentPts.length < 3) { setRoiError("Need at least 3 points."); return; }
    const label = zoneLabel.trim() || `Zone ${polygons.length + 1}`;
    setPolygons(prev => [...prev, { id: Date.now(), label, type: "polygon", coordinates: currentPts, camera_id: currentCameraId, colorIdx: prev.length % ZONE_COLORS.length }]);
    setCurrentPts([]); setZoneLabel(""); setRoiError(""); setRoiSaved(false);
  };

  const handleVertexDrag = (polyId, ptIdx) => {
    const pos = stageRef.current.getPointerPosition();
    const xN = Math.max(0, Math.min(1, pos.x / canvasW));
    const yN = Math.max(0, Math.min(1, pos.y / canvasH));
    setPolygons(prev => prev.map(p => { if (p.id !== polyId) return p; const nc = [...p.coordinates]; nc[ptIdx] = [xN, yN]; return { ...p, coordinates: nc }; }));
    setRoiSaved(false);
  };

  const savePolygons = async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await axios.post(`${API_BASE}/regions?camera_id=${encodeURIComponent(currentCameraId)}&type=polygon`, polygons, { headers });
      setPolygons(res.data); setRoiSaved(true); setRoiError("");
    } catch { setRoiError("Failed to save. Is the backend running?"); }
  };

  const startStream = () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) return;
    setRunning(true); setCurrentFrame(null); setClassCounts({}); setRegionMatrix({});
    setOccupancy({}); setEventLogs([]); setTotalIN(0); setTotalOUT(0); setFrameCount(0);
    setStatusMsg("Connecting…");
    const params = new URLSearchParams({ video_source: src, camera_id: currentCameraId, frame_skip: "1", model_path: model, tracker_type: tracker, services: "polygons" });
    if (token) params.append("token", token);
    wsRef.current = new WebSocket(`ws://localhost:8000/api/v1/ws/stream?${params}`);
    wsRef.current.onopen  = () => setStatusMsg("🟢 Live — Polygon Zone Analysis");
    wsRef.current.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.type === "error") { setStatusMsg(`❌ ${d.message}`); setRunning(false); return; }
      if (d.frame) {
        setCurrentFrame(d.frame);
        const now = Date.now(); setFps(Math.round(1000 / Math.max(1, now - fpsRef.current))); fpsRef.current = now;
        setFrameCount(p => p + 1);
      }
      if (d.counts) setClassCounts(d.counts);
      if (d.stream_fps) setStreamFps(d.stream_fps);
      if (d.active_polygons !== undefined) setActivePolygons(d.active_polygons);
      if (d.events?.length) {
        setEventLogs(prev => [...d.events, ...prev].slice(0, 500));
        // Build regionMatrix incrementally
        setRegionMatrix(prev => {
          const next = { ...prev };
          d.events.forEach(ev => {
            const r = ev.region_label || "Unknown";
            const c = ev.class_name || "vehicle";
            if (!next[r]) next[r] = {};
            if (!next[r][c]) next[r][c] = { IN: 0, OUT: 0 };
            next[r][c] = { IN: next[r][c].IN + (ev.direction === "IN" ? 1 : 0), OUT: next[r][c].OUT + (ev.direction === "OUT" ? 1 : 0) };
          });
          return next;
        });
        // Live occupancy
        setOccupancy(prev => {
          const next = { ...prev };
          d.events.forEach(ev => {
            const z = ev.region_label || "Unknown";
            if (ev.direction === "IN")  next[z] = (next[z] || 0) + 1;
            if (ev.direction === "OUT") next[z] = Math.max(0, (next[z] || 0) - 1);
          });
          return next;
        });
        d.events.forEach(ev => {
          if (ev.direction === "IN")  setTotalIN(p => p + 1);
          if (ev.direction === "OUT") setTotalOUT(p => p + 1);
        });
      }
    };
    wsRef.current.onclose = () => { 
      setRunning(false); 
      setStatusMsg("Stream ended.");
      if (sourceMode !== "rtsp") {
        setShowCompletionModal(true);
      }
    };
    wsRef.current.onerror = () => { setRunning(false); setStatusMsg("⚠️ Connection error."); };
  };

  const stopStream = () => { wsRef.current?.close(); setRunning(false); setStatusMsg("Stopped."); };
  useEffect(() => () => wsRef.current?.close(), []);

  const downloadCSV = () => {
    let filename = window.prompt("Enter filename to save CSV:", `polygon_zones_${cameraId}.csv`);
    if (!filename) return;
    if (!filename.endsWith(".csv")) filename += ".csv";
    const rows = eventLogs.map(e => {
      const region = polygons.find(p => p.label === e.region_label);
      const lat = region?.latitude ?? "";
      const lng = region?.longitude ?? "";
      return `${e.vehicle_id},${e.class_name},${e.direction},${e.region_label},${lat},${lng},${e.timestamp}`;
    }).join("\n");
    const blob = new Blob(["vehicle_id,class_name,direction,region_label,latitude,longitude,timestamp\n" + rows], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  };

  return (
    <div className="svc-root">
      {/* Service Banner */}
      <div className="service-info-banner mb-6" style={{ borderColor: "rgba(245, 158, 11, 0.4)", background: "rgba(69, 26, 3, 0.6)" }}>
        <div className="flex items-start gap-4">
          <div className="service-banner-icon" style={{ background: "rgba(245, 158, 11, 0.2)", border: "1px solid rgba(245, 158, 11, 0.4)" }}>
            <Hexagon className="w-6 h-6 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-bold text-white">Polygon Zone Presence</h2>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                <Zap className="w-2.5 h-2.5" /> CUDA Accelerated
              </span>
              <button onClick={onBack} className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1">
                <ChevronLeft className="w-3 h-3" /> Back to Overview
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2 max-w-3xl leading-relaxed">
              <strong className="text-amber-300">Technical Pipeline & Instructions:</strong><br/>
              1. <strong>Select Source</strong>: Choose RTSP stream or upload local video.<br/>
              2. <strong>Draw Zones</strong>: Click on the canvas to draw exact multi-point polygons. Input latitude/longitude for database correlation.<br/>
              3. <strong>Live Analysis</strong>: DeepSORT maps vehicle centroid locations inside the bounded polygons in real-time.
            </p>
          </div>
        </div>
      </div>

      {/* Step bar */}
      <div className="wizard-step-bar">
        {STEPS.map((s, i) => {
          const done = step > s.id, active = step === s.id, SIcon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <button className={`wizard-step-node ${active ? "wsn-active" : ""} ${done ? "wsn-done" : ""}`} onClick={() => done && goTo(s.id)}>
                <span className="wizard-step-circle">{done ? <CheckCircle2 className="w-4 h-4" /> : <SIcon className="w-4 h-4" />}</span>
                <span className="wizard-step-label">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`wizard-connector ${done ? "wc-done" : ""}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* ══ STEP 1 ══════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="svc-panel">

          <div className="src-tabs mt-6 mb-5">
            {[{ id: "upload", label: "Upload File", icon: UploadCloud }, { id: "rtsp", label: "RTSP Stream", icon: Wifi }, { id: "job", label: "Previous Upload", icon: Database }].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSourceMode(id)} className={`src-tab ${sourceMode === id ? "src-tab-active-amber" : ""}`}><Icon className="w-4 h-4" /> {label}</button>
            ))}
          </div>
          <div className="two-col-grid mb-6">
            <div>
              {sourceMode === "upload" && (
                <><label className="field-lbl">Video File</label>
                  <label className="drop-zone">
                    <UploadCloud className="w-7 h-7 mb-1 opacity-50" />
                    <span className="font-semibold text-sm">{uploading ? "Uploading…" : "Click or drag video file"}</span>
                    <span className="text-xs text-slate-500 mt-0.5">.mp4 · .avi · .mov</span>
                    <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                  {videoSource && <p className="ok-text mt-1.5"><CheckCircle2 className="w-3 h-3" /> {videoSource.split("\\").pop()}</p>}
                </>
              )}
              {sourceMode === "rtsp" && (<><label className="field-lbl">RTSP URL</label><input className="input-field" placeholder="rtsp://192.168.1.100:554/stream1" value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} /></>)}
              {sourceMode === "job" && (<><label className="field-lbl">Select Job</label><select className="input-field" value={selectedJob} onChange={e => { setSelectedJob(e.target.value); setVideoSource(e.target.value); }}><option value="">— choose —</option>{availableJobs.map(j => <option key={j.id} value={j.filepath}>{j.filename}</option>)}</select></>)}
            </div>
            <div className="flex flex-col gap-4">
              <div><label className="field-lbl">YOLO Model</label><select className="input-field" value={model} onChange={e => setModel(e.target.value)}>{availableModels.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
              <div><label className="field-lbl">Tracker</label><select className="input-field" value={tracker} onChange={e => setTracker(e.target.value)}><option value="deepsort">⚡ Custom DeepSORT (Numba CUDA)</option><option value="bytetrack">ByteTrack</option><option value="botsort">BoT-SORT</option></select></div>
            </div>
          </div>
          {stepError && <p className="err-pill mb-4"><XCircle className="w-4 h-4" /> {stepError}</p>}
          <button onClick={loadFrame} disabled={!effectiveSource || frameLoading} className="btn btn-primary btn-lg gap-2" style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}>
            {frameLoading ? <><span className="spin-xs" /> Loading frame…</> : <><ChevronRight className="w-5 h-5" /> Load Frame & Draw Zones</>}
          </button>
        </div>
      )}

      {/* ══ STEP 2 ══════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="svc-panel">
          <div className="roi-layout">
            <div className="roi-left-panel">
              <div className={`hint-box ${currentPts.length === 0 ? "hint-amber" : "hint-emerald"} mb-4`}>
                <MousePointerClick className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  {currentPts.length === 0
                    ? <><p className="hint-title">Draw detection zones</p><p className="hint-body">Type zone name → click multiple points → click <strong>Close Zone</strong> (min 3).</p></>
                    : <><p className="hint-title" style={{ color: "#34d399" }}>🖊️ {currentPts.length} point{currentPts.length !== 1 ? "s" : ""} placed</p><p className="hint-body">{currentPts.length < 3 ? `Add ${3 - currentPts.length} more point(s).` : "Ready to close! Click 'Close Zone'."}</p></>}
                </div>
              </div>
              <label className="field-lbl">Zone Label</label>
              <input className="input-field mb-3" placeholder="e.g. Parking Bay A…" value={zoneLabel} onChange={e => setZoneLabel(e.target.value)} />
              {currentPts.length > 0 && (
                <div className="flex gap-2 mb-3">
                  <button onClick={closePolygon} disabled={currentPts.length < 3} className="btn btn-primary gap-1.5 flex-1" style={{ fontSize: 12 }}><PlusCircle className="w-4 h-4" /> Close Zone ({currentPts.length} pts)</button>
                  <button onClick={() => { setCurrentPts([]); setMousePos(null); }} className="btn btn-danger" style={{ fontSize: 12, padding: "8px 12px" }}>✕</button>
                </div>
              )}
              {roiError && <p className="err-pill mb-2"><XCircle className="w-3.5 h-3.5" /> {roiError}</p>}
              <div className="flex items-center justify-between mb-2">
                <span className="field-lbl mb-0">Zones ({polygons.length})</span>
                {polygons.length > 0 && <button onClick={() => { setPolygons([]); setRoiSaved(false); }} className="text-rose-500 hover:text-rose-400 text-[10px] font-bold">Clear All</button>}
              </div>
              <div className="region-list-box">
                {polygons.length === 0 && <p className="text-slate-600 text-xs text-center py-6">No zones yet.</p>}
                {polygons.map((p, idx) => {
                  const color = ZONE_COLORS[idx % ZONE_COLORS.length];
                  return (
                    <div key={p.id} className="bg-slate-900/60 p-2 rounded-lg border border-slate-800 mb-2 cursor-pointer transition-colors hover:border-slate-700" onClick={() => setSelectedId(p.id)} style={selectedId === p.id ? { borderColor: color + "66", background: "rgba(15,23,42,0.8)" } : {}}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="color-dot" style={{ background: color, borderRadius: 3 }} />
                          <span className="text-xs font-semibold text-slate-200 truncate">{p.label}</span>
                          <span className="text-[9px] text-slate-500">{p.coordinates?.length}v</span>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setPolygons(prev => prev.filter(x => x.id !== p.id)); setRoiSaved(false); }} className="text-rose-500 hover:text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        <input type="number" step="any" placeholder="Lat (e.g. 28.6139)" className="input-field text-[10px] py-1 px-1.5 h-7" 
                          value={p.latitude || ""} 
                          onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : null;
                            setPolygons(prev => prev.map(x => x.id === p.id ? { ...x, latitude: val } : x));
                            setRoiSaved(false);
                          }} />
                        <input type="number" step="any" placeholder="Lng (e.g. 77.2090)" className="input-field text-[10px] py-1 px-1.5 h-7" 
                          value={p.longitude || ""} 
                          onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : null;
                            setPolygons(prev => prev.map(x => x.id === p.id ? { ...x, longitude: val } : x));
                            setRoiSaved(false);
                          }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-col gap-2 mt-4">
                {roiSaved && <p className="ok-pill"><CheckCircle2 className="w-3.5 h-3.5" /> Zones saved!</p>}
                <button onClick={savePolygons} disabled={polygons.length === 0} className="btn btn-primary gap-2" style={{ background: "linear-gradient(135deg,#d97706,#f59e0b)" }}><Database className="w-4 h-4" /> Save Zones to Database</button>
                <button onClick={() => goTo(3)} className="btn btn-success gap-2"><Play className="w-4 h-4 fill-current" /> Start Live Analysis →</button>
                <button onClick={() => goTo(1)} className="btn-ghost mt-1"><ChevronLeft className="w-4 h-4" /> Back to source</button>
              </div>
            </div>
            {/* Fixed canvas */}
            <div className="roi-canvas-col" ref={canvasWrapperRef}>
              <div style={{ width: canvasW, height: canvasH, maxWidth: "100%", position: "relative" }} className="canvas-wrapper">
                <Stage ref={stageRef} width={canvasW} height={canvasH} onClick={handleCanvasClick} onMouseMove={handleMouseMove} style={{ cursor: currentPts.length > 0 ? "crosshair" : "default", display: "block" }}>
                  <Layer>
                    {bgImage && <KonvaImage image={bgImage} width={canvasW} height={canvasH} />}
                    {currentPts.length > 0 && (
                      <>
                        <Line points={currentPts.flatMap(p => [p[0]*canvasW, p[1]*canvasH])} stroke="#10b981" strokeWidth={2} dash={[7,4]} closed={false} />
                        {mousePos && <Line points={[currentPts[currentPts.length-1][0]*canvasW, currentPts[currentPts.length-1][1]*canvasH, mousePos.x, mousePos.y]} stroke="#10b981" strokeWidth={1.5} dash={[5,4]} opacity={0.6} />}
                        {currentPts.map((pt, i) => <Circle key={i} x={pt[0]*canvasW} y={pt[1]*canvasH} radius={i===0?9:5} fill={i===0?"#10b981":"#fff"} stroke="#10b981" strokeWidth={2} />)}
                      </>
                    )}
                    {polygons.map((poly, idx) => {
                      const color = ZONE_COLORS[idx % ZONE_COLORS.length];
                      const pts = poly.coordinates.flatMap(p => [p[0]*canvasW, p[1]*canvasH]);
                      const sel = selectedId === poly.id;
                      return (
                        <React.Fragment key={poly.id}>
                          <Line points={pts} stroke={color} strokeWidth={sel?3.5:2.5} fill={color+"28"} closed={true} onClick={() => setSelectedId(poly.id)} />
                          <Rect x={poly.coordinates[0][0]*canvasW-2} y={poly.coordinates[0][1]*canvasH-26} width={poly.label.length*8+12} height={20} fill={color+"cc"} cornerRadius={4} />
                          <KonvaText x={poly.coordinates[0][0]*canvasW+4} y={poly.coordinates[0][1]*canvasH-22} text={poly.label} fontSize={11} fill="#fff" fontStyle="bold" />
                          {poly.coordinates.map((pt, pi) => <Circle key={pi} x={pt[0]*canvasW} y={pt[1]*canvasH} radius={sel?7:5} fill={sel?"#fff":color} stroke={color} strokeWidth={2} draggable onDragMove={() => handleVertexDrag(poly.id, pi)} onClick={() => setSelectedId(poly.id)} />)}
                        </React.Fragment>
                      );
                    })}
                  </Layer>
                </Stage>
              </div>
              <p className="canvas-hint mt-2"><Info className="w-3.5 h-3.5 flex-shrink-0" /> First vertex (green) = anchor · drag vertices to reshape · canvas capped at 1280×720</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ STEP 3 ══════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="svc-panel">

          {/* ── FIXED rigid control bar ─────────────────────────────────── */}
          <div className="ctrl-bar-fixed mb-4">
            <div className="ctrl-bar-left">
              <span className={`status-dot-lg ${running ? "sdl-live" : "sdl-idle"}`} />
              <span className="text-sm font-semibold text-slate-200 truncate max-w-[260px]">{statusMsg}</span>
              <span className="chip chip-amber">{fps} fps</span>
              <span className="chip chip-emerald">{streamFps} src</span>
              <span className="chip chip-slate">{frameCount}f</span>
              <span className="chip chip-violet">{activePolygons}Z</span>
            </div>
            <div className="ctrl-bar-right">
              <button onClick={downloadCSV} disabled={eventLogs.length === 0} className="btn btn-secondary btn-sm gap-1.5"><Download className="w-3.5 h-3.5" /> CSV</button>
              <button onClick={() => setShowMinimap(p => !p)} className="btn btn-secondary btn-sm gap-1.5">{showMinimap ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} Minimap</button>
              <button onClick={() => goTo(2)} disabled={running} className="btn btn-secondary btn-sm gap-1.5"><ChevronLeft className="w-3.5 h-3.5" /> Edit Zones</button>
              {!running
                ? <button onClick={startStream} disabled={!effectiveSource} className="btn btn-success btn-sm gap-2"><Play className="w-4 h-4 fill-current" /> Start</button>
                : <button onClick={stopStream} className="btn btn-danger btn-sm gap-2"><Square className="w-4 h-4 fill-current" /> Stop</button>}
            </div>
          </div>

          <div className="inference-grid">

            {/* Left: feed + dashboard below it */}
            <div className="feed-col">
              <div className="feed-box" style={{ position: "relative", maxWidth: 1280 }}>
                {currentFrame
                  ? <img src={currentFrame} alt="Live" className="feed-img" />
                  : <div className="feed-empty">
                      <Zap className="w-10 h-10 text-amber-500/30 mb-3" />
                      <p className="text-slate-500 text-sm">{running ? "Waiting for first frame…" : "Click Start to begin"}</p>
                      {running && <div className="spinner mt-4" />}
                    </div>}
                {showMinimap && polygons.length > 0 && (
                  <div className="minimap">
                    <p className="minimap-lbl">Zones ROI</p>
                    <svg width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`} style={{ background: "rgba(0,0,0,0.55)", borderRadius: 6, display: "block" }}>
                      {polygons.map((poly, idx) => {
                        const c = ZONE_COLORS[idx % ZONE_COLORS.length];
                        const pts = poly.coordinates.map(p => `${p[0]*MINI_W},${p[1]*MINI_H}`).join(" ");
                        return <g key={poly.id}><polygon points={pts} fill={c+"40"} stroke={c} strokeWidth={1.5} /><text x={poly.coordinates[0][0]*MINI_W+3} y={poly.coordinates[0][1]*MINI_H-2} fill="#fff" fontSize={7} fontWeight="bold">{poly.label}</text></g>;
                      })}
                    </svg>
                  </div>
                )}
              </div>

              {/* ── Traffic Node Dashboard ────────────────────────────────── */}
              <TrafficNodeDashboard
                regionMatrix={regionMatrix}
                eventLogs={eventLogs}
                occupancy={occupancy}
                running={running}
              />
            </div>

            {/* Right: compact analytics sidebar */}
            <div className="analytics-col">
              <div className="glass-panel p-4 mb-4">
                <p className="text-label mb-3">Total Events</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="count-card count-emerald"><LogIn className="w-5 h-5 mb-1" /><span className="count-num">{totalIN}</span><span className="count-lbl">Entered</span></div>
                  <div className="count-card count-rose"><LogOut className="w-5 h-5 mb-1" /><span className="count-num">{totalOUT}</span><span className="count-lbl">Exited</span></div>
                </div>
              </div>

              {/* Live occupancy */}
              {Object.keys(occupancy).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">Live Zone Occupancy</p>
                  {Object.entries(occupancy).map(([zone, count], idx) => {
                    const color = ZONE_COLORS[idx % ZONE_COLORS.length];
                    return (
                      <div key={zone} className="region-breakdown-row mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-200 truncate flex-1">{zone}</span>
                          <span className="text-lg font-extrabold ml-2 flex-shrink-0" style={{ color }}>{count}</span>
                        </div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, count * 20)}%`, background: color }} /></div>
                        <p className="text-[9px] text-slate-500 mt-0.5">vehicles inside now</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {Object.keys(classCounts).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">By Vehicle Class</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Object.entries(classCounts).map(([cls, n]) => <div key={cls} className="class-stat"><span className="text-[10px] font-bold text-slate-400 uppercase truncate">{cls}</span><span className="text-xl font-extrabold text-slate-100">{n}</span></div>)}
                  </div>
                </div>
              )}

              <div className="glass-panel p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-label">Event Feed</p>
                  {eventLogs.length > 0 && <span className="text-[10px] text-slate-500">{eventLogs.length}</span>}
                </div>
                <div className="event-ticker" style={{ maxHeight: 380 }}>
                  {eventLogs.length === 0
                    ? <div className="text-center py-6 text-slate-600 text-xs"><Activity className="w-5 h-5 mx-auto mb-2 opacity-30" />Zone events here</div>
                    : eventLogs.slice(0, 60).map((ev, i) => (
                      <div key={i} className="ticker-item">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-200 block truncate">{ev.vehicle_id}</span>
                          <span className="text-[9px] text-slate-500">{ev.region_label} · {new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <span className={`badge ${ev.direction === "IN" ? "badge-in" : "badge-out"}`}>{ev.direction === "IN" ? "IN" : "OUT"}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="modal-overlay">
          <div className="completion-modal">
            <div className="mx-auto w-16 h-16 bg-emerald-500/20 border border-emerald-500/50 rounded-full flex items-center justify-center mb-4 relative">
              <div className="absolute inset-0 bg-emerald-500 rounded-full blur-md opacity-40 pulse"></div>
              <CheckCircle2 className="w-8 h-8 text-emerald-400 relative z-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mb-2">Processing Complete!</h2>
            <p className="text-slate-400 text-sm mb-6">
              The video analysis has finished successfully. Zone occupancy events have been saved to the database.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={downloadCSV} className="btn btn-primary w-full py-3">
                <Download className="w-5 h-5" /> Download Event Logs (CSV)
              </button>
              <button onClick={() => setShowCompletionModal(false)} className="btn btn-secondary w-full py-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                Close & Return
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
