import React, { useState } from "react";
import axios from "axios";
import { User, Mail, Lock, ShieldAlert, ArrowRight, UserPlus } from "lucide-react";

const API_BASE = "http://localhost:8000/api/v1";

export default function AuthGate({ onAuthSuccess }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const handleSubmit = (e) => {
        e.preventDefault();
        setError("");
        setSuccessMessage("");
        setLoading(true);

        if (isLogin) {
            // Login Request
            axios.post(`${API_BASE}/auth/login`, { username, password })
                .then(res => {
                    setLoading(false);
                    const { access_token, user } = res.data;
                    localStorage.setItem("aatms_token", access_token);
                    localStorage.setItem("aatms_user", JSON.stringify(user));
                    onAuthSuccess(access_token, user);
                })
                .catch(err => {
                    setLoading(false);
                    setError(err.response?.data?.detail || "Login failed. Check credentials.");
                });
        } else {
            // Registration Request
            axios.post(`${API_BASE}/auth/register`, { email, username, password })
                .then(res => {
                    setLoading(false);
                    setSuccessMessage("Sign up completed! Verification code sent to email. Note: As this is a local developer environment, verification links are logged to PostgreSQL. You can verify links in the administration logs.");
                    setIsLogin(true);
                    // Clear fields
                    setEmail("");
                    setPassword("");
                })
                .catch(err => {
                    setLoading(false);
                    setError(err.response?.data?.detail || "Registration failed.");
                });
        }
    };

    return (
        <div className="flex items-center justify-center min-h-[80vh]">
            <div 
                className="glass-panel w-full max-w-md p-8 flex flex-col relative overflow-hidden"
                style={{ borderRadius: "28px" }}
            >
                {/* Visual Accent glow */}
                <div 
                    className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl"
                    style={{ pointerEvents: "none" }}
                ></div>
                <div 
                    className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-600/10 rounded-full blur-3xl"
                    style={{ pointerEvents: "none" }}
                ></div>

                <div className="text-center mb-8">
                    <h2 className="text-2xl font-extrabold tracking-tight text-white">
                        {isLogin ? "Sign In to AATMS" : "Create Developer Account"}
                    </h2>
                    <p className="text-slate-400 text-xs mt-2">
                        {isLogin 
                            ? "Access real-time object tracking and PostgreSQL configuration." 
                            : "Configure tracking bounds, regions, and view local reports."
                        }
                    </p>
                </div>

                {error && (
                    <div className="alert alert-danger flex items-start gap-2 mb-4">
                        <ShieldAlert className="w-5 h-5 shrink-0 text-rose-400" />
                        <span>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div className="alert alert-success bg-emerald-950/20 border border-emerald-800 text-emerald-300 p-4 rounded-xl text-xs mb-4">
                        {successMessage}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {!isLogin && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                            <div className="relative flex items-center">
                                <Mail className="absolute left-3 w-4 h-4 text-slate-500" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="e.g. dev@airshed.in"
                                    className="input-field"
                                    style={{ paddingLeft: "36px" }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</label>
                        <div className="relative flex items-center">
                            <User className="absolute left-3 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Username or Email"
                                className="input-field"
                                style={{ paddingLeft: "36px" }}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                        <div className="relative flex items-center">
                            <Lock className="absolute left-3 w-4 h-4 text-slate-500" />
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className="input-field"
                                style={{ paddingLeft: "36px" }}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn btn-primary py-3.5 mt-2 flex justify-center items-center gap-2"
                    >
                        {loading ? (
                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                        ) : isLogin ? (
                            <>
                                Sign In
                                <ArrowRight className="w-4 h-4" />
                            </>
                        ) : (
                            <>
                                Register Account
                                <UserPlus className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>

                <div className="text-center mt-6">
                    <button
                        onClick={() => {
                            setIsLogin(!isLogin);
                            setError("");
                            setSuccessMessage("");
                        }}
                        className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-all bg-transparent border-none cursor-pointer"
                    >
                        {isLogin 
                            ? "Don't have an account? Create one" 
                            : "Already registered? Sign in instead"
                        }
                    </button>
                </div>
            </div>
        </div>
    );
}
