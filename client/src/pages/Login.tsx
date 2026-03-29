import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Car, Eye, EyeOff, Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useLocation } from "react-router-dom";
import api from "../lib/api";

const Login = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const [errorMsg, setErrorMsg] = useState(queryParams.get('error') || "");
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem("carpconnect_user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user.role === 'driver') {
          navigate("/driver-dashboard");
        } else {
          navigate("/dashboard");
        }
      } catch (e) {
        // do nothing
      }
    }
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      // Hit the real Express auth endpoint
      const response = await api.post("/auth/login", { email, password });

      if (response.data.success) {
        // Save the JWT token returned by the backend
        localStorage.setItem("carpconnect_token", response.data.token);
        // Save user data to access name/avatar later
        const user = response.data.data.user;
        localStorage.setItem("carpconnect_user", JSON.stringify(user));

        if (user.role === 'driver') {
          navigate("/driver-dashboard");
        } else {
          navigate("/dashboard");
        }
      }
    } catch (err: any) {
      // Show error from backend
      setErrorMsg(err.response?.data?.message || "Failed to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/5 rounded-full blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="w-12 h-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow group-hover:scale-105 transition-transform">
              <Car className="w-6 h-6 text-white" />
            </div>
            <span className="font-display text-2xl font-bold text-primary-foreground">
              Carp<span className="text-gradient-primary">Connect</span>
            </span>
          </Link>
          <p className="text-primary-foreground/50 text-sm mt-3">Welcome back, rider 👋</p>
        </div>

        {/* Card */}
        <div className="glass-dark rounded-3xl p-8 border border-white/10 shadow-xl">
          <h1 className="text-2xl font-display font-bold text-primary-foreground mb-2">Sign In</h1>
          <p className="text-primary-foreground/50 text-sm mb-8">Enter your credentials to continue</p>

          {/* Error Message */}
          {errorMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 mb-6"
            >
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-xs text-red-400">{errorMsg}</span>
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  placeholder="you@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-12 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <div className="flex justify-end mt-2">
                <a href="#" className="text-xs text-primary hover:text-primary/80 transition-colors">Forgot password?</a>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-primary text-white py-6 rounded-xl text-sm font-semibold shadow-glow hover:opacity-90 transition-all disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Sign In <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-primary-foreground/40">
              Don't have an account?{" "}
              <Link to="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
                Create account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-primary-foreground/20 mt-6">
          Protected by industry-standard encryption
        </p>
      </motion.div>
    </div>
  );
};

export default Login;
