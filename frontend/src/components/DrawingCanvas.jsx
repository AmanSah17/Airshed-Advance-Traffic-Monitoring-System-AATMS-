import React, { useState, useEffect, useRef } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Circle, Text as KonvaText } from "react-konva";
import axios from "axios";
import { Plus, Trash, Save, Edit3, Settings2 } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

export default function DrawingCanvas({ videoSource, cameraId, token }) {
    const [backgroundImage, setBackgroundImage] = useState(null);
    const [frameInfo, setFrameInfo] = useState({ width: 640, height: 360 });
    const [regions, setRegions] = useState([]);
    const [drawMode, setDrawMode] = useState("line"); // "line" or "polygon"
    const [currentPoints, setCurrentPoints] = useState([]);
    const [activeRegionLabel, setActiveRegionLabel] = useState("");
    const [selectedRegionId, setSelectedRegionId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const imageRef = useRef(null);
    const stageRef = useRef(null);

    // Canvas size in UI
    const canvasWidth = 800;
    const canvasHeight = 450;

    // Load first frame of selected video
    useEffect(() => {
        if (!videoSource) return;
        setLoading(true);
        setError("");
        axios.get(`${API_BASE}/frame`, { params: { video_source: videoSource } })
            .then(res => {
                const img = new window.Image();
                img.src = res.data.frame;
                img.onload = () => {
                    setBackgroundImage(img);
                    setFrameInfo({ width: res.data.width, height: res.data.height });
                    setLoading(false);
                };
            })
            .catch(err => {
                setError("Failed to fetch first frame. Make sure the backend is running and the video source path is valid.");
                setLoading(false);
            });
    }, [videoSource]);

    // Fetch saved regions from PostgreSQL
    const fetchRegions = () => {
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        axios.get(`${API_BASE}/regions`, { params: { camera_id: cameraId }, headers })
            .then(res => {
                setRegions(res.data);
            })
            .catch(err => {
                console.error("Error fetching regions:", err);
            });
    };

    useEffect(() => {
        fetchRegions();
    }, [cameraId]);

    // Handle Stage Click to add points
    const handleStageClick = (e) => {
        // If clicking on a circle handle, ignore
        if (e.target.className === "Circle") return;

        const stage = stageRef.current;
        const pointerPosition = stage.getPointerPosition();

        // Convert display coordinates to normalized coordinates (0-1)
        const xNorm = pointerPosition.x / canvasWidth;
        const yNorm = pointerPosition.y / canvasHeight;

        const newPoint = [xNorm, yNorm];

        if (drawMode === "line") {
            if (currentPoints.length < 2) {
                const newPts = [...currentPoints, newPoint];
                setCurrentPoints(newPts);

                if (newPts.length === 2) {
                    // Completed a line, add to temp list
                    const label = activeRegionLabel || `Lane Line ${regions.length + 1}`;
                    const newRegion = {
                        id: Date.now(), // Temporary ID
                        label,
                        type: "line",
                        coordinates: newPts,
                        camera_id: cameraId
                    };
                    setRegions([...regions, newRegion]);
                    setCurrentPoints([]);
                    setActiveRegionLabel("");
                }
            }
        } else if (drawMode === "polygon") {
            setCurrentPoints([...currentPoints, newPoint]);
        }
    };

    // Close polygon
    const handleClosePolygon = () => {
        if (currentPoints.length < 3) {
            setError("Polygons must have at least 3 points.");
            return;
        }
        const label = activeRegionLabel || `Region ${regions.length + 1}`;
        const newRegion = {
            id: Date.now(), // Temporary ID
            label,
            type: "polygon",
            coordinates: currentPoints,
            camera_id: cameraId
        };
        setRegions([...regions, newRegion]);
        setCurrentPoints([]);
        setActiveRegionLabel("");
    };

    // Handle vertex drag/resize
    const handleVertexDrag = (regionId, vertexIndex, e) => {
        const stage = stageRef.current;
        const pointer = stage.getPointerPosition();
        
        // Boundaries checks
        let xNorm = Math.max(0, Math.min(1, pointer.x / canvasWidth));
        let yNorm = Math.max(0, Math.min(1, pointer.y / canvasHeight));

        const updated = regions.map(r => {
            if (r.id === regionId) {
                const newCoords = [...r.coordinates];
                newCoords[vertexIndex] = [xNorm, yNorm];
                return { ...r, coordinates: newCoords };
            }
            return r;
        });
        setRegions(updated);
    };

    // Delete region from list
    const handleDeleteRegion = (id) => {
        setRegions(regions.filter(r => r.id !== id));
    };

    // Save region configurations to local PostgreSQL via FastAPI
    const handleSaveToDb = () => {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        axios.post(`${API_BASE}/regions`, regions, { params: { camera_id: cameraId }, headers })
            .then(res => {
                setRegions(res.data);
                alert("Configurations successfully stored to PostgreSQL database!");
                setLoading(false);
            })
            .catch(err => {
                setError("Failed to save regions to database.");
                setLoading(false);
            });
    };

    return (
        <div className="relative flex flex-col xl:flex-row gap-8 items-stretch justify-start w-full">
            {/* Left/Middle Column: Interactive Canvas */}
            <div className="flex-1 flex flex-col items-center p-6 bg-slate-900/60 rounded-3xl border border-slate-800 backdrop-blur-xl">
                <div className="flex justify-between w-full mb-4 items-center gap-4">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg bg-slate-855 hover:bg-slate-800 text-slate-350 border border-slate-800 transition-all flex items-center justify-center"
                            title={sidebarOpen ? "Collapse config sidebar" : "Expand config sidebar"}
                        >
                            <Settings2 className="w-4 h-4 text-indigo-400" />
                        </button>
                        <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 truncate">
                            Region of Interest (ROI) Setup
                        </h3>
                    </div>
                    <div className="flex gap-2 bg-slate-800/80 p-1 rounded-xl border border-slate-700/50 flex-shrink-0">
                        <button
                            onClick={() => { setDrawMode("line"); setCurrentPoints([]); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                drawMode === "line" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            Line Mode
                        </button>
                        <button
                            onClick={() => { setDrawMode("polygon"); setCurrentPoints([]); }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                drawMode === "polygon" ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            Polygon Mode
                        </button>
                    </div>
                </div>

                {error && <div className="w-full bg-rose-950/40 border border-rose-800 text-rose-300 px-4 py-3 rounded-xl mb-4 text-sm">{error}</div>}

                {/* Canvas Container */}
                <div 
                    className="relative overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-950 flex items-center justify-center shadow-2xl"
                    style={{ width: canvasWidth, height: canvasHeight }}
                >
                    {loading && (
                        <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center z-10">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-2"></div>
                            <span className="text-slate-300 text-sm">Fetching video frame...</span>
                        </div>
                    )}
                    
                    {!backgroundImage && !loading && (
                        <div className="text-slate-500 text-center p-8">
                            <p>No video source loaded.</p>
                            <p className="text-sm mt-1">Select a video upload or stream to draw lines.</p>
                        </div>
                    )}

                    {backgroundImage && (
                        <Stage
                            width={canvasWidth}
                            height={canvasHeight}
                            onClick={handleStageClick}
                            ref={stageRef}
                        >
                            <Layer>
                                {/* Background Video Frame */}
                                <KonvaImage
                                    image={backgroundImage}
                                    width={canvasWidth}
                                    height={canvasHeight}
                                    ref={imageRef}
                                />

                                {/* Draw Current Active Points */}
                                {currentPoints.length > 0 && (
                                    <>
                                        <Line
                                            points={currentPoints.flatMap(pt => [pt[0] * canvasWidth, pt[1] * canvasHeight])}
                                            stroke="#818cf8"
                                            strokeWidth={3}
                                            closed={false}
                                        />
                                        {currentPoints.map((pt, idx) => (
                                            <Circle
                                                key={idx}
                                                x={pt[0] * canvasWidth}
                                                y={pt[1] * canvasHeight}
                                                radius={6}
                                                fill="#ffffff"
                                                stroke="#4f46e5"
                                                strokeWidth={2}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Draw Saved & Configured Regions */}
                                {regions.map((region) => {
                                    const coords = region.coordinates.flatMap(pt => [pt[0] * canvasWidth, pt[1] * canvasHeight]);
                                    const isSelected = selectedRegionId === region.id;
                                    const color = region.type === "line" ? "#10b981" : "#f59e0b"; // Green for line, Amber for polygon

                                    return (
                                        <React.Fragment key={region.id}>
                                            <Line
                                                points={coords}
                                                stroke={color}
                                                strokeWidth={isSelected ? 4 : 2}
                                                fill={region.type === "polygon" ? `${color}30` : undefined}
                                                closed={region.type === "polygon"}
                                                onClick={() => setSelectedRegionId(region.id)}
                                            />

                                            <KonvaText
                                                x={region.coordinates[0][0] * canvasWidth}
                                                y={region.coordinates[0][1] * canvasHeight - 18}
                                                text={region.label}
                                                fontSize={12}
                                                fill="#ffffff"
                                                fontStyle="bold"
                                            />

                                            {region.coordinates.map((pt, idx) => (
                                                <Circle
                                                    key={idx}
                                                    x={pt[0] * canvasWidth}
                                                    y={pt[1] * canvasHeight}
                                                    radius={6}
                                                    fill={isSelected ? "#ec4899" : "#ffffff"}
                                                    stroke={color}
                                                    strokeWidth={2}
                                                    draggable
                                                    onDragMove={(e) => handleVertexDrag(region.id, idx, e)}
                                                />
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </Layer>
                        </Stage>
                    )}
                </div>

                {drawMode === "polygon" && currentPoints.length > 0 && (
                    <button
                        onClick={handleClosePolygon}
                        className="mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg hover:shadow-emerald-950/20 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5" />
                        Complete Polygon Region
                    </button>
                )}
            </div>

            {/* Right Collapsible Config Sidebar */}
            <div 
                className={`transition-all duration-300 overflow-hidden flex flex-col bg-slate-950/60 rounded-3xl border border-slate-800 backdrop-blur-xl ${
                    sidebarOpen ? "w-full xl:w-[320px] p-6 opacity-100" : "w-0 p-0 opacity-0 border-none pointer-events-none"
                }`}
            >
                <h4 className="text-sm font-bold text-slate-250 mb-4 flex items-center gap-2 border-b border-slate-900 pb-3">
                    <Plus className="w-4 h-4 text-emerald-450" />
                    Configure Segments
                </h4>

                <div className="mb-5">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Region Label</label>
                    <input
                        type="text"
                        value={activeRegionLabel}
                        onChange={(e) => setActiveRegionLabel(e.target.value)}
                        placeholder="e.g., Lane 1 IN, Speed Zone"
                        className="w-full bg-slate-900 border border-slate-850 text-slate-200 px-3.5 py-2 rounded-xl outline-none focus:border-indigo-500 transition-all text-xs font-semibold"
                    />
                    <p className="text-slate-500 text-[10px] mt-1.5">Specify label *before* clicking to draw.</p>
                </div>

                <div className="flex-1 overflow-y-auto max-h-[300px] mb-6 pr-1 space-y-4">
                    {/* Line Segments Section */}
                    <div>
                        <span className="block text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Active Lines ({regions.filter(r => r.type === "line").length})
                        </span>
                        {regions.filter(r => r.type === "line").length === 0 ? (
                            <div className="text-slate-600 text-[10.5px] py-2 pl-3 border-l border-slate-850">No lines defined. Choose Line Mode and click to draw.</div>
                        ) : (
                            <div className="space-y-1.5">
                                {regions.filter(r => r.type === "line").map((r) => (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedRegionId(r.id)}
                                        className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                                            selectedRegionId === r.id
                                                ? "bg-emerald-950/20 border-emerald-500/40"
                                                : "bg-slate-900/60 border-slate-850 hover:border-slate-800"
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="text-slate-200 font-bold text-xs truncate">{r.label}</div>
                                            <div className="text-slate-500 text-[9px] truncate">Endpoints: {r.coordinates.length}</div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteRegion(r.id); }}
                                            className="text-slate-500 hover:text-rose-450 p-1 rounded-lg hover:bg-rose-950/20 transition-all flex-shrink-0"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Polygon Zones Section */}
                    <div>
                        <span className="block text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                            Active Polygons ({regions.filter(r => r.type === "polygon").length})
                        </span>
                        {regions.filter(r => r.type === "polygon").length === 0 ? (
                            <div className="text-slate-600 text-[10.5px] py-2 pl-3 border-l border-slate-850">No polygon zones defined. Choose Polygon Mode and click to draw.</div>
                        ) : (
                            <div className="space-y-1.5">
                                {regions.filter(r => r.type === "polygon").map((r) => (
                                    <div
                                        key={r.id}
                                        onClick={() => setSelectedRegionId(r.id)}
                                        className={`flex items-center justify-between p-2 rounded-xl border transition-all cursor-pointer ${
                                            selectedRegionId === r.id
                                                ? "bg-amber-950/20 border-amber-500/40"
                                                : "bg-slate-900/60 border-slate-850 hover:border-slate-800"
                                        }`}
                                    >
                                        <div className="min-w-0 flex-1 pr-2">
                                            <div className="text-slate-200 font-bold text-xs truncate">{r.label}</div>
                                            <div className="text-slate-500 text-[9px] truncate">Vertices: {r.coordinates.length}</div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteRegion(r.id); }}
                                            className="text-slate-500 hover:text-rose-455 p-1 rounded-lg hover:bg-rose-950/20 transition-all flex-shrink-0"
                                        >
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <button
                    onClick={handleSaveToDb}
                    disabled={loading || regions.length === 0}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-950/30 flex items-center justify-center gap-2 transition-all duration-200 text-xs"
                >
                    <Save className="w-4 h-4" />
                    Save Configs to Database
                </button>
            </div>
        </div>
    );
}
