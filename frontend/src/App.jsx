import React, { useState, useEffect } from "react";
import axios from "axios";
import DrawingCanvas from "./components/DrawingCanvas";
import LiveMonitor from "./components/LiveMonitor";
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import AuthGate from "./components/AuthGate";
import SystemLogs from "./components/SystemLogs";
import Map3D from "./components/Map3D";
import ServicesPage from "./components/ServicesPage";
import SettingsPage from "./components/SettingsPage";
import AboutPage from "./components/AboutPage";
import { Upload, Video, ShieldCheck, Activity, BarChart3, Settings2, Terminal, LogOut, Map, Pin, Save, Layers, Settings, Info } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

export const formatModelName = (name) => {
    const n = (name || "").toLowerCase();
    if (n.includes("quantized") || n.includes("int8")) return "AATMS Edge AI - Quantized";
    if (n.includes("tflite")) return "AATMS Edge AI - TFLite";
    if (n.includes("yolov8n") || n.includes("nano")) return "AATMS Edge AI - Nano";
    if (n.includes("yolov8s") || n.includes("small")) return "AATMS Edge AI - Small";
    if (n.includes("yolov8m") || n.includes("base")) return "AATMS Edge AI - Base";
    if (n.includes("yolov8l") || n.includes("large")) return "AATMS Edge AI - Large";
    return "AATMS Edge AI - Custom";
};

