import React, { useState, useEffect, useRef } from "react";
import { Play, Square, Activity, Bell, ListTodo, ShieldCheck, Settings2, CheckCircle2, AlertCircle } from "lucide-react";
import axios from "axios";

export default function LiveMonitor({ 
    videoSource, 
    cameraId, 
    yoloModelPath, 
    setYoloModel, 
    token, 
    trackerType, 
    setTrackerType, 
    availableModels = [] 
}) {
    const [running, setRunning] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(null);
    const [classCounts, setClassCounts] = useState({});
    const [eventLogs, setEventLogs] = useState([]);
    const [totalVehicles, setTotalVehicles] = useState(0);
    const [fps, setFps] = useState(0);
    const [statusText, setStatusText] = useState("Ready to start");
    
    // Collapsible configurations sidebar state
    const [sidebarOpen, setSidebarOpen] = useState(true);
    
    // Services selection checkboxes
    const [activeServices, setActiveServices] = useState({
        lines: true,
        polygons: true
    });
    
    // Smoke test state
    const [smokeTestResult, setSmokeTestResult] = useState(null);
    const [testingService, setTestingService] = useState(null);
    
    // Frame skip is disabled (always 1 to process all frames)
    const frameSkip = 1;
    
    const wsRef = useRef(null);
    const lastFrameTimeRef = useRef(Date.now());

    // Clean up websocket on unmount
    useEffect(() => {
        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    const runSmokeTest = (service) => {
        setTestingService(service);
        setSmokeTestResult(null);
        axios.get(`http://localhost:8000/api/v1/test/${service}`)
            .then(res => {
                setSmokeTestResult({
                    success: true,
                    service,
                    message: res.data.message,
                    frames: res.data.frames_processed,
                    events: res.data.events_captured_count
                });
                setTestingService(null);
            })
            .catch(err => {
                setSmokeTestResult({
                    success: false,
                    service,
                    message: err.response?.data?.detail || "Smoke test failed to run."
                });
                setTestingService(null);
            });
    };

    const startProcessing = () => {
        if (!videoSource) {
            alert("Please select or upload a video file first!");
            return;
        }

        setStatusText("Connecting to server...");
        setRunning(true);
        setEventLogs([]);
        setClassCounts({});
        setTotalVehicles(0);

        const params = new URLSearchParams({
            video_source: videoSource,
            camera_id: cameraId,
            frame_skip: frameSkip
        });
        if (yoloModelPath) {
            params.append("model_path", yoloModelPath);
        }
        if (trackerType) {
            params.append("tracker_type", trackerType);
        }
        
        // Assemble active services string (lines,polygons)
        const servicesQuery = Object.keys(activeServices)
            .filter(k => activeServices[k])
            .join(",");
        params.append("services", servicesQuery || "none");
        
        if (token) {
            params.append("token", token);
        }

        const wsUrl = `ws://localhost:8000/api/v1/ws/stream?${params.toString()}`;
        wsRef.current = new WebSocket(wsUrl);

        wsRef.current.onopen = () => {
            setStatusText("Processing started. Streaming frames...");
        };

        wsRef.current.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "error") {
                setStatusText(`Error: ${data.message}`);
                setRunning(false);
                return;
            }

            if (data.frame) {
                setCurrentFrame(data.frame);
                
                // Calculate FPS
                const now = Date.now();
                const delta = now - lastFrameTimeRef.current;
                lastFrameTimeRef.current = now;
                setFps(Math.round(1000 / delta));
            }

            if (data.counts) {
                setClassCounts(data.counts);
                const sum = Object.values(data.counts).reduce((a, b) => a + b, 0);
                setTotalVehicles(sum);
            }

            if (data.events && data.events.length > 0) {
                setEventLogs(prev => [...data.events, ...prev].slice(0, 100));
            }
        };

        wsRef.current.onclose = () => {
            setStatusText("Stream disconnected.");
            setRunning(false);
        };

        wsRef.current.onerror = (err) => {
            setStatusText("WebSocket connection error.");
            setRunning(false);
        };
    };

    const stopProcessing = () => {
        if (wsRef.current) {
            wsRef.current.close();
        }
        setRunning(false);
        setStatusText("Stream stopped by user.");
    };

    return (
        <div className="relative flex flex-col xl:flex-row gap-8 items-stretch justify-start w-full">
            {/* Left Collapsible Settings Sidebar */}
            <div 
                className={`transition-all duration-300 overflow-hidden flex flex-col bg-slate-950/60 rounded-3xl border border-slate-800 backdrop-blur-xl ${
                    sidebarOpen ? "w-full xl:w-[320px] p-6 opacity-100" : "w-0 p-0 opacity-0 border-none pointer-events-none"
                }`}
            >
                <div className="flex items-center justify-between border-b border-slate-900 pb-3 mb-4">
                    <h4 className="text-sm font-bold text-slate-250 flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-indigo-400" />
                        Pipeline Engine Settings
                    </h4>
                </div>

                <div className="space-y-6">
                    {/* Active Services Selection */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Active Traffic Services</label>
                        <div className="space-y-3">
                            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-850 hover:border-slate-800 transition-all">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeServices.lines}
                                        onChange={(e) => setActiveServices({...activeServices, lines: e.target.checked})}
                                        className="accent-indigo-500 rounded h-4 w-4"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-slate-200 block">Line Crossing Counting</span>
                                        <span className="text-[10px] text-slate-500 block">Detects boundary intersections</span>
                                    </div>
                                </label>
                                <button
                                    onClick={() => runSmokeTest("lines")}
                                    disabled={testingService !== null}
                                    className="mt-1 text-[10px] bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-350 hover:text-indigo-200 font-bold py-1.5 px-3 rounded-lg border border-indigo-900/30 transition-all self-start flex items-center gap-1.5"
                                >
                                    {testingService === "lines" ? (
                                        <>
                                            <span className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-indigo-400"></span>
                                            Verifying...
                                        </>
                                    ) : "Smoke Test Line Engine"}
                                </button>
                            </div>

                            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/50 border border-slate-850 hover:border-slate-800 transition-all">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={activeServices.polygons}
                                        onChange={(e) => setActiveServices({...activeServices, polygons: e.target.checked})}
                                        className="accent-indigo-500 rounded h-4 w-4"
                                    />
                                    <div>
                                        <span className="text-xs font-bold text-slate-200 block">Polygon Area Tracking</span>
                                        <span className="text-[10px] text-slate-500 block">Detects entering / exiting events</span>
                                    </div>
                                </label>
                                <button
                                    onClick={() => runSmokeTest("polygons")}
                                    disabled={testingService !== null}
                                    className="mt-1 text-[10px] bg-amber-955/20 hover:bg-amber-955/35 text-amber-350 hover:text-amber-200 font-bold py-1.5 px-3 rounded-lg border border-amber-900/30 transition-all self-start flex items-center gap-1.5"
                                >
                                    {testingService === "polygons" ? (
                                        <>
                                            <span className="animate-spin rounded-full h-2.5 w-2.5 border-b-2 border-amber-400"></span>
                                            Verifying...
                                        </>
                                    ) : "Smoke Test Polygon Engine"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Smoke Test Results Alert Card */}
                    {smokeTestResult && (
                        <div className={`p-4 rounded-xl text-xs border ${
                            smokeTestResult.success 
                                ? "bg-emerald-950/40 border-emerald-900/50 text-emerald-300" 
                                : "bg-rose-950/40 border-rose-900/50 text-rose-300"
                        }`}>
                            <div className="flex justify-between items-center font-bold mb-1.5">
                                <span className="flex items-center gap-1.5">
                                    {smokeTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-450" /> : <AlertCircle className="w-4 h-4 text-rose-450" />}
                                    {smokeTestResult.service === "lines" ? "Line Engine Test" : "Polygon Engine Test"}
                                </span>
                                <button onClick={() => setSmokeTestResult(null)} className="text-slate-400 hover:text-slate-200 text-sm">×</button>
                            </div>
                            <p className="text-[10.5px] leading-relaxed">{smokeTestResult.message}</p>
                            {smokeTestResult.success && (
                                <div className="mt-2 pt-2 border-t border-slate-900 flex justify-between text-[10px] text-slate-400 font-semibold">
                                    <span>Frames: {smokeTestResult.frames}</span>
                                    <span>Events: {smokeTestResult.events}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Inference Model Selector */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Inference Model</label>
                        <select
                            value={yoloModelPath}
                            onChange={(e) => setYoloModel(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-850 text-slate-200 px-3 py-2 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                        >
                            {availableModels.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Tracker Engine Selector */}
                    <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tracker Algorithm</label>
                        <select
                            value={trackerType}
                            onChange={(e) => setTrackerType(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-850 text-slate-200 px-3 py-2 rounded-xl outline-none focus:border-indigo-500 text-xs font-semibold"
                        >
                            <option value="deepsort">DeepSORT (Numba JIT CUDA)</option>
                            <option value="bytetrack">ByteTrack (Ultralytics)</option>
                            <option value="botsort">BoT-SORT (Ultralytics)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Stream and Counters Area (Spans remaining width) */}
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Live Frame Streaming (Grid-Span 2) */}
                <div className="xl:col-span-2 flex flex-col items-center p-6 bg-slate-900/60 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <div className="flex justify-between w-full mb-4 items-center gap-4">
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => setSidebarOpen(!sidebarOpen)}
                                className="p-2 rounded-lg bg-slate-850 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all flex items-center justify-center"
                                title={sidebarOpen ? "Collapse pipeline settings" : "Expand pipeline settings"}
                            >
                                <Settings2 className="w-4.5 h-4.5 text-indigo-400" />
                            </button>
                            <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2 truncate">
                                <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                                Real-time Video Feed & Predictions
                            </h3>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-shrink-0">
                            {running && (
                                <span className="bg-emerald-950/40 border border-emerald-800/50 text-emerald-400 px-2.5 py-1 rounded-lg flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                    Live • {fps} FPS
                                </span>
                            )}
                            <span className="text-slate-350 bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-lg truncate max-w-[150px]">{statusText}</span>
                        </div>
                    </div>

                    {/* Video Frame Display */}
                    <div className="w-full aspect-video rounded-2xl border-2 border-slate-800 bg-slate-950 flex items-center justify-center overflow-hidden shadow-2xl relative">
                        {currentFrame ? (
                            <img 
                                src={currentFrame} 
                                alt="Live Stream Feed" 
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500">
                                <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 mb-4">
                                    <Activity className="w-8 h-8 text-slate-600" />
                                </div>
                                <p className="text-lg font-medium text-slate-400">Stream Not Active</p>
                                <p className="text-sm mt-1">Select video source and click "Start Analysis Pipeline" to stream live predictions.</p>
                            </div>
                        )}
                    </div>

                    {/* Processing Controls */}
                    <div className="flex justify-center gap-4 mt-6 w-full">
                        {!running ? (
                            <button
                                onClick={startProcessing}
                                className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950/20 flex items-center gap-2.5 transition-all duration-200"
                            >
                                <Play className="w-5 h-5 fill-current" />
                                Start Analysis Pipeline
                            </button>
                        ) : (
                            <button
                                onClick={stopProcessing}
                                className="px-8 py-3.5 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-950/20 flex items-center gap-2.5 transition-all duration-200"
                            >
                                <Square className="w-5 h-5 fill-current" />
                                Stop Analysis Pipeline
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Column: Live Counters & Crossing Event Logs */}
                <div className="flex flex-col gap-6">
                    {/* Live Counters */}
                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/80">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-indigo-400" />
                            Live Vehicle Counts
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-indigo-950/20 border border-indigo-900/40 p-4 rounded-xl col-span-2 text-center">
                                <span className="block text-xs font-medium text-indigo-300">Total Count</span>
                                <span className="text-3xl font-extrabold text-white mt-1 block">{totalVehicles}</span>
                            </div>
                            {Object.entries(classCounts).map(([cls, cnt]) => (
                                <div key={cls} className="bg-slate-900 border border-slate-800/60 p-3 rounded-xl">
                                    <span className="block text-[11px] font-semibold text-slate-400 uppercase truncate">{cls}</span>
                                    <span className="text-xl font-bold text-slate-200 mt-0.5 block">{cnt}</span>
                                </div>
                            ))}
                            {Object.keys(classCounts).length === 0 && (
                                <div className="col-span-2 text-center text-xs py-4 text-slate-600">No objects tracked yet.</div>
                            )}
                        </div>
                    </div>

                    {/* Event Logs ticker */}
                    <div className="bg-slate-950/50 p-6 rounded-2xl border border-slate-800/80 flex-1 flex flex-col max-h-[300px]">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Bell className="w-4 h-4 text-amber-400" />
                            Live Crossing Log
                        </h4>
                        <div className="overflow-y-auto space-y-2 flex-1 pr-1 text-xs">
                            {eventLogs.length === 0 ? (
                                <div className="text-slate-600 text-center py-10">No events logged. Wait for vehicle crossing events.</div>
                            ) : (
                                eventLogs.map((log, idx) => (
                                    <div key={idx} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between">
                                        <div className="min-w-0 flex-1 pr-2">
                                            <span className="font-semibold text-slate-200 block truncate">{log.vehicle_id}</span>
                                            <span className="text-[10px] text-slate-500 block truncate">
                                                {log.region_label} • {new Date(log.timestamp).toLocaleTimeString()}
                                            </span>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] flex-shrink-0 ${
                                            log.direction === "IN" 
                                                ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/50" 
                                                : "bg-rose-950/60 text-rose-400 border border-rose-800/50"
                                        }`}>
                                            {log.direction}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
