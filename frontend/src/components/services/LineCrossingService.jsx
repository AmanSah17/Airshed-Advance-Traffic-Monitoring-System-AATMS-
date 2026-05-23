import React, { useState, useEffect, useRef, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text as KonvaText, Rect } from "react-konva";
import axios from "axios";
import {
  Play, Square, UploadCloud, Wifi, Video, ArrowLeftRight,
  TrendingUp, TrendingDown, CheckCircle2, XCircle, Trash2,
  ChevronRight, ChevronLeft, Database, Zap, Activity,
  Info, MousePointerClick, Download, Eye, EyeOff, BarChart3
} from "lucide-react";
import { useStepWizard } from "../../hooks/useStepWizard";

const API_BASE = "http://localhost:8000/api/v1";

const LINE_COLORS = [
  "#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4",
  "#f97316","#ec4899","#84cc16","#3b82f6","#a855f7"
];

// Fixed canvas dimensions — capped at 1280×720, never larger
const CANVAS_MAX_W = 1280;
const CANVAS_MAX_H = 720;
const CANVAS_ASPECT = CANVAS_MAX_H / CANVAS_MAX_W; // 0.5625 (16:9)

const STEPS = [
  { id: 1, label: "Select Source",  icon: Video },
  { id: 2, label: "Draw Lines",     icon: MousePointerClick },
  { id: 3, label: "Live Analysis",  icon: BarChart3 },
];

