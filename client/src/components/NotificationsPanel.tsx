import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCircle, Info, AlertTriangle, MessageCircle, X, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../lib/api";

const NotificationsPanel = ({ onClose }: { onClose: () => void }) => {
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/notifications');
            if (res.data.success) {
                setNotifications(res.data.data.notifications);
            }
        } catch (err) {
            console.error("Failed to fetch notifications:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const markAsRead = async (id: string) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
        } catch (err) {
            console.error("Failed to mark as read", err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.patch('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (err) {
            console.error("Failed to mark all as read", err);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'newMatch': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
            case 'bookingConfirmed': return <CheckCircle className="w-4 h-4 text-emerald" />;
            case 'bookingCancelled': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'bookingUpdated':
            case 'rideUpdated':
            case 'locationUpdate': return <Info className="w-4 h-4 text-primary" />;
            case 'chatMessage': return <MessageCircle className="w-4 h-4 text-blue-500" />;
            case 'paymentFailed': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'paymentSuccess': return <CheckCircle className="w-4 h-4 text-emerald" />;
            default: return <Bell className="w-4 h-4 text-muted-foreground" />;
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-14 right-0 w-80 md:w-96 bg-card border border-border shadow-2xl rounded-2xl overflow-hidden z-50 flex flex-col"
        >
            <div className="p-4 border-b border-border flex items-center justify-between bg-card">
                <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-foreground">Notifications</h3>
                    {unreadCount > 0 && (
                        <span className="bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                            {unreadCount} new
                        </span>
                    )}
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[400px] bg-muted/10 p-2 space-y-2 custom-scrollbar">
                {loading ? (
                    <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : notifications.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-sm">You're all caught up!</p>
                    </div>
                ) : (
                    notifications.map((notif: any) => (
                        <div
                            key={notif._id}
                            onClick={() => !notif.isRead && markAsRead(notif._id)}
                            className={`p-3 rounded-xl border flex gap-3 cursor-pointer transition-colors ${
                                notif.isRead ? 'bg-card border-border/50 opacity-70' : 'bg-primary/5 border-primary/20 hover:bg-primary/10'
                            }`}
                        >
                            <div className="shrink-0 mt-1">{getIcon(notif.type)}</div>
                            <div className="flex-1 min-w-0">
                                <h4 className={`text-sm ${notif.isRead ? 'font-medium' : 'font-bold'}`}>{notif.title}</h4>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{notif.body || notif.message}</p>
                                <span className="text-[10px] text-muted-foreground mt-2 block opacity-60 uppercase tracking-wider">
                                    {new Date(notif.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            {!notif.isRead && <div className="w-2 h-2 rounded-full bg-primary shrink-0 self-center" />}
                        </div>
                    ))
                )}
            </div>

            {unreadCount > 0 && (
                <div className="p-3 bg-card border-t border-border">
                    <Button variant="ghost" className="w-full text-xs font-bold" onClick={markAllAsRead}>
                        Mark all as read
                    </Button>
                </div>
            )}
        </motion.div>
    );
};

export default NotificationsPanel;
