import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text as KonvaText, Rect } from "react-konva";
import axios from "axios";
import {
  Play, Square, UploadCloud, Wifi, Video, ArrowLeftRight,
  TrendingUp, TrendingDown, CheckCircle2, XCircle, Trash2,
  ChevronRight, ChevronLeft, Database, Zap, Activity,
  Info, AlertTriangle, MousePointerClick, Download,
  Maximize2, Minimize2, Eye, EyeOff, BarChart3
} from "lucide-react";
import { useStepWizard } from "../../hooks/useStepWizard";

const API_BASE = "http://localhost:8000/api/v1";

// 10 distinct line colours (hex for Konva, BGR-equivalent used on backend)
const LINE_COLORS = [
  "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4",
  "#f97316", "#ec4899", "#84cc16", "#3b82f6", "#a855f7"
];

// Step metadata for the progress bar
const STEPS = [
  { id: 1, label: "Select Source", icon: Video },
  { id: 2, label: "Draw Lines",    icon: MousePointerClick },
  { id: 3, label: "Live Analysis", icon: BarChart3 },
];

export default function LineCrossingService({ cameraId = "default", token, availableModels = [], availableJobs = [] }) {
  const { step, goTo, next, prev } = useStepWizard(1);

  // ── Step 1: Source ────────────────────────────────────────────────────────
  const [sourceMode, setSourceMode]   = useState("upload");
  const [videoSource, setVideoSource] = useState("");
  const [rtspUrl, setRtspUrl]         = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [model, setModel]             = useState(availableModels[0] || "yolov8n.pt");
  const [tracker, setTracker]         = useState("deepsort");
  const [uploading, setUploading]     = useState(false);
  const [frameLoading, setFrameLoading] = useState(false);

  // ── Step 2: ROI Canvas ───────────────────────────────────────────────────
  const [backgroundImage, setBgImage] = useState(null);
  const [lines, setLines]             = useState([]);
  const [drawingPts, setDrawingPts]   = useState([]);   // 0 or 1 points in progress
  const [lineLabel, setLineLabel]     = useState("");
  const [selectedId, setSelectedId]   = useState(null);
  const [roiSaved, setRoiSaved]       = useState(false);
  const [roiError, setRoiError]       = useState("");
  const [mousePos, setMousePos]       = useState(null);  // live cursor for rubber-band
  const canvasContainerRef = useRef(null);
  const [canvasSize, setCanvasSize]   = useState({ w: 900, h: 506 }); // 16:9, updated on mount
  const stageRef = useRef(null);

  // ── Step 3: Inference ────────────────────────────────────────────────────
  const [running, setRunning]         = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [classCounts, setClassCounts] = useState({});
  const [regionCounts, setRegionCounts] = useState({});  // per-line breakdown
  const [totalIN, setTotalIN]         = useState(0);
  const [totalOUT, setTotalOUT]       = useState(0);
  const [eventLogs, setEventLogs]     = useState([]);
  const [fps, setFps]                 = useState(0);
  const [streamFps, setStreamFps]     = useState(0);
  const [statusMsg, setStatusMsg]     = useState("Ready");
  const [showMinimap, setShowMinimap] = useState(true);
  const [activeLines, setActiveLines] = useState(0);
  const [frameCount, setFrameCount]   = useState(0);
  const wsRef   = useRef(null);
  const fpsRef  = useRef(Date.now());
  const feedRef = useRef(null);

  // ── Sync canvas size to container width ──────────────────────────────────
  useEffect(() => {
    const resize = () => {
      if (canvasContainerRef.current) {
        const w = canvasContainerRef.current.offsetWidth;
        const h = Math.round(w * (9 / 16));
        setCanvasSize({ w, h });
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvasContainerRef.current) ro.observe(canvasContainerRef.current);
    return () => ro.disconnect();
  }, [step]);

  // Reload bgImage when canvas size changes (redraw at new dimensions)
  const lastSrcRef = useRef("");
  useEffect(() => {
    if (!backgroundImage) return;
    if (!lastSrcRef.current) return;
    const img = new window.Image();
    img.src = lastSrcRef.current;
    img.onload = () => setBgImage(img);
  }, [canvasSize]);

  // Sync model
  useEffect(() => {
    if (availableModels.length > 0) setModel(availableModels[0]);
  }, [availableModels]);

  // ── Load first frame ──────────────────────────────────────────────────────
  const loadFrame = async () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) { setRoiError("Please select a video source first."); return; }
    setFrameLoading(true);
    setRoiError("");
    try {
      const res = await axios.get(`${API_BASE}/frame`, { params: { video_source: src } });
      lastSrcRef.current = res.data.frame;
      const img = new window.Image();
      img.src = res.data.frame;
      img.onload = () => {
        setBgImage(img);
        setFrameLoading(false);
        next(); // advance to Step 2
      };
    } catch {
      setRoiError("Could not load frame preview. Check your video source.");
      setFrameLoading(false);
    }
  };

  // Load existing line regions from DB
  useEffect(() => {
    axios.get(`${API_BASE}/regions`, { params: { camera_id: cameraId, type: "line" } })
      .then(res => setLines(res.data))
      .catch(() => {});
  }, [cameraId]);

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    axios.post(`${API_BASE}/upload`, fd, {
      headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` }
    }).then(res => {
      setVideoSource(res.data.filepath);
      setUploading(false);
    }).catch(() => {
      setUploading(false);
      setRoiError("Upload failed. Try again.");
    });
  };

  // ── Canvas drawing ────────────────────────────────────────────────────────
  const handleCanvasClick = (e) => {
    if (e.target === stageRef.current) {
      // click on background — place point
    } else if (e.target.getClassName && e.target.getClassName() === "Circle") {
      return; // ignore vertex clicks
    }
    const pos = stageRef.current.getPointerPosition();
    const xN = pos.x / canvasSize.w;
    const yN = pos.y / canvasSize.h;

    if (drawingPts.length === 0) {
      setDrawingPts([[xN, yN]]);
    } else {
      // Complete the line
      const label = lineLabel.trim() || `Line ${lines.length + 1}`;
      const newLine = {
        id: Date.now(),
        label,
        type: "line",
        coordinates: [drawingPts[0], [xN, yN]],
        camera_id: cameraId,
        colorIdx: lines.length % LINE_COLORS.length,
      };
      setLines(prev => [...prev, newLine]);
      setDrawingPts([]);
      setLineLabel("");
      setRoiSaved(false);
    }
  };

  const handleMouseMove = useCallback((e) => {
    if (drawingPts.length === 0) return;
    const pos = stageRef.current?.getPointerPosition();
    if (pos) setMousePos(pos);
  }, [drawingPts.length]);

  const handleVertexDrag = (lineId, ptIdx, e) => {
    const pos = stageRef.current.getPointerPosition();
    const xN = Math.max(0, Math.min(1, pos.x / canvasSize.w));
    const yN = Math.max(0, Math.min(1, pos.y / canvasSize.h));
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const nc = [...l.coordinates];
      nc[ptIdx] = [xN, yN];
      return { ...l, coordinates: nc };
    }));
    setRoiSaved(false);
  };

  // ── Save to DB ────────────────────────────────────────────────────────────
  const saveLines = async () => {
    setRoiError("");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await axios.post(
        `${API_BASE}/regions?camera_id=${cameraId}&type=line`,
        lines, { headers }
      );
      setLines(res.data);
      setRoiSaved(true);
    } catch {
      setRoiError("Failed to save lines. Is the backend running?");
    }
  };

  // ── WebSocket stream ──────────────────────────────────────────────────────
  const startStream = () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) return;
    setRunning(true);
    setCurrentFrame(null);
    setClassCounts({});
    setRegionCounts({});
    setEventLogs([]);
    setTotalIN(0);
    setTotalOUT(0);
    setFrameCount(0);
    setStatusMsg("Connecting to pipeline…");

    const params = new URLSearchParams({
      video_source: src, camera_id: cameraId,
      frame_skip: "1", model_path: model,
      tracker_type: tracker, services: "lines"
    });
    if (token) params.append("token", token);

    wsRef.current = new WebSocket(`ws://localhost:8000/api/v1/ws/stream?${params}`);

    wsRef.current.onopen = () => setStatusMsg("🟢 Pipeline active — Line Crossing Analysis running");

    wsRef.current.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.type === "error") { setStatusMsg(`❌ ${d.message}`); setRunning(false); return; }
      if (d.frame) {
        setCurrentFrame(d.frame);
        const now = Date.now();
        setFps(Math.round(1000 / (now - fpsRef.current)));
        fpsRef.current = now;
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

  // ── CSV download ──────────────────────────────────────────────────────────
  const downloadCSV = () => {
    const header = "vehicle_id,class_name,direction,region_label,timestamp\n";
    const rows = eventLogs.map(e =>
      `${e.vehicle_id},${e.class_name},${e.direction},${e.region_label},${e.timestamp}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `line_crossings_${cameraId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const effectiveSource = sourceMode === "rtsp" ? rtspUrl : videoSource;

  // ── Minimap line coordinates scaled for overlay ───────────────────────────
  const MINI_W = 200, MINI_H = 112;

  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="svc-root">

      {/* ── Step Progress Bar ─────────────────────────────────────────── */}
      <div className="wizard-step-bar">
        {STEPS.map((s, i) => {
          const done    = step > s.id;
          const active  = step === s.id;
          const StepIcon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <button
                className={`wizard-step-node ${active ? "active" : ""} ${done ? "done" : ""}`}
                onClick={() => done && goTo(s.id)}
                title={done ? `Back to ${s.label}` : undefined}
              >
                <span className="wizard-step-circle">
                  {done ? <CheckCircle2 className="w-4 h-4" /> : <StepIcon className="w-4 h-4" />}
                </span>
                <span className="wizard-step-label">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`wizard-step-connector ${done ? "done" : ""}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          STEP 1 — SOURCE SETUP
      ══════════════════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className="svc-step-panel">
          <div className="wizard-hint-box" style={{ borderColor: "#6366f1" }}>
            <div className="wizard-hint-icon" style={{ background: "#6366f133", color: "#818cf8" }}>
              <Video className="w-5 h-5" />
            </div>
            <div>
              <p className="wizard-hint-title">👋 Welcome to Line Crossing Counter</p>
              <p className="wizard-hint-body">
                We'll walk you through 3 easy steps — select your video source, draw crossing lines on a frame preview, then launch the live AI analysis. Let's start by picking your video!
              </p>
            </div>
          </div>

          {/* Source mode tabs */}
          <div className="flex gap-2 mt-6 mb-5">
            {[
              { id: "upload", label: "Upload Video File", icon: UploadCloud },
              { id: "rtsp",   label: "RTSP Live Stream",  icon: Wifi },
              { id: "job",    label: "Previously Uploaded", icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setSourceMode(id)}
                className={`source-tab ${sourceMode === id ? "active-indigo" : ""}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>

          {/* Source input */}
          <div className="grid grid-2-col gap-5 mb-6">
            <div>
              {sourceMode === "upload" && (
                <>
                  <label className="field-label">Video File</label>
                  <label className="upload-drop-zone">
                    <UploadCloud className="w-8 h-8 mb-2 opacity-60" />
                    <span className="font-semibold">{uploading ? "Uploading…" : "Click or drag .mp4 / .avi / .mov"}</span>
                    <span className="text-xs text-slate-500 mt-1">Max 2 GB</span>
                    <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </label>
                  {videoSource && (
                    <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {videoSource.split("\\").pop()}
                    </p>
                  )}
                </>
              )}
              {sourceMode === "rtsp" && (
                <>
                  <label className="field-label">RTSP Stream URL</label>
                  <input className="input-field" placeholder="rtsp://192.168.1.100:554/stream1"
                    value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} />
                  <p className="text-[11px] text-slate-500 mt-1.5">Example: rtsp://admin:pass@192.168.1.10/ch01</p>
                </>
              )}
              {sourceMode === "job" && (
                <>
                  <label className="field-label">Select Uploaded Job</label>
                  <select className="input-field" value={selectedJob}
                    onChange={e => { setSelectedJob(e.target.value); setVideoSource(e.target.value); }}>
                    <option value="">— choose a previously uploaded file —</option>
                    {availableJobs.map(j => <option key={j.id} value={j.filepath}>{j.filename}</option>)}
                  </select>
                </>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="field-label">YOLO Model</label>
                <select className="input-field" value={model} onChange={e => setModel(e.target.value)}>
                  {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Tracking Algorithm</label>
                <select className="input-field" value={tracker} onChange={e => setTracker(e.target.value)}>
                  <option value="deepsort">⚡ Custom DeepSORT (Numba CUDA)</option>
                  <option value="bytetrack">ByteTrack (Ultralytics)</option>
                  <option value="botsort">BoT-SORT (Ultralytics)</option>
                </select>
              </div>
            </div>
          </div>

          {roiError && <p className="error-pill mb-4"><XCircle className="w-4 h-4" /> {roiError}</p>}

          <button
            onClick={loadFrame}
            disabled={!effectiveSource || frameLoading}
            className="btn btn-primary btn-lg gap-2"
          >
            {frameLoading
              ? <><span className="spinner-xs" /> Loading frame preview…</>
              : <><ChevronRight className="w-5 h-5" /> Load Frame &amp; Draw Lines</>}
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 2 — ROI DRAWING (full-width fluid canvas)
      ══════════════════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className="svc-step-panel">
          <div className="flex gap-6" style={{ alignItems: "flex-start" }}>

            {/* ── Left: instructions + line list ─────────────────────────── */}
            <div className="roi-sidebar">

              {/* Dynamic hint */}
              <div className={`wizard-hint-box mb-4 ${drawingPts.length === 0 ? "" : "hint-pulsing"}`}
                style={{ borderColor: drawingPts.length === 0 ? "#6366f1" : "#f59e0b" }}>
                <div className="wizard-hint-icon"
                  style={{ background: drawingPts.length === 0 ? "#6366f133" : "#f59e0b22",
                           color: drawingPts.length === 0 ? "#818cf8" : "#fbbf24" }}>
                  <MousePointerClick className="w-5 h-5" />
                </div>
                <div>
                  {drawingPts.length === 0 ? (
                    <>
                      <p className="wizard-hint-title">Draw your crossing lines</p>
                      <p className="wizard-hint-body">
                        Type a label below, then <strong>click once</strong> on the video frame to set the start point.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="wizard-hint-title" style={{ color: "#fbbf24" }}>📍 Start point placed!</p>
                      <p className="wizard-hint-body">
                        Now <strong>click the end point</strong> on the frame to complete the line. The line will appear immediately.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Label input */}
              <div className="mb-4">
                <label className="field-label">Line Label</label>
                <input
                  className="input-field"
                  placeholder="e.g. Lane A, Entry North…"
                  value={lineLabel}
                  onChange={e => setLineLabel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && drawingPts.length === 0 && setLineLabel(e.target.value)}
                />
                <p className="text-[11px] text-slate-500 mt-1">Name it before clicking on the canvas</p>
              </div>

              {/* Lines list */}
              <div className="field-label mb-2 flex items-center justify-between">
                <span>Active Lines ({lines.length})</span>
                {lines.length > 0 && (
                  <button onClick={() => { setLines([]); setRoiSaved(false); }}
                    className="text-rose-500 hover:text-rose-400 text-[10px] font-bold">Clear All</button>
                )}
              </div>

              <div className="lines-list-scroll">
                {lines.length === 0 && (
                  <p className="text-slate-600 text-xs text-center py-6">
                    No lines yet — click on the canvas to start drawing.
                  </p>
                )}
                {lines.map((l, idx) => {
                  const color = LINE_COLORS[idx % LINE_COLORS.length];
                  return (
                    <div key={l.id}
                      onClick={() => setSelectedId(l.id)}
                      className={`line-item ${selectedId === l.id ? "selected" : ""}`}
                      style={selectedId === l.id ? { borderColor: color + "80" } : {}}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="line-color-dot" style={{ background: color }} />
                        <span className="text-xs font-semibold text-slate-200 truncate">{l.label}</span>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setLines(prev => prev.filter(x => x.id !== l.id));
                          setRoiSaved(false);
                        }}
                        className="trash-btn">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Save + proceed */}
              <div className="mt-4 flex flex-col gap-2">
                {roiError && <p className="error-pill"><XCircle className="w-3.5 h-3.5" /> {roiError}</p>}
                {roiSaved && (
                  <p className="success-pill"><CheckCircle2 className="w-3.5 h-3.5" /> Lines saved to database!</p>
                )}
                <button
                  onClick={saveLines}
                  disabled={lines.length === 0}
                  className="btn btn-primary gap-2 w-full">
                  <Database className="w-4 h-4" /> Save Lines to Database
                </button>
                <button
                  onClick={() => goTo(3)}
                  disabled={!roiSaved && lines.length === 0}
                  className="btn btn-success gap-2 w-full">
                  <Play className="w-4 h-4 fill-current" /> Start Live Analysis →
                </button>
              </div>

              <button onClick={() => goTo(1)} className="btn-ghost mt-3 w-full">
                <ChevronLeft className="w-4 h-4" /> Back to source
              </button>
            </div>

            {/* ── Right: Full-width fluid canvas ───────────────────────── */}
            <div className="roi-canvas-area" ref={canvasContainerRef}>
              <div className="canvas-wrapper" style={{ width: "100%", height: canvasSize.h }}>
                <Stage
                  ref={stageRef}
                  width={canvasSize.w}
                  height={canvasSize.h}
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  style={{ cursor: drawingPts.length === 1 ? "crosshair" : "default" }}
                >
                  <Layer>
                    {backgroundImage && (
                      <KonvaImage image={backgroundImage} width={canvasSize.w} height={canvasSize.h} />
                    )}

                    {/* Rubber-band preview while placing 2nd point */}
                    {drawingPts.length === 1 && mousePos && (
                      <Line
                        points={[
                          drawingPts[0][0] * canvasSize.w, drawingPts[0][1] * canvasSize.h,
                          mousePos.x, mousePos.y
                        ]}
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dash={[8, 5]}
                        opacity={0.8}
                      />
                    )}
                    {drawingPts.length === 1 && (
                      <Circle
                        x={drawingPts[0][0] * canvasSize.w}
                        y={drawingPts[0][1] * canvasSize.h}
                        radius={8}
                        fill="#f59e0b"
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    )}

                    {/* Drawn lines */}
                    {lines.map((l, idx) => {
                      const color = LINE_COLORS[idx % LINE_COLORS.length];
                      const pts = l.coordinates.flatMap(p => [p[0] * canvasSize.w, p[1] * canvasSize.h]);
                      const sel = selectedId === l.id;
                      return (
                        <React.Fragment key={l.id}>
                          <Line
                            points={pts}
                            stroke={sel ? "#ffffff" : color}
                            strokeWidth={sel ? 4 : 3}
                            shadowBlur={sel ? 8 : 0}
                            shadowColor={color}
                          />
                          {/* Direction arrow at midpoint */}
                          <Circle
                            x={(l.coordinates[0][0] + l.coordinates[1][0]) / 2 * canvasSize.w}
                            y={(l.coordinates[0][1] + l.coordinates[1][1]) / 2 * canvasSize.h}
                            radius={5}
                            fill={color}
                          />
                          {/* Label pill background */}
                          <Rect
                            x={l.coordinates[0][0] * canvasSize.w - 2}
                            y={l.coordinates[0][1] * canvasSize.h - 26}
                            width={l.label.length * 8 + 12}
                            height={20}
                            fill={color + "cc"}
                            cornerRadius={4}
                          />
                          <KonvaText
                            x={l.coordinates[0][0] * canvasSize.w + 4}
                            y={l.coordinates[0][1] * canvasSize.h - 22}
                            text={l.label}
                            fontSize={11}
                            fill="#ffffff"
                            fontStyle="bold"
                          />
                          {/* Draggable endpoints */}
                          {l.coordinates.map((p, pi) => (
                            <Circle
                              key={pi}
                              x={p[0] * canvasSize.w}
                              y={p[1] * canvasSize.h}
                              radius={sel ? 8 : 6}
                              fill={sel ? "#ffffff" : color}
                              stroke={color}
                              strokeWidth={2}
                              draggable
                              onDragMove={e => handleVertexDrag(l.id, pi, e)}
                              onClick={() => setSelectedId(l.id)}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </Layer>
                </Stage>
              </div>

              {/* Canvas footer hint */}
              <div className="canvas-footer-hint">
                <Info className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                <span>Drag the circle endpoints to reposition any line · Click a line label to select it · Lines snap to the nearest pixel</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          STEP 3 — LIVE INFERENCE + ANALYTICS
      ══════════════════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className="svc-step-panel">

          {/* ── Status + Control bar ─────────────────────────────────────── */}
          <div className="stream-control-bar">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`status-dot ${running ? "status-live" : "status-idle"}`} />
              <span className="text-sm font-semibold text-slate-200 truncate">{statusMsg}</span>
              {running && (
                <>
                  <span className="stat-chip indigo">{fps} fps recv</span>
                  <span className="stat-chip emerald">{streamFps} fps src</span>
                  <span className="stat-chip slate">{frameCount} frames</span>
                  <span className="stat-chip violet">{activeLines} line{activeLines !== 1 ? "s" : ""} active</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {eventLogs.length > 0 && (
                <button onClick={downloadCSV} className="btn btn-secondary btn-sm gap-1.5">
                  <Download className="w-3.5 h-3.5" /> Export CSV
                </button>
              )}
              <button onClick={() => setShowMinimap(p => !p)} className="btn btn-secondary btn-sm gap-1.5">
                {showMinimap ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                Minimap
              </button>
              <button onClick={() => goTo(2)} className="btn btn-secondary btn-sm gap-1.5" disabled={running}>
                <ChevronLeft className="w-3.5 h-3.5" /> Edit Lines
              </button>
              {!running ? (
                <button onClick={startStream} disabled={!effectiveSource} className="btn btn-success btn-sm gap-2">
                  <Play className="w-4 h-4 fill-current" /> Start Analysis
                </button>
              ) : (
                <button onClick={stopStream} className="btn btn-danger btn-sm gap-2">
                  <Square className="w-4 h-4 fill-current" /> Stop
                </button>
              )}
            </div>
          </div>

          {/* ── Main 2-column layout ─────────────────────────────────────── */}
          <div className="inference-layout">

            {/* Left: Large live feed */}
            <div className="inference-feed-panel" ref={feedRef}>
              <div className="live-feed-wrapper">
                {currentFrame ? (
                  <img src={currentFrame} alt="Live inference" className="live-feed-img" />
                ) : (
                  <div className="feed-placeholder">
                    <Zap className="w-10 h-10 text-indigo-500/40 mb-3" />
                    <p className="text-slate-500 text-sm font-semibold">
                      {running ? "Waiting for first frame…" : "Click Start Analysis to begin"}
                    </p>
                    {running && <div className="spinner mt-4" />}
                  </div>
                )}

                {/* Minimap overlay */}
                {showMinimap && lines.length > 0 && (
                  <div className="minimap-overlay">
                    <p className="minimap-label">ROI Lines</p>
                    <svg width={MINI_W} height={MINI_H} viewBox={`0 0 ${MINI_W} ${MINI_H}`}
                      style={{ background: "rgba(0,0,0,0.5)", borderRadius: 6 }}>
                      {lines.map((l, idx) => {
                        const color = LINE_COLORS[idx % LINE_COLORS.length];
                        const x1 = l.coordinates[0][0] * MINI_W;
                        const y1 = l.coordinates[0][1] * MINI_H;
                        const x2 = l.coordinates[1][0] * MINI_W;
                        const y2 = l.coordinates[1][1] * MINI_H;
                        return (
                          <g key={l.id}>
                            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} />
                            <circle cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={3} fill={color} />
                            <text x={x1 + 3} y={y1 - 3} fill="#fff" fontSize={7} fontWeight="bold">{l.label}</text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Analytics sidebar */}
            <div className="analytics-sidebar-panel">

              {/* Headline IN/OUT */}
              <div className="glass-panel p-4 mb-4">
                <p className="text-label mb-3">Total Crossings</p>
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div className="count-card emerald">
                    <TrendingUp className="w-5 h-5 mb-1" />
                    <span className="count-number">{totalIN}</span>
                    <span className="count-label">IN</span>
                  </div>
                  <div className="count-card rose">
                    <TrendingDown className="w-5 h-5 mb-1" />
                    <span className="count-number">{totalOUT}</span>
                    <span className="count-label">OUT</span>
                  </div>
                </div>
              </div>

              {/* Per-line breakdown */}
              {Object.keys(regionCounts).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">Per-Line Breakdown</p>
                  <div className="flex flex-col gap-2">
                    {Object.entries(regionCounts).map(([label, counts], idx) => {
                      const color = LINE_COLORS[idx % LINE_COLORS.length];
                      const total = Object.values(counts).reduce((a, b) => a + b, 0);
                      return (
                        <div key={label} className="region-row">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="line-color-dot" style={{ background: color }} />
                            <span className="text-xs font-bold text-slate-200 truncate flex-1">{label}</span>
                            <span className="text-xs font-extrabold" style={{ color }}>{total}</span>
                          </div>
                          <div className="region-bar-track">
                            <div className="region-bar-fill"
                              style={{ width: `${Math.min(100, total * 4)}%`, background: color }} />
                          </div>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {Object.entries(counts).map(([cls, n]) => (
                              <span key={cls} className="class-chip">{cls}: {n}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Per-class totals */}
              {Object.keys(classCounts).length > 0 && (
                <div className="glass-panel p-4 mb-4">
                  <p className="text-label mb-3">By Vehicle Class</p>
                  <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {Object.entries(classCounts).map(([cls, n]) => (
                      <div key={cls} className="class-stat-card">
                        <span className="text-[10px] font-bold text-slate-400 uppercase truncate">{cls}</span>
                        <span className="text-xl font-extrabold text-slate-100">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Event log */}
              <div className="glass-panel p-4 flex flex-col flex-1 min-h-0">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-label">Event Feed</p>
                  {eventLogs.length > 0 && (
                    <span className="text-[10px] text-slate-500">{eventLogs.length} events</span>
                  )}
                </div>
                <div className="event-ticker" style={{ maxHeight: 320 }}>
                  {eventLogs.length === 0 ? (
                    <div className="text-slate-600 text-xs text-center py-8">
                      <Activity className="w-6 h-6 mx-auto mb-2 opacity-30" />
                      Events will appear here as vehicles cross lines
                    </div>
                  ) : (
                    eventLogs.map((ev, i) => (
                      <div key={i} className="ticker-item">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-200 block">{ev.vehicle_id}</span>
                          <span className="text-[9px] text-slate-500">
                            {ev.region_label} · {new Date(ev.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <span className={`badge flex-shrink-0 ${ev.direction === "IN" ? "badge-in" : "badge-out"}`}>
                          {ev.direction}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