export default function LineCrossingService({ cameraId = "default", token, availableModels = [], availableJobs = [] }) {
  const { step, goTo, next } = useStepWizard(1);

  // ── Step 1 ────────────────────────────────────────────────────────────────
  const [sourceMode, setSourceMode]     = useState("upload");
  const [videoSource, setVideoSource]   = useState("");
  const [rtspUrl, setRtspUrl]           = useState("");
  const [selectedJob, setSelectedJob]   = useState("");
  const [model, setModel]               = useState(availableModels[0] || "yolov8n.pt");
  const [tracker, setTracker]           = useState("deepsort");
  const [uploading, setUploading]       = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);
  const [stepError, setStepError]       = useState("");

  // ── Step 2: Canvas — FIXED SIZE, no ResizeObserver ───────────────────────
  const [bgImage, setBgImage]     = useState(null);
  const [canvasW, setCanvasW]     = useState(CANVAS_MAX_W);
  const [canvasH, setCanvasH]     = useState(CANVAS_MAX_H);
  const [lines, setLines]         = useState([]);
  const [drawingPts, setDrawingPts] = useState([]);
  const [lineLabel, setLineLabel] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [roiSaved, setRoiSaved]   = useState(false);
  const [roiError, setRoiError]   = useState("");
  const [mousePos, setMousePos]   = useState(null);
  const stageRef = useRef(null);
  const canvasWrapperRef = useRef(null);

  // ── Step 3 ────────────────────────────────────────────────────────────────
  const [running, setRunning]         = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [classCounts, setClassCounts] = useState({});
  const [regionCounts, setRegionCounts] = useState({});
  const [totalIN, setTotalIN]         = useState(0);
  const [totalOUT, setTotalOUT]       = useState(0);
  const [eventLogs, setEventLogs]     = useState([]);
  const [fps, setFps]                 = useState(0);
  const [streamFps, setStreamFps]     = useState(0);
  const [statusMsg, setStatusMsg]     = useState("Ready");
  const [showMinimap, setShowMinimap] = useState(true);
  const [activeLines, setActiveLines] = useState(0);
  const [frameCount, setFrameCount]   = useState(0);
  const wsRef  = useRef(null);
  const fpsRef = useRef(Date.now());

  // ── Compute canvas size to fit wrapper, never exceed 1280×720 ────────────
  useEffect(() => {
    const calcSize = () => {
      if (!canvasWrapperRef.current) return;
      const containerW = canvasWrapperRef.current.offsetWidth;
      const w = Math.min(containerW, CANVAS_MAX_W);
      const h = Math.round(w * CANVAS_ASPECT);
      setCanvasW(w);
      setCanvasH(h);
    };
    calcSize();
    window.addEventListener("resize", calcSize);
    return () => window.removeEventListener("resize", calcSize);
  }, [step]);

  useEffect(() => {
    if (availableModels.length > 0) setModel(availableModels[0]);
  }, [availableModels]);

  // Load existing lines from DB
  useEffect(() => {
    axios.get(`${API_BASE}/regions`, { params: { camera_id: cameraId, type: "line" } })
      .then(res => setLines(res.data)).catch(() => {});
  }, [cameraId]);

  // ── Load first frame ──────────────────────────────────────────────────────
  const loadFrame = async () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) { setStepError("Please select a video source first."); return; }
    setFrameLoading(true); setStepError("");
    try {
      const res = await axios.get(`${API_BASE}/frame`, { params: { video_source: src } });
      const img = new window.Image();
      img.src = res.data.frame;
      img.onload = () => { setBgImage(img); setFrameLoading(false); next(); };
    } catch {
      setStepError("Could not load frame preview — check your video source.");
      setFrameLoading(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    axios.post(`${API_BASE}/upload`, fd, {
      headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` }
    }).then(res => { setVideoSource(res.data.filepath); setUploading(false); })
      .catch(() => { setUploading(false); setStepError("Upload failed."); });
  };

  // ── Canvas drawing logic ──────────────────────────────────────────────────
  const handleCanvasClick = (e) => {
    if (e.target.getClassName && e.target.getClassName() === "Circle") return;
    const pos = stageRef.current.getPointerPosition();
    const xN = pos.x / canvasW, yN = pos.y / canvasH;
    if (drawingPts.length === 0) {
      setDrawingPts([[xN, yN]]);
    } else {
      const label = lineLabel.trim() || `Line ${lines.length + 1}`;
      setLines(prev => [...prev, {
        id: Date.now(), label, type: "line",
        coordinates: [drawingPts[0], [xN, yN]],
        camera_id: cameraId,
        colorIdx: prev.length % LINE_COLORS.length
      }]);
      setDrawingPts([]); setLineLabel(""); setRoiSaved(false);
    }
  };

  const handleMouseMove = useCallback(() => {
    if (drawingPts.length === 0 || !stageRef.current) return;
    setMousePos(stageRef.current.getPointerPosition());
  }, [drawingPts.length]);

  const handleVertexDrag = (lineId, ptIdx) => {
    const pos = stageRef.current.getPointerPosition();
    const xN = Math.max(0, Math.min(1, pos.x / canvasW));
    const yN = Math.max(0, Math.min(1, pos.y / canvasH));
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const nc = [...l.coordinates]; nc[ptIdx] = [xN, yN]; return { ...l, coordinates: nc };
    }));
    setRoiSaved(false);
  };

  const saveLines = async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await axios.post(`${API_BASE}/regions?camera_id=${cameraId}&type=line`, lines, { headers });
      setLines(res.data); setRoiSaved(true); setRoiError("");
    } catch { setRoiError("Failed to save. Is the backend running?"); }
  };

  // ── WebSocket stream ──────────────────────────────────────────────────────
  const startStream = () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) return;
    setRunning(true); setCurrentFrame(null); setClassCounts({}); setRegionCounts({});
    setEventLogs([]); setTotalIN(0); setTotalOUT(0); setFrameCount(0);
    setStatusMsg("Connecting to pipeline…");
    const params = new URLSearchParams({
      video_source: src, camera_id: cameraId,
      frame_skip: "1", model_path: model, tracker_type: tracker, services: "lines"
    });
    if (token) params.append("token", token);
    wsRef.current = new WebSocket(`ws://localhost:8000/api/v1/ws/stream?${params}`);
    wsRef.current.onopen  = () => setStatusMsg("🟢 Live — Line Crossing Analysis");
    wsRef.current.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.type === "error") { setStatusMsg(`❌ ${d.message}`); setRunning(false); return; }
      if (d.frame) {
        setCurrentFrame(d.frame);
        const now = Date.now(); setFps(Math.round(1000 / (now - fpsRef.current))); fpsRef.current = now;
        setFrameCount(p => p + 1);
      }
      if (d.counts) setClassCounts(d.counts);
      if (d.region_counts) setRegionCounts(d.region_counts);
      if (d.stream_fps) setStreamFps(d.stream_fps);
      if (d.active_lines !== undefined) setActiveLines(d.active_lines);
      if (d.events?.length) {
        setEventLogs(prev => [...d.events, ...prev].slice(0, 200));
        d.events.forEach(ev => {
          if (ev.direction === "IN")  setTotalIN(p => p + 1);
          if (ev.direction === "OUT") setTotalOUT(p => p + 1);
        });
      }
    };
    wsRef.current.onclose = () => { setRunning(false); setStatusMsg("Stream ended."); };
    wsRef.current.onerror = () => { setRunning(false); setStatusMsg("⚠️ Connection error."); };
  };

  const stopStream = () => { wsRef.current?.close(); setRunning(false); setStatusMsg("Stopped."); };
  useEffect(() => () => wsRef.current?.close(), []);

  const downloadCSV = () => {
    const rows = eventLogs.map(e =>
      `${e.vehicle_id},${e.class_name},${e.direction},${e.region_label},${e.timestamp}`
    ).join("\n");
    const blob = new Blob(["vehicle_id,class_name,direction,region_label,timestamp\n" + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `line_crossings_${cameraId}.csv`;
    a.click();
  };

  const effectiveSource = sourceMode === "rtsp" ? rtspUrl : videoSource;
  const MINI_W = 200, MINI_H = 112;

  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="svc-root">

      {/* ── Step Progress Bar ─────────────────────────────────────────────── */}
      <div className="wizard-step-bar">
        {STEPS.map((s, i) => {
          const done = step > s.id, active = step === s.id, SIcon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <button
                className={`wizard-step-node ${active ? "wsn-active" : ""} ${done ? "wsn-done" : ""}`}
                onClick={() => done && goTo(s.id)}>
                <span className="wizard-step-circle">
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <SIcon className="w-4 h-4" />}
                </span>
                <span className="wizard-step-label">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`wizard-connector ${done ? "wc-done" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ══ STEP 1 — SOURCE SETUP ═══════════════════════════════════════════ */}
      {step === 1 && (
        <div className="svc-panel">
          <div className="hint-box hint-indigo">
            <Video className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="hint-title">👋 Welcome to Line Crossing Counter</p>
              <p className="hint-body">
                Follow 3 simple steps: select your video source, draw virtual tripwire lines on a live frame, then launch real-time AI counting. Let's start by choosing your video!
              </p>
            </div>
          </div>

          <div className="src-tabs mt-6 mb-5">
            {[
              { id: "upload", label: "Upload File",        icon: UploadCloud },
              { id: "rtsp",   label: "RTSP Stream",        icon: Wifi },
              { id: "job",    label: "Previous Upload",    icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSourceMode(id)}
                className={`src-tab ${sourceMode === id ? "src-tab-active-indigo" : ""}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          <div className="two-col-grid mb-6">
            <div>
              {sourceMode === "upload" && (
                <>
                  <label className="field-lbl">Video File</label>
                  <label className="drop-zone">
                    <UploadCloud className="w-7 h-7 mb-1 opacity-50" />
                    <span className="font-semibold text-sm">{uploading ? "Uploading…" : "Click or drag video file here"}</span>
                    <span className="text-xs text-slate-500 mt-0.5">Supports .mp4 · .avi · .mov · .mkv</span>
                    <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                  {videoSource && <p className="ok-text mt-1.5"><CheckCircle2 className="w-3 h-3" /> {videoSource.split("\\").pop()}</p>}
                </>
              )}
              {sourceMode === "rtsp" && (
                <>
                  <label className="field-lbl">RTSP URL</label>
                  <input className="input-field" placeholder="rtsp://192.168.1.100:554/stream1"
                    value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} />
                </>
              )}
              {sourceMode === "job" && (
                <>
                  <label className="field-lbl">Select Job</label>
                  <select className="input-field" value={selectedJob}
                    onChange={e => { setSelectedJob(e.target.value); setVideoSource(e.target.value); }}>
                    <option value="">— choose uploaded file —</option>
                    {availableJobs.map(j => <option key={j.id} value={j.filepath}>{j.filename}</option>)}
                  </select>
                </>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="field-lbl">YOLO Model</label>
                <select className="input-field" value={model} onChange={e => setModel(e.target.value)}>
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="field-lbl">Tracker</label>
                <select className="input-field" value={tracker} onChange={e => setTracker(e.target.value)}>
                  <option value="deepsort">⚡ Custom DeepSORT (Numba CUDA)</option>
                  <option value="bytetrack">ByteTrack</option>
                  <option value="botsort">BoT-SORT</option>
                </select>
              </div>
            </div>
          </div>

          {stepError && <p className="err-pill mb-4"><XCircle className="w-4 h-4" /> {stepError}</p>}
          <button onClick={loadFrame} disabled={!effectiveSource || frameLoading} className="btn btn-primary btn-lg gap-2">
            {frameLoading ? <><span className="spin-xs" /> Loading frame…</> : <><ChevronRight className="w-5 h-5" /> Load Frame & Draw Lines</>}
          </button>
        </div>
      )}

      {/* ══ STEP 2 — ROI DRAWING ════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="svc-panel">
          <div className="roi-layout">

            {/* Left sidebar */}
            <div className="roi-left-panel">
              <div className={`hint-box ${drawingPts.length === 0 ? "hint-indigo" : "hint-amber"} mb-4`}>
                <MousePointerClick className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  {drawingPts.length === 0 ? (
                    <>
                      <p className="hint-title">Draw crossing lines</p>
                      <p className="hint-body">Type a label → click once on the frame to set start point → click again for end point.</p>
                    </>
                  ) : (
                    <>
                      <p className="hint-title" style={{ color: "#fbbf24" }}>📍 Start point placed!</p>
                      <p className="hint-body">Now <strong>click the end point</strong> on the frame to complete the line.</p>
                    </>
                  )}
                </div>
              </div>

              <label className="field-lbl">Line Label</label>
              <input className="input-field mb-4" placeholder="e.g. Lane A, Entry North…"
                value={lineLabel} onChange={e => setLineLabel(e.target.value)} />

              <div className="flex items-center justify-between mb-2">
                <span className="field-lbl mb-0">Lines ({lines.length})</span>
                {lines.length > 0 && (
                  <button onClick={() => { setLines([]); setRoiSaved(false); }}
                    className="text-rose-500 hover:text-rose-400 text-[10px] font-bold">Clear All</button>
                )}
              </div>

              <div className="region-list-box">
                {lines.length === 0 && <p className="text-slate-600 text-xs text-center py-6">No lines yet — click the canvas to start.</p>}
                {lines.map((l, idx) => {
                  const color = LINE_COLORS[idx % LINE_COLORS.length];
                  return (
                    <div key={l.id} onClick={() => setSelectedId(l.id)}
                      className={`region-row-item ${selectedId === l.id ? "region-row-selected" : ""}`}
                      style={selectedId === l.id ? { borderColor: color + "66" } : {}}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="color-dot" style={{ background: color }} />
                        <span className="text-xs font-semibold text-slate-200 truncate">{l.label}</span>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setLines(p => p.filter(x => x.id !== l.id)); setRoiSaved(false); }}
                        className="trash-btn"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2 mt-4">
                {roiError && <p className="err-pill"><XCircle className="w-3.5 h-3.5" /> {roiError}</p>}
                {roiSaved && <p className="ok-pill"><CheckCircle2 className="w-3.5 h-3.5" /> Saved to database!</p>}
                <button onClick={saveLines} disabled={lines.length === 0} className="btn btn-primary gap-2">
                  <Database className="w-4 h-4" /> Save Lines to Database
                </button>
                <button onClick={() => goTo(3)} className="btn btn-success gap-2">
                  <Play className="w-4 h-4 fill-current" /> Start Live Analysis →
                </button>
                <button onClick={() => goTo(1)} className="btn-ghost mt-1">
                  <ChevronLeft className="w-4 h-4" /> Back to source
                </button>
              </div>
            </div>

            {/* Canvas — fixed max 1280×720, scales down responsively */}
            <div className="roi-canvas-col" ref={canvasWrapperRef}>
              <div style={{ width: canvasW, height: canvasH, maxWidth: "100%", position: "relative" }}
                className="canvas-wrapper">
                <Stage
                  ref={stageRef}
                  width={canvasW}
                  height={canvasH}
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  style={{ cursor: drawingPts.length === 1 ? "crosshair" : "default", display: "block" }}
                >
                  <Layer>
                    {bgImage && <KonvaImage image={bgImage} width={canvasW} height={canvasH} />}

                    {/* Rubber-band preview */}
                    {drawingPts.length === 1 && mousePos && (
                      <Line points={[drawingPts[0][0]*canvasW, drawingPts[0][1]*canvasH, mousePos.x, mousePos.y]}
                        stroke="#f59e0b" strokeWidth={2} dash={[8,5]} opacity={0.8} />
                    )}
                    {drawingPts.length === 1 && (
                      <Circle x={drawingPts[0][0]*canvasW} y={drawingPts[0][1]*canvasH}
                        radius={8} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
                    )}

                    {/* Saved lines */}
                    {lines.map((l, idx) => {
                      const color = LINE_COLORS[idx % LINE_COLORS.length];
                      const pts = l.coordinates.flatMap(p => [p[0]*canvasW, p[1]*canvasH]);
                      const sel = selectedId === l.id;
                      return (
                        <React.Fragment key={l.id}>
                          <Line points={pts} stroke={sel ? "#fff" : color} strokeWidth={sel ? 4 : 3}
                            shadowBlur={sel ? 10 : 0} shadowColor={color} />
                          <Circle
                            x={(l.coordinates[0][0]+l.coordinates[1][0])/2*canvasW}
                            y={(l.coordinates[0][1]+l.coordinates[1][1])/2*canvasH}
                            radius={5} fill={color} />
                          <Rect
                            x={l.coordinates[0][0]*canvasW - 2} y={l.coordinates[0][1]*canvasH - 26}
                            width={l.label.length * 8 + 12} height={20}
                            fill={color + "cc"} cornerRadius={4} />
                          <KonvaText
                            x={l.coordinates[0][0]*canvasW + 4} y={l.coordinates[0][1]*canvasH - 22}
                            text={l.label} fontSize={11} fill="#fff" fontStyle="bold" />
                          {l.coordinates.map((p, pi) => (
                            <Circle key={pi} x={p[0]*canvasW} y={p[1]*canvasH}
                              radius={sel ? 8 : 6} fill={sel ? "#fff" : color}
                              stroke={color} strokeWidth={2} draggable
                              onDragMove={() => handleVertexDrag(l.id, pi)}
                              onClick={() => setSelectedId(l.id)} />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </Layer>
                </Stage>
              </div>
              <p className="canvas-hint mt-2">
                <Info className="w-3.5 h-3.5 flex-shrink-0" />
                Drag circle endpoints to reposition · select a line by clicking its label · canvas capped at 1280×720
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══ STEP 3 — LIVE INFERENCE ════════════════════════════════════════ */}
      {step === 3 && (
        <div className="svc-panel">
          {/* Control bar */}
          <div className="ctrl-bar mb-4">
            <div className="flex items-center gap-3 min-w-0 flex-wrap">
              <span className={`status-dot-lg ${running ? "sdl-live" : "sdl-idle"}`} />
              <span className="text-sm font-semibold text-slate-200 truncate">{statusMsg}</span>
              {running && (
                <>
                  <span className="chip chip-indigo">{fps} fps recv</span>
                  <span className="chip chip-emerald">{streamFps} fps src</span>
                  <span className="chip chip-slate">{frameCount} frames</span>
                  <span className="chip chip-violet">{activeLines} line{activeLines !== 1 ? "s" : ""}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {eventLogs.length > 0 && (
                <button onClick={downloadCSV} className="btn btn-secondary btn-sm gap-1.5">
                  <Download className="w-3.5 h-3.5" /> CSV
                </button>
              )}
              <button onClick={() => setShowMinimap(p => !p)} className="btn btn-secondary btn-sm gap-1.5">
                {showMinimap ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />} Minimap
              </button>
              <button onClick={() => goTo(2)} disabled={running} className="btn btn-secondary btn-sm gap-1.5">
                <ChevronLeft className="w-3.5 h-3.5" /> Edit Lines
              </button>
              {!running
                ? <button onClick={startStream} disabled={!effectiveSource} className="btn btn-success btn-sm gap-2">
                    <Play className="w-4 h-4 fill-current" /> Start
                  </button>
                : <button onClick={stopStream} className="btn btn-danger btn-sm gap-2">
                    <Square className="w-4 h-4 fill-current" /> Stop
                  </button>}
            </div>
          </div>

          {/* Feed + analytics */}
          <div className="inference-grid">
            {/* Large live feed — max 1280×720 */}
            <div className="feed-col">
              <div className="feed-box" style={{ position: "relative", maxWidth: 1280 }}>
                {currentFrame
                  ? <img src={currentFrame} alt="Live" className="feed-img" />
                  : <div className="feed-empty">
                      <Zap className="w-10 h-10 text-indigo-500/30 mb-3" />
                      <p className="text-slate-500 text-sm">{running ? "Waiting for first frame…" : "Click Start to begin"}</p>
                      {running && <div className="spinner mt-4" />}
                    </div>}

                {/* Minimap */}
                {showMinimap && lines.length > 0 && (
                  <div className="minimap">
                    <p className="minimap-lbl">Lines ROI</p>
                    <svg width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`}
                      style={{ background: "rgba(0,0,0,0.55)", borderRadius: 6, display: "block" }}>
                      {lines.map((l, idx) => {
                        const c = LINE_COLORS[idx % LINE_COLORS.length];
                        const x1 = l.coordinates[0][0]*MINI_W, y1 = l.coordinates[0][1]*MINI_H;
                        const x2 = l.coordinates[1][0]*MINI_W, y2 = l.coordinates[1][1]*MINI_H;
                        return (
                          <g key={l.id}>
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeWidth={2} />
                            <circle cx={(x1+x2)/2} cy={(y1+y2)/2} r={3} fill={c} />
                            <text x={x1+3} y={y1-3} fill="#fff" fontSize={7} fontWeight="bold">{l.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Analytics */}
            <div className="analytics-col">
              {/* IN / OUT totals */}
              <div className="glass-panel p-4 mb-4">
                <p className="text-label mb-3">Total Crossings</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="count-card count-emerald">
                    <TrendingUp className="w-5 h-5 mb-1" />
                    <span className="count-num">{totalIN}</span>
                    <span className="count-lbl">IN</span>
                  </div>
                  <div className="count-card count-rose">
                    <TrendingDown className="w-5 h-5 mb-1" />
                    <span className="count-num">{totalOUT}</span>
                    <span className="count-lbl">OUT</span>
                  </div>
                </div>
              </div>

              {/* Per-line breakdown */}
              {Object.keys(regionCounts).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">Per-Line Breakdown</p>
                  {Object.entries(regionCounts).map(([label, counts], idx) => {
                    const color = LINE_COLORS[idx % LINE_COLORS.length];
                    const total = Object.values(counts).reduce((a, b) => a + b, 0);
                    return (
                      <div key={label} className="region-breakdown-row mb-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="color-dot" style={{ background: color }} />
                          <span className="text-xs font-bold text-slate-200 flex-1 truncate">{label}</span>
                          <span className="text-xs font-extrabold" style={{ color }}>{total}</span>
                        </div>
                        <div className="bar-track">
                          <div className="bar-fill" style={{ width: `${Math.min(100, total * 5)}%`, background: color }} />
                        </div>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {Object.entries(counts).map(([cls, n]) => (
                            <span key={cls} className="cls-chip">{cls}: {n}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* By class */}
              {Object.keys(classCounts).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">By Vehicle Class</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Object.entries(classCounts).map(([cls, n]) => (
                      <div key={cls} className="class-stat">
                        <span className="text-[10px] font-bold text-slate-400 uppercase truncate">{cls}</span>
                        <span className="text-xl font-extrabold text-slate-100">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event log */}
              <div className="glass-panel p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-label">Event Feed</p>
                  {eventLogs.length > 0 && <span className="text-[10px] text-slate-500">{eventLogs.length} events</span>}
                </div>
                <div className="event-ticker" style={{ maxHeight: 280 }}>
                  {eventLogs.length === 0
                    ? <div className="text-center py-6 text-slate-600 text-xs">
                        <Activity className="w-5 h-5 mx-auto mb-2 opacity-30" />
                        Crossing events will appear here
                      </div>
                    : eventLogs.map((ev, i) => (
                      <div key={i} className="ticker-item">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-200 block">{ev.vehicle_id}</span>
                          <span className="text-[9px] text-slate-500">{ev.region_label} · {new Date(ev.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <span className={`badge ${ev.direction === "IN" ? "badge-in" : "badge-out"}`}>{ev.direction}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