export default function App() {
    const [token, setToken] = useState(localStorage.getItem("aatms_token"));
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState("monitor"); // "monitor", "analytics", "map", "services", "settings"
    const [theme, setTheme] = useState(localStorage.getItem("aatms_theme") || "theme-blue");
    
    // Core configurations
    const [videoSource, setVideoSource] = useState("");
    const [cameraId, setCameraId] = useState("default");
    const [yoloModel, setYoloModel] = useState("yolov8n.pt");
    const [trackerType, setTrackerType] = useState("deepsort"); // "deepsort", "bytetrack", "botsort"
    
    // Global Alerts State
    const [globalAlerts, setGlobalAlerts] = useState([]);
    const [showAlertsPanel, setShowAlertsPanel] = useState(true);
    
    // Camera coordinates mapping
    const [cameraName, setCameraName] = useState("AATMS Delhi Node");
    const [cameraLat, setCameraLat] = useState("28.6139");
    const [cameraLng, setCameraLng] = useState("77.2090");

    const [availableModels, setAvailableModels] = useState(["yolov8n.pt"]);
    const [uploadedJobs, setUploadedJobs] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [selectedJob, setSelectedJob] = useState("");

    // Apply theme to body
    useEffect(() => {
        document.body.className = theme;
        localStorage.setItem("aatms_theme", theme);
    }, [theme]);

    // Verify token & fetch profile
    useEffect(() => {
        if (!token) return;
        
        axios.get(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => {
            setUser(res.data);
            localStorage.setItem("aatms_user", JSON.stringify(res.data));
        })
        .catch(err => {
            console.error("Token verification failed. Logging out...", err);
            handleLogout();
        });
    }, [token]);

    // Fetch existing uploaded jobs
    const fetchJobs = () => {
        axios.get(`${API_BASE}/jobs`)
            .then(res => {
                setUploadedJobs(res.data);
                if (res.data.length > 0 && !videoSource) {
                    setVideoSource(res.data[0].filepath);
                    setSelectedJob(res.data[0].filepath);
                }
            })
            .catch(err => {
                console.error("Error fetching jobs:", err);
            });
    };

    // Fetch models lists
    const fetchModels = () => {
        axios.get(`${API_BASE}/models`)
            .then(res => {
                setAvailableModels(res.data);
                if (res.data.length > 0) {
                    // Pre-select first custom model if available
                    const customModel = res.data.find(m => m.includes("quantization") || m.includes("Adam"));
                    if (customModel) {
                        setYoloModel(customModel);
                    } else {
                        setYoloModel(res.data[0]);
                    }
                }
            })
            .catch(err => console.error("Error loading model list:", err));
    };

    // Fetch camera settings
    const fetchCameraSettings = () => {
        axios.get(`${API_BASE}/cameras`)
            .then(res => {
                const currentCam = res.data.find(c => c.id === cameraId);
                if (currentCam) {
                    setCameraName(currentCam.name);
                    setCameraLat(currentCam.latitude.toString());
                    setCameraLng(currentCam.longitude.toString());
                }
            })
            .catch(err => console.error("Error loading cameras coordinates:", err));
    };

    useEffect(() => {
        if (token) {
            fetchJobs();
            fetchModels();
            fetchCameraSettings();
        }
    }, [token, cameraId]);

    // Global Alerts Poller
    useEffect(() => {
        if (!token) return;
        const fetchGlobalAlerts = () => {
            axios.get(`${API_BASE}/alerts?camera_id=${cameraId}&limit=10`)
                .then(res => setGlobalAlerts(res.data))
                .catch(err => console.error("Error fetching global alerts:", err));
        };
        fetchGlobalAlerts();
        const interval = setInterval(fetchGlobalAlerts, 3000);
        return () => clearInterval(interval);
    }, [token, cameraId]);

    // Save camera mapping coordinates to PostgreSQL
    const handleSaveCamera = () => {
        axios.post(`${API_BASE}/cameras`, {
            id: cameraId,
            name: cameraName,
            latitude: parseFloat(cameraLat) || 28.6139,
            longitude: parseFloat(cameraLng) || 77.2090,
            video_url: videoSource
        }, {
            headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => {
            alert("Camera coordinates successfully mapping to 3D satellite layer!");
            fetchCameraSettings();
        })
        .catch(err => {
            alert("Failed to store camera coordinates in database.");
        });
    };

    const handleAuthSuccess = (newToken, newUser) => {
        setToken(newToken);
        setUser(newUser);
        setActiveTab("about");
    };

    const handleLogout = () => {
        localStorage.removeItem("aatms_token");
        localStorage.removeItem("aatms_user");
        setToken(null);
        setUser(null);
        setVideoSource("");
        setSelectedJob("");
    };

    // Handle file upload
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        axios.post(`${API_BASE}/upload`, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
                Authorization: `Bearer ${token}`
            }
        })
        .then(res => {
            setUploading(false);
            setVideoSource(res.data.filepath);
            setSelectedJob(res.data.filepath);
            fetchJobs();
            alert(`Uploaded file successfully: ${res.data.filename}`);
        })
        .catch(err => {
            setUploading(false);
            console.error("Upload error:", err);
            alert("Upload failed. Make sure the file is a valid video format.");
        });
    };

    if (!token) {
        return (
            <div className="app-container">
                <div className="header-bar flex justify-center py-6">
                    <div className="text-center">
                        <h1 className="text-title">AATMS</h1>
                        <p className="text-subtitle">Ground-breaking Edge AI Solution for Smart City and Traffic Monitoring</p>
                    </div>
                </div>
                <AuthGate onAuthSuccess={handleAuthSuccess} />
            </div>
        );
    }

    return (
        <div className="app-container">
            {/* Top Navigation / Header bar */}
            <div className="header-bar">
                <div>
                    <h1 className="text-title">AATMS</h1>
                    <p className="text-subtitle">Welcome back, <span className="text-indigo-400 font-bold">@{user?.username}</span> • Ground-breaking Edge AI Solution for Smart City</p>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="tab-nav">
                        <button
                            onClick={() => setActiveTab("about")}
                            className={`btn-tab ${activeTab === "about" ? "active" : ""}`}
                            style={activeTab === "about" ? { color: "#10b981", background: "rgba(16,185,129,0.1)" } : {}}
                        >
                            <Info className="w-4 h-4" />
                            About AATMS
                        </button>
                        <button
                            onClick={() => setActiveTab("monitor")}
                            className={`btn-tab ${activeTab === "monitor" ? "active" : ""}`}
                        >
                            <Activity className="w-4 h-4" />
                            Live Monitor
                        </button>
                        <button
                            onClick={() => setActiveTab("services")}
                            className={`btn-tab ${activeTab === "services" ? "active" : ""}`}
                            style={activeTab === "services" ? { color: "#fbbf24", background: "rgba(245,158,11,0.1)" } : {}}
                        >
                            <Layers className="w-4 h-4" />
                            Services
                        </button>
                        <button
                            onClick={() => setActiveTab("analytics")}
                            className={`btn-tab ${activeTab === "analytics" ? "active" : ""}`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Analytics
                        </button>
                        <button
                            onClick={() => setActiveTab("map")}
                            className={`btn-tab ${activeTab === "map" ? "active" : ""}`}
                        >
                            <Map className="w-4 h-4" />
                            3D Map
                        </button>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="btn btn-secondary py-2 px-3 flex items-center gap-1.5"
                        title="Sign Out"
                    >
                        <LogOut className="w-4 h-4" />
                        Logout
                    </button>
                </div>
            </div>


            {/* Source Configuration Bar — hidden on Services and Settings tabs */}
            {activeTab !== "services" && activeTab !== "settings" && (
            <div className="source-config-bar">
                <div className="config-group">
                    <span className="config-label">Video Source Selection</span>
                    <select
                        value={selectedJob}
                        onChange={(e) => {
                            setSelectedJob(e.target.value);
                            setVideoSource(e.target.value);
                        }}
                        className="input-field"
                    >
                        <option value="">-- Choose an uploaded file or enter RTSP --</option>
                        {uploadedJobs.map((job) => (
                            <option key={job.id} value={job.filepath}>
                                {job.filename} ({job.status})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="config-group">
                    <span className="config-label">Or RTSP Stream URL</span>
                    <input
                        type="text"
                        placeholder="rtsp://192.168.1.100/stream"
                        value={videoSource.startsWith("rtsp://") ? videoSource : ""}
                        onChange={(e) => {
                            setVideoSource(e.target.value);
                            setSelectedJob("");
                        }}
                        className="input-field"
                    />
                </div>

                <div className="config-group">
                    <span className="config-label">Model Selection</span>
                    <select
                        value={yoloModel}
                        onChange={(e) => setYoloModel(e.target.value)}
                        className="input-field"
                    >
                        {availableModels.map((m) => (
                            <option key={m} value={m}>{formatModelName(m)}</option>
                        ))}
                    </select>
                </div>

                <div className="config-group">
                    <span className="config-label">Tracking Association</span>
                    <select
                        value={trackerType}
                        onChange={(e) => setTrackerType(e.target.value)}
                        className="input-field"
                    >
                        <option value="deepsort">AATMS Advanced Tracker (v1)</option>
                        <option value="bytetrack">AATMS Fast Tracker (v2)</option>
                        <option value="botsort">AATMS Accurate Tracker (v3)</option>
                    </select>
                </div>

                <div className="config-group">
                    <span className="config-label">Upload local .mp4</span>
                    <div className="file-upload-wrapper">
                        <label className="file-upload-btn">
                            {uploading ? (
                                <span className="flex items-center gap-1.5 justify-center">
                                    <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-indigo-400"></span>
                                    Uploading...
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 justify-center">
                                    <Upload className="w-4 h-4" />
                                    Choose Video
                                </span>
                            )}
                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleFileUpload}
                                className="hidden"
                                style={{ display: "none" }}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>
            </div>
            )}

            {/* Main Tabs Content Rendering */}
            <div className="main-content" style={{ paddingBottom: "40px" }}>
                {activeTab === "about" && (
                    <AboutPage />
                )}

                {activeTab === "monitor" && (
                    <LiveMonitor
                        videoSource={videoSource}
                        cameraId={cameraId}
                        yoloModelPath={yoloModel}
                        setYoloModel={setYoloModel}
                        token={token}
                        trackerType={trackerType}
                        setTrackerType={setTrackerType}
                        availableModels={availableModels}
                    />
                )}

                {activeTab === "services" && (
                    <ServicesPage
                        cameraId={cameraId}
                        token={token}
                        availableModels={availableModels}
                        availableJobs={uploadedJobs}
                    />
                )}

                {activeTab === "analytics" && (
                    <AnalyticsDashboard
                        cameraId={cameraId}
                    />
                )}

                {activeTab === "map" && (
                    <Map3D
                        activeCameraId={cameraId}
                    />
                )}

                {activeTab === "settings" && (
                    <SettingsPage
                        theme={theme}
                        setTheme={setTheme}
                        user={user}
                        handleLogout={handleLogout}
                        token={token}
                        videoSource={videoSource}
                        cameraId={cameraId}
                    />
                )}
            </div>


            {/* Footer status bar */}
            <div className="flex justify-between items-center mt-8 text-xs text-slate-500 border-t border-slate-900 pt-4 pb-12 pl-14">
                <span className="flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    Secure Local Instance • PostgreSQL Connected
                </span>
                <span>Active Camera ID: <span className="text-slate-400 font-semibold">{cameraId}</span></span>
            </div>

            {/* Bottom Left Settings Button */}
            <button 
                className="settings-btn-fixed"
                onClick={() => setActiveTab("settings")}
                title="System Settings"
            >
                <Settings className="w-5 h-5" />
            </button>

            {/* Global Notification Panel Widget */}
            {token && showAlertsPanel && (
                <div className="fixed top-24 right-6 w-80 max-h-[60vh] flex flex-col z-50 bg-slate-900/90 backdrop-blur-md border border-red-500/30 rounded-2xl shadow-[0_0_40px_rgba(239,68,68,0.15)] overflow-hidden transition-all duration-300">
                    <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-gradient-to-r from-red-500/10 to-transparent">
                        <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                                <Activity className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                            </div>
                            <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest">Live Alerts</span>
                            {globalAlerts.length > 0 && (
                                <span className="bg-red-500/20 text-red-400 text-[9px] px-2 py-0.5 rounded-full font-bold border border-red-500/30">
                                    {globalAlerts.length}
                                </span>
                            )}
                        </div>
                        <button onClick={() => setShowAlertsPanel(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                            <span className="text-xl leading-none">&times;</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar">
                        {globalAlerts.length === 0 ? (
                            <div className="text-center py-8 text-slate-500 text-xs flex flex-col items-center gap-2">
                                <ShieldCheck className="w-8 h-8 opacity-20" />
                                No active security alerts detected.
                            </div>
                        ) : (
                            globalAlerts.map((alert, idx) => (
                                <div key={alert.id || idx} className="p-3 bg-slate-800/40 rounded-xl border border-slate-700/50 hover:border-red-500/40 transition-colors group">
                                    <div className="flex items-start gap-2.5">
                                        <div className="mt-0.5 flex-shrink-0 w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                        <div>
                                            <p className="text-[11px] font-medium text-slate-200 leading-relaxed">{alert.message}</p>
                                            <div className="flex items-center justify-between mt-2">
                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                                                    {new Date(alert.timestamp).toLocaleTimeString()}
                                                </p>
                                                <p className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700">
                                                    {alert.action_taken}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
            {!showAlertsPanel && token && (
                <button onClick={() => setShowAlertsPanel(true)} className="fixed top-24 right-6 z-50 bg-slate-900 border border-slate-800 p-2.5 rounded-full shadow-lg hover:border-red-500/50 transition-colors group">
                    <Activity className="w-5 h-5 text-red-500 group-hover:animate-pulse" />
                </button>
            )}
            
            {/* Global Footer */}
            <div className="fixed bottom-0 left-0 right-0 p-2 bg-slate-950/80 backdrop-blur-sm border-t border-slate-800/60 z-50 text-center">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                    © 2026 Aman Sah. Exclusive Copyright to AATMS Software.
                </p>
            </div>
        </div>
    );
}
