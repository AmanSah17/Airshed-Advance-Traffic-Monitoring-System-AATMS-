import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text as KonvaText } from "react-konva";
import axios from "axios";
import {
  Play, Square, UploadCloud, Wifi, Video,
  LogIn, LogOut, Hexagon, CheckCircle2, XCircle,
  Trash2, PlusCircle, AlertCircle
} from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

export default function PolygonZoneService({ cameraId = "default", token, availableModels = [], availableJobs = [] }) {
  // Source config
  const [sourceMode, setSourceMode] = useState("upload");
  const [videoSource, setVideoSource] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [model, setModel] = useState(availableModels[0] || "yolov8n.pt");
  const [tracker, setTracker] = useState("deepsort");
  const [uploading, setUploading] = useState(false);

  // ROI canvas
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [polygons, setPolygons] = useState([]);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [polyLabel, setPolyLabel] = useState("");
  const [selectedPolyId, setSelectedPolyId] = useState(null);
  const [roiSaved, setRoiSaved] = useState(false);
  const [roiError, setRoiError] = useState("");
  const stageRef = useRef(null);
  const canvasW = 760, canvasH = 428;

  // Stream
  const [running, setRunning] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(null);
  const [classCounts, setClassCounts] = useState({});
  const [eventLogs, setEventLogs] = useState([]);
  const [totalIN, setTotalIN] = useState(0);
  const [totalOUT, setTotalOUT] = useState(0);
  const [occupancy, setOccupancy] = useState({});  // zone_label -> count
  const [fps, setFps] = useState(0);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const wsRef = useRef(null);
  const fpsRef = useRef(Date.now());

  useEffect(() => {
    if (availableModels.length > 0) setModel(availableModels[0]);
  }, [availableModels]);

  useEffect(() => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) return;
    setRoiSaved(false);
    setRoiError("");
    axios.get(`${API_BASE}/frame`, { params: { video_source: src } })
      .then(res => {
        const img = new window.Image();
        img.src = res.data.frame;
        img.onload = () => setBackgroundImage(img);
      })
      .catch(() => setRoiError("Could not load frame preview."));
  }, [videoSource, rtspUrl, sourceMode]);

  useEffect(() => {
    axios.get(`${API_BASE}/regions`, { params: { camera_id: cameraId, type: "polygon" } })
      .then(res => setPolygons(res.data))
      .catch(() => {});
  }, [cameraId]);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    axios.post(`${API_BASE}/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data", Authorization: `Bearer ${token}` }
    }).then(res => {
      setVideoSource(res.data.filepath);
      setSelectedJob(res.data.filepath);
      setUploading(false);
    }).catch(() => { setUploading(false); setRoiError("Upload failed."); });
  };

  const handleCanvasClick = (e) => {
    if (e.target.className === "Circle") return;
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    setCurrentPoints(prev => [...prev, [pos.x / canvasW, pos.y / canvasH]]);
  };

  const closePolygon = () => {
    if (currentPoints.length < 3) { setRoiError("Need at least 3 points to close a polygon."); return; }
    const label = polyLabel.trim() || `Zone ${polygons.length + 1}`;
    setPolygons(prev => [...prev, { id: Date.now(), label, type: "polygon", coordinates: currentPoints, camera_id: cameraId }]);
    setCurrentPoints([]);
    setPolyLabel("");
    setRoiSaved(false);
    setRoiError("");
  };

  const handleVertexDrag = (polyId, idx, e) => {
    const stage = stageRef.current;
    const pos = stage.getPointerPosition();
    const xN = Math.max(0, Math.min(1, pos.x / canvasW));
    const yN = Math.max(0, Math.min(1, pos.y / canvasH));
    setPolygons(prev => prev.map(p => {
      if (p.id !== polyId) return p;
      const nc = [...p.coordinates];
      nc[idx] = [xN, yN];
      return { ...p, coordinates: nc };
    }));
    setRoiSaved(false);
  };

  const savePolygonsROI = async () => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    try {
      const res = await axios.post(
        `${API_BASE}/regions?camera_id=${cameraId}&type=polygon`,
        polygons, { headers }
      );
      setPolygons(res.data);
      setRoiSaved(true);
      setRoiError("");
    } catch {
      setRoiError("Failed to save polygon configurations.");
    }
  };

  const startStream = () => {
    const src = sourceMode === "rtsp" ? rtspUrl : videoSource;
    if (!src) { setRoiError("Please select or upload a video source."); return; }
    setRunning(true);
    setCurrentFrame(null);
    setClassCounts({});
    setEventLogs([]);
    setTotalIN(0);
    setTotalOUT(0);
    setOccupancy({});
    setStatusMsg("Connecting...");

    const params = new URLSearchParams({
      video_source: src, camera_id: cameraId,
      frame_skip: "1", model_path: model,
      tracker_type: tracker, services: "polygons"
    });
    if (token) params.append("token", token);

    wsRef.current = new WebSocket(`ws://localhost:8000/api/v1/ws/stream?${params}`);
    wsRef.current.onopen = () => setStatusMsg("Live — Polygon Zone Active");
    wsRef.current.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.type === "error") { setStatusMsg(`Error: ${d.message}`); setRunning(false); return; }
      if (d.frame) {
        setCurrentFrame(d.frame);
        const now = Date.now(); setFps(Math.round(1000 / (now - fpsRef.current))); fpsRef.current = now;
      }
      if (d.counts) setClassCounts(d.counts);
      if (d.events?.length) {
        setEventLogs(prev => [...d.events, ...prev].slice(0, 100));
        // track zone occupancy
        setOccupancy(prev => {
          const next = { ...prev };
          d.events.forEach(ev => {
            const zone = ev.region_label || "Unknown";
            if (ev.direction === "IN") next[zone] = (next[zone] || 0) + 1;
            else if (ev.direction === "OUT") next[zone] = Math.max(0, (next[zone] || 0) - 1);
          });
          return next;
        });
        d.events.forEach(ev => {
          if (ev.direction === "IN") setTotalIN(p => p + 1);
          else if (ev.direction === "OUT") setTotalOUT(p => p + 1);
        });
      }
    };
    wsRef.current.onclose = () => { setRunning(false); setStatusMsg("Stream ended."); };
    wsRef.current.onerror = () => { setRunning(false); setStatusMsg("Connection error."); };
  };

  const stopStream = () => { wsRef.current?.close(); setRunning(false); setStatusMsg("Stopped."); };
  useEffect(() => () => wsRef.current?.close(), []);

  const effectiveSource = sourceMode === "rtsp" ? rtspUrl : videoSource;

  // Polygon colours cycling
  const polyColors = ["#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316"];
  const getPolyColor = (id) => polyColors[(id % polyColors.length)] || "#f59e0b";

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center">
          <Hexagon className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Service 2 — Polygon Zone Presence</h2>
          <p className="text-xs text-slate-400 mt-0.5">Draw detection zones · track vehicle entry/exit per zone with timestamps</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-950/40 border border-amber-800/40 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
              Live · {fps} fps
            </span>
          )}
        </div>
      </div>

      {/* Source Selection */}
      <div className="glass-panel p-5">
        <p className="text-label mb-3">Video Source</p>
        <div className="flex gap-2 mb-4">
          {[
            { id: "upload", label: "File Upload", icon: UploadCloud },
            { id: "rtsp", label: "RTSP Stream", icon: Wifi },
            { id: "job", label: "Uploaded Job", icon: Video }
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setSourceMode(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                sourceMode === id
                  ? "bg-amber-600/20 border-amber-500/50 text-amber-300"
                  : "bg-slate-900/50 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-end">
          {sourceMode === "upload" && (
            <div>
              <label className="text-label">Upload Video File</label>
              <label className="file-upload-btn block text-center cursor-pointer">
                {uploading ? "Uploading..." : <><UploadCloud className="inline w-4 h-4 mr-1.5" />Choose .mp4/.avi/.mov</>}
                <input type="file" accept="video/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
              {videoSource && <p className="text-[10px] text-amber-400 mt-1 truncate">{videoSource}</p>}
            </div>
          )}
          {sourceMode === "rtsp" && (
            <div>
              <label className="text-label">RTSP URL</label>
              <input className="input-field" placeholder="rtsp://192.168.1.100/stream1"
                value={rtspUrl} onChange={e => setRtspUrl(e.target.value)} />
            </div>
          )}
          {sourceMode === "job" && (
            <div>
              <label className="text-label">Select Uploaded Job</label>
              <select className="input-field" value={selectedJob}
                onChange={e => { setSelectedJob(e.target.value); setVideoSource(e.target.value); }}>
                <option value="">— choose job —</option>
                {availableJobs.map(j => <option key={j.id} value={j.filepath}>{j.filename}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="text-label">YOLO Model</label>
            <select className="input-field" value={model} onChange={e => setModel(e.target.value)}>
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="text-label">Tracker</label>
            <select className="input-field" value={tracker} onChange={e => setTracker(e.target.value)}>
              <option value="deepsort">DeepSORT (Numba CUDA)</option>
              <option value="bytetrack">ByteTrack</option>
              <option value="botsort">BoT-SORT</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ROI Drawing Canvas */}
        <div className="xl:col-span-2 glass-panel p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Step 1 · Draw Polygon Detection Zones</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">Click to add vertices · click "Close Zone" to finish · up to 6 zones supported</p>
            </div>
            <button onClick={savePolygonsROI} disabled={polygons.length === 0}
              className="btn btn-primary text-xs py-2 px-4">Save Zones to DB</button>
          </div>

          {roiSaved && (
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4" /> Polygon zones saved to database
            </div>
          )}
          {roiError && (
            <div className="flex items-center gap-2 bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs p-3 rounded-xl">
              <XCircle className="w-4 h-4 flex-shrink-0" /> {roiError}
            </div>
          )}

          {/* Label + Close Polygon */}
          <div className="flex gap-3 items-center">
            <input className="input-field flex-1 text-xs py-2" placeholder="Zone label (e.g. 'Parking Bay A')"
              value={polyLabel} onChange={e => setPolyLabel(e.target.value)} />
            {currentPoints.length >= 3 && (
              <button onClick={closePolygon}
                className="btn btn-primary text-xs py-2 px-4 flex-shrink-0 flex items-center gap-1.5">
                <PlusCircle className="w-3.5 h-3.5" /> Close Zone
              </button>
            )}
            {currentPoints.length > 0 && currentPoints.length < 3 && (
              <span className="text-[10px] text-amber-400 flex-shrink-0">
                {3 - currentPoints.length} more point(s) needed
              </span>
            )}
          </div>

          {/* Canvas */}
          <div className="canvas-wrapper" style={{ width: canvasW, height: canvasH, maxWidth: "100%" }}>
            {!backgroundImage && (
              <div className="text-slate-600 text-center p-8">
                <Video className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a video source above to load the frame preview</p>
              </div>
            )}
            {backgroundImage && (
              <Stage width={canvasW} height={canvasH} onClick={handleCanvasClick} ref={stageRef}>
                <Layer>
                  <KonvaImage image={backgroundImage} width={canvasW} height={canvasH} />

                  {/* In-progress polygon */}
                  {currentPoints.length > 0 && (
                    <>
                      <Line
                        points={currentPoints.flatMap(p => [p[0] * canvasW, p[1] * canvasH])}
                        stroke="#818cf8" strokeWidth={2} closed={false} dash={[6, 4]}
                      />
                      {currentPoints.map((p, i) => (
                        <Circle key={i} x={p[0] * canvasW} y={p[1] * canvasH}
                          radius={6} fill="#ffffff" stroke="#818cf8" strokeWidth={2} />
                      ))}
                    </>
                  )}

                  {/* Saved polygons */}
                  {polygons.map((poly, idx) => {
                    const pts = poly.coordinates.flatMap(p => [p[0] * canvasW, p[1] * canvasH]);
                    const color = polyColors[idx % polyColors.length];
                    const sel = selectedPolyId === poly.id;
                    return (
                      <React.Fragment key={poly.id}>
                        <Line points={pts} stroke={color} strokeWidth={sel ? 3 : 2}
                          fill={`${color}25`} closed={true} onClick={() => setSelectedPolyId(poly.id)} />
                        <KonvaText
                          x={poly.coordinates[0][0] * canvasW + 6}
                          y={poly.coordinates[0][1] * canvasH - 16}
                          text={poly.label} fontSize={12} fill="#ffffff" fontStyle="bold" />
                        {poly.coordinates.map((p, i) => (
                          <Circle key={i} x={p[0] * canvasW} y={p[1] * canvasH}
                            radius={6} fill={sel ? "#f472b6" : "#ffffff"} stroke={color} strokeWidth={2}
                            draggable onDragMove={e => handleVertexDrag(poly.id, i, e)}
                            onClick={() => setSelectedPolyId(poly.id)} />
                        ))}
                      </React.Fragment>
                    );
                  })}
                </Layer>
              </Stage>
            )}
          </div>

          {/* Polygons list */}
          {polygons.length > 0 && (
            <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
              {polygons.map((poly, idx) => {
                const color = polyColors[idx % polyColors.length];
                return (
                  <div key={poly.id}
                    onClick={() => setSelectedPolyId(poly.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                      selectedPolyId === poly.id ? "border-slate-600 bg-slate-800/50" : "bg-slate-900/40 border-slate-800"
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }}></span>
                      <span className="text-xs font-semibold text-slate-200">{poly.label}</span>
                      <span className="text-[9px] text-slate-500">{poly.coordinates?.length} vertices</span>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setPolygons(prev => prev.filter(x => x.id !== poly.id)); setRoiSaved(false); }}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded-lg transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Start/Stop */}
          <div className="flex gap-3 pt-2 border-t border-slate-800/50">
            {!running ? (
              <button onClick={startStream} disabled={!effectiveSource}
                className="btn btn-success flex-1 gap-2">
                <Play className="w-4 h-4 fill-current" /> Start Polygon Zone Analysis
              </button>
            ) : (
              <button onClick={stopStream} className="btn btn-danger flex-1 gap-2">
                <Square className="w-4 h-4 fill-current" /> Stop Stream
              </button>
            )}
            <span className="text-[10px] text-slate-500 self-center flex-shrink-0">{statusMsg}</span>
          </div>
        </div>

        {/* Right Panel */}
        <div className="flex flex-col gap-4">
          {/* Entry/Exit totals */}
          <div className="glass-panel p-5">
            <p className="text-label mb-3">Zone Entry / Exit Totals</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="dark-card flex flex-col items-center py-4 gap-1">
                <LogIn className="w-6 h-6 text-emerald-400 mb-1" />
                <span className="text-3xl font-extrabold text-emerald-400">{totalIN}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Entered</span>
              </div>
              <div className="dark-card flex flex-col items-center py-4 gap-1">
                <LogOut className="w-6 h-6 text-rose-400 mb-1" />
                <span className="text-3xl font-extrabold text-rose-400">{totalOUT}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase">Exited</span>
              </div>
            </div>

            {/* Zone occupancy */}
            {Object.keys(occupancy).length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Zone Occupancy</p>
                {Object.entries(occupancy).map(([zone, count]) => (
                  <div key={zone} className="flex items-center justify-between px-3 py-2 bg-amber-950/20 border border-amber-900/30 rounded-xl">
                    <span className="text-xs font-semibold text-amber-200 truncate">{zone}</span>
                    <span className="text-sm font-extrabold text-amber-400 flex-shrink-0 ml-2">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live preview */}
          <div className="glass-panel p-3">
            <p className="text-label mb-2">Live Preview</p>
            <div className="aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
              {currentFrame
                ? <img src={currentFrame} alt="stream" className="w-full h-full object-contain" />
                : <div className="text-slate-600 text-xs text-center px-4"><Video className="w-6 h-6 mx-auto mb-1 opacity-30" />Stream inactive</div>
              }
            </div>
          </div>

          {/* Event Log */}
          <div className="glass-panel p-4 flex flex-col flex-1 min-h-0">
            <p className="text-label mb-2">Zone Event Log</p>
            <div className="event-ticker flex-1">
              {eventLogs.length === 0
                ? <p className="text-slate-600 text-xs text-center py-6">No events yet. Draw zones and start the stream.</p>
                : eventLogs.map((ev, i) => (
                  <div key={i} className="ticker-item">
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-200 block truncate">{ev.vehicle_id}</span>
                      <span className="text-[9px] text-slate-500">{ev.region_label} · {new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <span className={`badge flex-shrink-0 ${ev.direction === "IN" ? "badge-in" : "badge-out"}`}>
                      {ev.direction === "IN" ? "ENTERED" : "EXITED"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
