import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { User, Smartphone, Lock, CheckCircle, Loader2, Camera, Car, Music, Cigarette, Dog, Bell, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import api from "../../lib/api";

const AccountSettings = () => {
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);

    // Form states
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [vehicle, setVehicle] = useState({
        make: "", model: "", year: "", plateNumber: "", seats: 4, fuelType: "Petrol"
    });
    const [preferences, setPreferences] = useState({
        music: "any", smoking: false, pets: false,
        notifications: { email: true, push: true, sms: false }
    });
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

    // Password State
    const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" });
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [passwordError, setPasswordError] = useState("");

    useEffect(() => {
        const storedUser = localStorage.getItem("carpconnect_user");
        if (storedUser) {
            const parsed = JSON.parse(storedUser);
            setUser(parsed);
            setName(parsed.name || "");
            setPhone(parsed.phone || "");
            if (parsed.vehicle) setVehicle(parsed.vehicle);
            if (parsed.preferences) setPreferences({ ...preferences, ...parsed.preferences });
            setTwoFactorEnabled(parsed.twoFactorEnabled || false);
        }
        setLoading(false);
    }, []);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccess(false);
        try {
            const reqBody: any = { name, phone, preferences, twoFactorEnabled };
            if (user?.role === 'driver' || user?.role === 'both') {
                reqBody.vehicle = vehicle;
            }

            const response = await api.patch("/auth/profile", reqBody);
            if (response.data.success) {
                const updatedUser = response.data.data.user;
                localStorage.setItem("carpconnect_user", JSON.stringify(updatedUser));
                setUser(updatedUser);
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
            }
        } catch (err) {
            console.error("Failed to update profile:", err);
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.new !== passwordData.confirm) {
            setPasswordError("Passwords do not match.");
            return;
        }
        if (passwordData.new.length < 8) {
            setPasswordError("Password must be at least 8 characters.");
            return;
        }

        setPasswordSaving(true);
        setPasswordError("");
        setPasswordSuccess(false);

        try {
            const res = await api.patch("/auth/change-password", {
                currentPassword: passwordData.current,
                newPassword: passwordData.new
            });

            if (res.data.success) {
                localStorage.setItem("carpconnect_token", res.data.token);
                setPasswordSuccess(true);
                setPasswordData({ current: "", new: "", confirm: "" });
                setTimeout(() => setPasswordSuccess(false), 3000);
            }
        } catch (err: any) {
            setPasswordError(err.response?.data?.message || "Failed to change password");
        } finally {
            setPasswordSaving(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-primary animate-spin" /></div>;
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-20">
            {/* Header */}
            <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
                <div className="flex flex-col md:flex-row gap-8 items-start relative z-10">
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-3xl bg-gradient-primary flex items-center justify-center text-white text-4xl font-bold shadow-glow overflow-hidden">
                            {user?.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user?.name?.[0]?.toUpperCase() || "C"}
                        </div>
                        <button className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-card border border-border shadow-lg flex items-center justify-center text-primary hover:text-primary/80 transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100">
                            <Camera className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="flex-1 space-y-1">
                        <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground break-words">{user?.name}</h2>
                        <p className="text-muted-foreground">{user?.email}</p>
                        <div className="flex gap-2 mt-4 flex-wrap">
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">{user?.role}</span>
                            <span className="px-3 py-1 rounded-full bg-emerald/10 text-emerald text-xs font-bold uppercase tracking-wider">Verified</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5 sm:gap-8">
                {/* Profile Form */}
                <form onSubmit={handleSaveProfile} className="space-y-8">
                    {/* Personal Information */}
                    <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <User className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-display font-bold">Personal Info</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Full Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-12 bg-muted/30 border border-border rounded-xl pl-12 pr-4 text-sm focus:border-primary outline-none transition-all" placeholder="Your Name" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone Number</label>
                                <div className="relative">
                                    <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full h-12 bg-muted/30 border border-border rounded-xl pl-12 pr-4 text-sm focus:border-primary outline-none transition-all" placeholder="+92 3XX XXXXXXX" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Ride Preferences */}
                    <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Music className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-display font-bold">Preferences</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Music Preference</label>
                                <select value={preferences.music} onChange={(e) => setPreferences({ ...preferences, music: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all">
                                    <option value="any">Any Music</option>
                                    <option value="quiet">Quiet Ride</option>
                                    <option value="pop">Pop</option>
                                    <option value="rock">Rock</option>
                                    <option value="podcast">Podcast</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Cigarette className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-semibold text-foreground">Smoking Allowed</span>
                                </div>
                                <Switch checked={preferences.smoking} onCheckedChange={(c) => setPreferences({ ...preferences, smoking: c })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Dog className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm font-semibold text-foreground">Pets Allowed</span>
                                </div>
                                <Switch checked={preferences.pets} onCheckedChange={(c) => setPreferences({ ...preferences, pets: c })} />
                            </div>
                        </div>
                    </div>

                    {/* Vehicle Details for Drivers */}
                    {(user?.role === 'driver' || user?.role === 'both') && (
                        <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 space-y-6">
                            <div className="flex items-center gap-3 mb-2">
                                <Car className="w-5 h-5 text-primary" />
                                <h3 className="text-xl font-display font-bold">Vehicle Details</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-2"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Make</label><input value={vehicle.make} onChange={(e) => setVehicle({ ...vehicle, make: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" /></div>
                                <div className="space-y-2"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Model</label><input value={vehicle.model} onChange={(e) => setVehicle({ ...vehicle, model: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" /></div>
                                <div className="space-y-2"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Plate #</label><input value={vehicle.plateNumber} onChange={(e) => setVehicle({ ...vehicle, plateNumber: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" /></div>
                                <div className="space-y-2"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Year</label><input type="number" value={vehicle.year} onChange={(e) => setVehicle({ ...vehicle, year: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" placeholder="2022" /></div>
                                <div className="space-y-2"><label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Seats</label><input type="number" value={vehicle.seats} onChange={(e) => setVehicle({ ...vehicle, seats: parseInt(e.target.value) })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" /></div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Fuel Type</label>
                                    <select value={vehicle.fuelType} onChange={(e) => setVehicle({ ...vehicle, fuelType: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all">
                                        <option value="petrol">Petrol</option>
                                        <option value="diesel">Diesel</option>
                                        <option value="electric">Electric</option>
                                        <option value="hybrid">Hybrid</option>
                                        <option value="cng">CNG</option>
                                    </select>
                                </div>
                            </div>

                        </div>
                    )}

                    <div className="flex flex-col gap-4">
                        <Button type="submit" disabled={saving} className="bg-gradient-primary text-white h-14 rounded-2xl font-bold shadow-glow text-lg">
                            {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : "Save Profile & Preferences"}
                        </Button>
                        {success && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald/10 border border-emerald/30 text-emerald p-4 rounded-2xl flex items-center gap-3 font-medium"><CheckCircle className="w-5 h-5" /> Profile updated successfully!</motion.div>}
                    </div>
                </form>

                {/* Security Form */}
                <div className="space-y-8">
                    {/* Security & Password */}
                    <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Lock className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-display font-bold">Security</h3>
                        </div>

                        {/* 2FA Toggle */}
                        <div className="p-4 rounded-2xl bg-muted/20 border border-border flex items-center justify-between gap-3 flex-wrap mb-6">
                            <div className="flex gap-3 items-center">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col justify-center items-center text-primary"><ShieldCheck className="w-5 h-5" /></div>
                                <div>
                                    <div className="text-sm font-bold">Two-Factor Auth</div>
                                    <div className="text-xs text-muted-foreground">Add extra security to your account.</div>
                                </div>
                            </div>
                            <Switch checked={twoFactorEnabled} onCheckedChange={(c) => { setTwoFactorEnabled(c); setSuccess(false); }} />
                        </div>

                        {/* Change Password */}
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <h4 className="text-sm font-bold text-foreground">Change Password</h4>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Current Password</label>
                                <input type="password" value={passwordData.current} onChange={(e) => setPasswordData({ ...passwordData, current: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">New Password</label>
                                <input type="password" value={passwordData.new} onChange={(e) => setPasswordData({ ...passwordData, new: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" required />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Confirm New Password</label>
                                <input type="password" value={passwordData.confirm} onChange={(e) => setPasswordData({ ...passwordData, confirm: e.target.value })} className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm focus:border-primary outline-none transition-all" required />
                            </div>

                            {passwordError && <div className="text-red-500 text-sm font-medium">{passwordError}</div>}
                            {passwordSuccess && <div className="text-emerald text-sm font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Password changed!</div>}
                            
                            <Button disabled={passwordSaving} className="w-full bg-card hover:bg-muted text-foreground border border-border h-12 mt-2">
                                {passwordSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : "Update Password"}
                            </Button>
                        </form>
                    </div>

                    {/* Notifications Panel */}
                    <div className="bg-card rounded-3xl p-5 sm:p-8 border border-border/50 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Bell className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-display font-bold">Notifications</h3>
                        </div>
                        <div className="space-y-4">
                            {[
                                { id: "email", label: "Email Notifications", desc: "Get updates via email" },
                                { id: "push", label: "Push Notifications", desc: "Real-time updates on your device" },
                                { id: "sms", label: "SMS Alerts", desc: "Important updates via SMS" }
                            ].map((push) => (
                                <div key={push.id} className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-semibold">{push.label}</div>
                                        <div className="text-xs text-muted-foreground">{push.desc}</div>
                                    </div>
                                    <Switch checked={(preferences.notifications as any)[push.id]} onCheckedChange={(c) => setPreferences({ ...preferences, notifications: { ...preferences.notifications, [push.id]: c } })} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountSettings;
