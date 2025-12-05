import React, { useState } from 'react';
import { Lock, ArrowRight, Activity } from 'lucide-react';

const Login = ({ onLogin }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (password) {
            localStorage.setItem('access_token', password);
            onLogin(password);
        } else {
            setError('请输入密码');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-cyan-400/10 blur-3xl"></div>
                <div className="absolute top-[40%] -right-[10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-3xl"></div>
            </div>

            <div className="bg-white/80 backdrop-blur-xl p-10 rounded-3xl shadow-2xl border border-white/50 w-full max-w-md relative z-10">
                <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-cyan-500/30 mb-6 transform rotate-3">
                        <Activity size={32} strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Token Monitor</h1>
                    <p className="text-slate-500 mt-2 font-medium">请输入访问密码以继续</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700 ml-1">访问密码</label>
                        <div className="relative group">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-cyan-500 transition-colors">
                                <Lock size={20} />
                            </div>
                            <input
                                type="password"
                                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3.5 pl-12 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 outline-none transition-all font-medium text-slate-800 placeholder:text-slate-400"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="输入您的密码"
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white py-3.5 rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all duration-200 font-bold text-lg flex items-center justify-center gap-2 group active:scale-[0.98]"
                    >
                        进入系统
                        <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-xs text-slate-400 font-medium">
                        &copy; {new Date().getFullYear()} Token Monitor System
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
