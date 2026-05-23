import React, { useState, useEffect } from "react";
import axios from "axios";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { BarChart3, RefreshCw, Trash2, Calendar, TrendingUp, Info } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#ec4899"];

export default function AnalyticsDashboard({ cameraId }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const fetchAnalytics = () => {
        setLoading(true);
        setError("");
        axios.get(`${API_BASE}/analytics/summary`, { params: { camera_id: cameraId } })
            .then(res => {
                setSummary(res.data);
                setLoading(false);
            })
            .catch(err => {
                setError("Failed to fetch analytics summary.");
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchAnalytics();
    }, [cameraId]);

    const handleClearDb = () => {
        if (!window.confirm("Are you sure you want to delete all historical logs for this camera from PostgreSQL?")) return;
        setLoading(true);
        axios.delete(`${API_BASE}/analytics/clear`, { params: { camera_id: cameraId } })
            .then(() => {
                fetchAnalytics();
            })
            .catch(err => {
                setError("Failed to clear database logs.");
                setLoading(false);
            });
    };

    if (loading && !summary) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-900/60 rounded-3xl border border-slate-800">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-2"></div>
                <span className="text-slate-300 text-sm">Fetching reports...</span>
            </div>
        );
    }

    // Process formats for Recharts
    const classData = summary?.class_distribution 
        ? Object.entries(summary.class_distribution).map(([name, value]) => ({ name, value }))
        : [];
        
    const directionData = summary?.direction_distribution
        ? Object.entries(summary.direction_distribution).map(([name, value]) => ({ name, value }))
        : [];

    const timeSeriesData = summary?.time_series || [];

    return (
        <div className="flex flex-col gap-8">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-6 bg-slate-900/60 rounded-3xl border border-slate-800 backdrop-blur-xl">
                <div>
                    <h3 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-400" />
                        Traffic flow Analytics & Reports
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">Real-time statistics sourced directly from local PostgreSQL database tables</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchAnalytics}
                        disabled={loading}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 font-medium rounded-xl border border-slate-700/50 flex items-center gap-2 transition-all duration-200"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh Data
                    </button>
                    <button
                        onClick={handleClearDb}
                        className="px-4 py-2 bg-rose-950/20 hover:bg-rose-900/30 text-rose-300 font-medium rounded-xl border border-rose-800/40 flex items-center gap-2 transition-all duration-200"
                    >
                        <Trash2 className="w-4 h-4" />
                        Reset Logs
                    </button>
                </div>
            </div>

            {error && <div className="bg-rose-950/40 border border-rose-800 text-rose-300 px-4 py-3 rounded-xl text-sm">{error}</div>}

            {/* Quick stats summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Tracked Vehicles</span>
                    <span className="text-4xl font-extrabold text-indigo-400 block mt-2">{summary?.total_vehicles || 0}</span>
                    <span className="text-[11px] text-slate-500 mt-2 block flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Cumulative total across all lines & zones
                    </span>
                </div>
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Incoming Vehicles (IN)</span>
                    <span className="text-4xl font-extrabold text-emerald-400 block mt-2">
                        {summary?.direction_distribution?.IN || 0}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-2 block flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Vehicles entering monitored bounds
                    </span>
                </div>
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Outgoing Vehicles (OUT)</span>
                    <span className="text-4xl font-extrabold text-amber-400 block mt-2">
                        {summary?.direction_distribution?.OUT || 0}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-2 block flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        Vehicles exiting monitored bounds
                    </span>
                </div>
            </div>

            {/* Charts Visualizations Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Class Distribution Bar Chart */}
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <h4 className="text-base font-semibold text-slate-200 mb-6 uppercase tracking-wider text-xs">Vehicle Categories Breakdown</h4>
                    <div className="h-[280px]">
                        {classData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">No classification data recorded yet.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={classData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                                    <YAxis stroke="#64748b" fontSize={11} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}
                                        labelStyle={{ color: "#94a3b8" }}
                                    />
                                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]}>
                                        {classData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* 2. Directional Pie Chart */}
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl">
                    <h4 className="text-base font-semibold text-slate-200 mb-6 uppercase tracking-wider text-xs">Traffic Direction Ratio</h4>
                    <div className="h-[280px] flex items-center justify-center">
                        {directionData.length === 0 ? (
                            <div className="text-slate-500 text-sm">No directional logs.</div>
                        ) : (
                            <div className="w-full h-full flex flex-col md:flex-row items-center justify-around">
                                <div className="w-1/2 h-[220px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={directionData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {directionData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.name === "IN" ? "#10b981" : "#f59e0b"} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-3 font-medium text-sm text-slate-300">
                                    {directionData.map((d, idx) => (
                                        <div key={d.name} className="flex items-center gap-2">
                                            <span className="w-3.5 h-3.5 rounded-md" style={{ backgroundColor: d.name === "IN" ? "#10b981" : "#f59e0b" }}></span>
                                            <span className="capitalize">{d.name} Direction:</span>
                                            <span className="font-bold text-white">{d.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Traffic Peak Hours Line Chart (Grid Span 2) */}
                <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl lg:col-span-2">
                    <h4 className="text-base font-semibold text-slate-200 mb-6 uppercase tracking-wider text-xs">Peak Hours Traffic Trends (Last 24 Hours)</h4>
                    <div className="h-[280px]">
                        {timeSeriesData.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">No time-series trends available yet. Start streaming to generate timeline trends.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={timeSeriesData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                                    <YAxis stroke="#64748b" fontSize={11} />
                                    <Tooltip contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }} />
                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                                    {/* Dynamically draw lines for classes present in data keys */}
                                    {Object.keys(timeSeriesData[0] || {})
                                        .filter(k => k !== "time")
                                        .map((clsKey, index) => (
                                            <Line
                                                key={clsKey}
                                                type="monotone"
                                                dataKey={clsKey}
                                                stroke={COLORS[index % COLORS.length]}
                                                strokeWidth={2}
                                                dot={{ r: 3 }}
                                                activeDot={{ r: 5 }}
                                            />
                                        ))}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Historical logs list table */}
            <div className="bg-slate-900/60 p-6 rounded-3xl border border-slate-800 backdrop-blur-xl flex flex-col max-h-[400px]">
                <h4 className="text-base font-semibold text-slate-200 mb-4 uppercase tracking-wider text-xs">PostgreSQL Historical Crossing Events Log</h4>
                <div className="overflow-y-auto border border-slate-800/80 rounded-2xl flex-1">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-950/80 sticky top-0 border-b border-slate-850 z-10 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Vehicle ID</th>
                                <th className="px-6 py-4">Class</th>
                                <th className="px-6 py-4">Direction</th>
                                <th className="px-6 py-4">Confidence</th>
                                <th className="px-6 py-4">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850/30">
                            {summary?.recent_logs?.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-900/80 text-slate-300 font-medium">
                                    <td className="px-6 py-3.5 text-slate-500 font-mono">#{log.id}</td>
                                    <td className="px-6 py-3.5 text-white font-semibold">{log.vehicle_id}</td>
                                    <td className="px-6 py-3.5 capitalize">{log.class_name}</td>
                                    <td className="px-6 py-3.5">
                                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                            log.direction === "IN" 
                                                ? "bg-emerald-950/50 text-emerald-400 border border-emerald-800/40" 
                                                : "bg-rose-950/50 text-rose-400 border border-rose-800/40"
                                        }`}>
                                            {log.direction}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3.5 font-mono text-indigo-400">{log.confidence ? `${(log.confidence * 100).toFixed(1)}%` : "N/A"}</td>
                                    <td className="px-6 py-3.5 text-slate-500 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                                </tr>
                            ))}
                            {(!summary?.recent_logs || summary.recent_logs.length === 0) && (
                                <tr>
                                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500 text-sm">No historical crossing logs available.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
