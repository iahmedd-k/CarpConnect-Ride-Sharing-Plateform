import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Car, Eye, EyeOff, Mail, Lock, User, ArrowRight, Phone, AlertCircle, Calendar, Hash, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import api from "../lib/api";

const Signup = () => {
    const [showPassword, setShowPassword] = useState(false);
    const [step, setStep] = useState(1);

    // Form fields
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");

    // Vehicle fields (if driver)
    const [make, setMake] = useState("");
    const [model, setModel] = useState("");
    const [year, setYear] = useState("");
    const [plateNumber, setPlateNumber] = useState("");
    const [seats, setSeats] = useState("4");
    const [fuelType, setFuelType] = useState("petrol");

    const [role, setRole] = useState<"rider" | "driver" | "">("");
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
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
                // Ignore parsing errors
            }
        }
    }, [navigate]);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();

        if (step === 1) {
            // Basic validation for step 1
            if (!firstName || !lastName || !email || !password) {
                setErrorMsg("Please fill out all required fields.");
                return;
            }
            if (password.length < 8) {
                setErrorMsg("Password must be at least 8 characters long.");
                return;
            }
            setErrorMsg("");
            setStep(2);
            return;
        }

        if (step === 2 && role === "driver") {
            setStep(3); // Driver needs to enter vehicle info
            return;
        }

        if (step === 3 && role === "driver") {
            if (!make || !model || !year || !plateNumber) {
                setErrorMsg("Please fill out all vehicle fields.");
                return;
            }
        }

        setLoading(true);
        setErrorMsg("");

        try {
            const vehicleData = role === "driver" ? {
                make,
                model,
                year: parseInt(year),
                plateNumber,
                seats: parseInt(seats),
                fuelType
            } : undefined;

            const response = await api.post("/auth/signup", {
                name: `${firstName} ${lastName}`.trim(),
                email,
                phone,
                password,
                role,
                vehicle: vehicleData
            });

            if (response.data.success) {
                const user = response.data.data.user;
                localStorage.setItem("carpconnect_token", response.data.token);
                localStorage.setItem("carpconnect_user", JSON.stringify(user));

                if (user.role === 'driver') {
                    navigate("/driver-dashboard");
                } else {
                    navigate("/dashboard");
                }
            }
        } catch (err: any) {
            setErrorMsg(err.response?.data?.errors?.[0] || err.response?.data?.message || "Failed to create account.");
            setStep(1); // send them back to step 1 to fix errors
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-dark flex items-center justify-center p-4 relative overflow-hidden">
            <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-accent/10 rounded-full blur-[100px]" />

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
                    <p className="text-primary-foreground/50 text-sm mt-3">Join thousands of smart commuters</p>
                </div>

                {/* Progress */}
                <div className="flex items-center gap-2 mb-6">
                    {(role === "driver" ? [1, 2, 3] : [1, 2]).map((s) => (
                        <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-500 ${s <= step ? "bg-gradient-primary" : "bg-white/10"}`} />
                    ))}
                </div>
                <p className="text-xs text-primary-foreground/40 text-center mb-6">Step {step} of {role === "driver" ? 3 : 2}</p>

                <div className="glass-dark rounded-3xl p-8 border border-white/10 shadow-xl">
                    <h1 className="text-2xl font-display font-bold text-primary-foreground mb-2">
                        {step === 1 && "Create Account"}
                        {step === 2 && "Choose Your Role"}
                        {step === 3 && "Vehicle Details"}
                    </h1>
                    <p className="text-primary-foreground/50 text-sm mb-8">
                        {step === 1 && "Fill in your details to get started"}
                        {step === 2 && "How will you mainly use CarpConnect?"}
                        {step === 3 && "Tell riders about your car"}
                    </p>

                    <form onSubmit={handleSignup} className="space-y-5">
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
                        {step === 1 && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">First Name</label>
                                        <div className="relative">
                                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="Alex" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Last Name</label>
                                        <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="Smith" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="you@email.com" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Phone</label>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="+1 (555) 000-0000" />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Password</label>
                                    <div className="relative">
                                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                        <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-12 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="••••••••" />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-foreground/30 hover:text-primary-foreground/60 transition-colors">
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {step === 2 && (
                            <div className="grid grid-cols-2 gap-4">
                                {[
                                    { id: "rider", label: "I'm a Rider", desc: "Find rides to share on my daily commute", emoji: "🚀" },
                                    { id: "driver", label: "I'm a Driver", desc: "Offer seats in my car and share the cost", emoji: "🚗" },
                                ].map((r) => (
                                    <motion.button
                                        key={r.id}
                                        type="button"
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => setRole(r.id as "rider" | "driver")}
                                        className={`p-6 rounded-2xl border-2 text-left transition-all duration-300 ${role === r.id
                                            ? "border-primary bg-primary/10"
                                            : "border-white/10 bg-white/5 hover:border-white/20"
                                            }`}
                                    >
                                        <div className="text-2xl mb-3">{r.emoji}</div>
                                        <div className="text-sm font-bold text-primary-foreground mb-1">{r.label}</div>
                                        <div className="text-xs text-primary-foreground/50 leading-relaxed">{r.desc}</div>
                                    </motion.button>
                                ))}
                            </div>
                        )}

                        {step === 3 && role === "driver" && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Make</label>
                                        <div className="relative">
                                            <Car className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                            <input type="text" value={make} onChange={(e) => setMake(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="Toyota" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Model</label>
                                        <input type="text" value={model} onChange={(e) => setModel(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="Camry" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Year</label>
                                        <div className="relative">
                                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="2020" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Plate Number</label>
                                        <div className="relative">
                                            <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-foreground/30" />
                                            <input type="text" value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} required className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-sm text-primary-foreground placeholder:text-primary-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all" placeholder="ABC-1234" />
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Fuel Type</label>
                                        <select value={fuelType} onChange={(e) => setFuelType(e.target.value)} className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-3.5 text-sm text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer">
                                            <option value="petrol">Petrol / Gas</option>
                                            <option value="diesel">Diesel</option>
                                            <option value="hybrid">Hybrid</option>
                                            <option value="electric">Electric (EV)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-primary-foreground/60 uppercase tracking-wider mb-2">Available Seats</label>
                                        <select value={seats} onChange={(e) => setSeats(e.target.value)} className="w-full bg-[#1a1c23] border border-white/10 rounded-xl px-4 py-3.5 text-sm text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all appearance-none cursor-pointer">
                                            <option value="2">2 Seats</option>
                                            <option value="3">3 Seats</option>
                                            <option value="4">4 Seats</option>
                                            <option value="5">5 Seats</option>
                                            <option value="6">6 Seats</option>
                                            <option value="7">7 Seats (Minivan)</option>
                                        </select>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        <Button
                            type="submit"
                            disabled={loading || (step === 2 && !role)}
                            className="w-full bg-gradient-primary text-white py-6 rounded-xl text-sm font-semibold shadow-glow hover:opacity-90 transition-all disabled:opacity-50 mt-4"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Creating account...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    {(step === 1 || (step === 2 && role === "driver")) ? "Continue" : "Get Started"} <ArrowRight className="w-4 h-4" />
                                </span>
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 text-center">
                        <p className="text-xs text-primary-foreground/40">
                            Already have an account?{" "}
                            <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                                Sign In
                            </Link>
                        </p>
                    </div>
                </div>

                <p className="text-center text-xs text-primary-foreground/20 mt-6">
                    By signing up, you agree to our Terms & Privacy Policy
                </p>
            </motion.div>
        </div>
    );
};

export default Signup;
