import React, { useState, useEffect } from "react";
import axios from "axios";
import { UserCheck, ShieldAlert, MailCheck, RefreshCw, Terminal, Eye } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

export default function SystemLogs({ token }) {
    const [subTab, setSubTab] = useState("activity"); // "activity", "errors", "emails"
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedErrorId, setExpandedErrorId] = useState(null);

    const fetchLogs = () => {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        let url = `${API_BASE}/system/logs`;
        if (subTab === "errors") url = `${API_BASE}/system/errors`;
        if (subTab === "emails") url = `${API_BASE}/system/emails`;

        axios.get(url, { headers })
            .then(res => {
                setLogs(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Error fetching logs:", err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchLogs();
    }, [subTab]);

    return (
        <div className="flex flex-col gap-6 p-6 bg-slate-900/60 rounded-3xl border border-slate-800 backdrop-blur-xl">
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h3 className="text-xl font-semibold text-slate-100 flex items-center gap-2">
                        <Terminal className="w-5 h-5 text-indigo-400" />
                        System Administration Panel
                    </h3>
                    <p className="text-slate-400 text-xs mt-1">Audit trails, Python exception tracking, and developer logs</p>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 font-medium rounded-xl border border-slate-700/50 flex items-center gap-2 transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Logs
                </button>
            </div>

            {/* Inner Tabs navigation */}
            <div className="flex gap-2 bg-slate-950/40 p-1 rounded-xl border border-slate-800 self-start">
                <button
                    onClick={() => { setSubTab("activity"); setLogs([]); }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        subTab === "activity" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <UserCheck className="w-4 h-4" />
                    User Activity Logs
                </button>
                <button
                    onClick={() => { setSubTab("errors"); setLogs([]); }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        subTab === "errors" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <ShieldAlert className="w-4 h-4" />
                    Error Exceptions Log
                </button>
                <button
                    onClick={() => { setSubTab("emails"); setLogs([]); }}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        subTab === "emails" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                    <MailCheck className="w-4 h-4" />
                    Simulated Emails
                </button>
            </div>

            {loading && logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                </div>
            ) : (
                <div className="table-container">
                    {/* Activity Logs Table */}
                    {subTab === "activity" && (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Details</th>
                                    <th>Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log) => (
                                    <tr key={log.id}>
                                        <td className="font-mono text-slate-500">#{log.id}</td>
                                        <td className="font-bold text-white">{log.username}</td>
                                        <td>
                                            <span className="px-2.5 py-0.5 rounded-md bg-indigo-950/30 text-indigo-400 border border-indigo-900/50 font-bold text-[10px] uppercase">
                                                {log.activity_type}
                                            </span>
                                        </td>
                                        <td className="max-w-xs truncate">{log.details}</td>
                                        <td className="text-slate-500 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-slate-500">No activity logged.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}

                    {/* Error Logs Table */}
                    {subTab === "errors" && (
                        <div className="flex flex-col divide-y divide-slate-850/30">
                            {logs.map((err) => {
                                const isExpanded = expandedErrorId === err.id;
                                return (
                                    <div key={err.id} className="p-4 hover:bg-slate-900/20">
                                        <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedErrorId(isExpanded ? null : err.id)}>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-900/40 text-[10px] font-bold">
                                                        {err.endpoint || "SYSTEM"}
                                                    </span>
                                                    <span className="font-mono text-slate-500 text-xs">#{err.id}</span>
                                                </div>
                                                <div className="text-slate-200 font-semibold text-sm mt-1.5">{err.error_message}</div>
                                            </div>
                                            <button className="text-slate-500 hover:text-indigo-400 p-2 rounded-lg">
                                                <Eye className="w-4 h-4" />
                                            </button>
                                        </div>
                                        {isExpanded && (
                                            <div className="mt-3 bg-slate-950 p-4 rounded-xl border border-slate-850 overflow-x-auto text-[11px] font-mono text-rose-300 max-h-[300px]">
                                                <span className="block text-slate-400 font-bold mb-1">Stack Traceback:</span>
                                                <pre className="whitespace-pre">{err.stack_trace || "No trace available"}</pre>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {logs.length === 0 && (
                                <div className="text-center py-10 text-slate-500 text-sm">No exceptions caught.</div>
                            )}
                        </div>
                    )}

                    {/* Email Logs Table */}
                    {subTab === "emails" && (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>To</th>
                                    <th>Subject</th>
                                    <th>Verification Code</th>
                                    <th>Body Preview</th>
                                    <th>Sent At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((mail) => (
                                    <tr key={mail.id}>
                                        <td className="font-semibold text-slate-300">{mail.to_email}</td>
                                        <td className="font-medium">{mail.subject}</td>
                                        <td>
                                            <span className="font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400 font-bold text-xs">
                                                {mail.verification_code || "N/A"}
                                            </span>
                                        </td>
                                        <td className="max-w-xs truncate text-slate-400">{mail.body}</td>
                                        <td className="text-slate-500 text-xs">{new Date(mail.sent_at).toLocaleString()}</td>
                                    </tr>
                                ))}
                                {logs.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-slate-500">No verification emails dispatched.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
