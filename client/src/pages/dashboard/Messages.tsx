import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, Search, MoreVertical, Check, CheckCheck, Loader2, Trash2, X, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "../../lib/api";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";


const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';

const dedupeById = (items: any[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = String(item?._id || "");
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const Messages = () => {
    const [conversations, setConversations] = useState<any[]>([]);
    const [activeChat, setActiveChat] = useState<any>(null);
    const [newMsg, setNewMsg] = useState("");
    const [msgs, setMsgs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [msgLoading, setMsgLoading] = useState(false);
    const [me, setMe] = useState<any>(null);
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('carpconnect_user') || '{}');
        setMe(user);
        fetchConversations();
        
        // Initialize Socket
        const token = localStorage.getItem('carpconnect_token');
        if (token) {
            socketRef.current = io(SOCKET_URL, {
                auth: { token },
                transports: ["websocket"],
            });
            
            socketRef.current.on('connect', () => {
                console.log("Socket connected:", socketRef.current?.id);
            });
        }

        return () => {
            socketRef.current?.disconnect();
        };
    }, []);

    useEffect(() => {
        if (activeChat && socketRef.current) {
            fetchMessages(activeChat._id);
            socketRef.current.emit("join:chat", { bookingId: activeChat._id });

            const handleNewMessage = (msg: any) => {
                setMsgs(prev => {
                    const formattedMsg = {
                        _id: msg._id || Date.now().toString(),
                        content: msg.content,
                        createdAt: msg.timestamp || msg.createdAt || new Date().toISOString(),
                        sender: msg.sender || { _id: msg.senderId },
                        status: msg.status || "delivered",
                    };
                    return dedupeById([...prev, formattedMsg]);
                });
            };

            socketRef.current.on("chat:message", handleNewMessage);

            return () => {
                socketRef.current?.off("chat:message", handleNewMessage);
                socketRef.current?.emit("leave:chat", { bookingId: activeChat._id });
            };
        }
    }, [activeChat]);

    const fetchConversations = async () => {
        try {
            // Bookings act as conversations
            const user = JSON.parse(localStorage.getItem('carpconnect_user') || '{}');
            const role = user?.role === "driver" ? "driver" : user?.role === "rider" ? "rider" : "";
            const res = await api.get(role ? `/bookings?role=${role}` : "/bookings");
            const bookings = dedupeById(res.data?.data?.bookings || []);
            setConversations(bookings);
            if (bookings.length > 0 && !activeChat) {
                setActiveChat(bookings[0]);
            }
        } catch (err) {
            console.error("Failed to fetch conversations:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMessages = async (bookingId: string, silent = false) => {
        if (!silent) setMsgLoading(true);
        try {
            const res = await api.get(`/chat/${bookingId}`);
            setMsgs(dedupeById(res.data?.data?.messages || []));
        } catch (err) {
            console.error("Failed to fetch messages:", err);
        } finally {
            if (!silent) setMsgLoading(false);
        }
    };

    const sendMessage = async () => {
        if (!newMsg.trim() || !activeChat) return;
        const text = newMsg;
        setNewMsg("");

        try {
            const res = await api.post("/chat", {
                bookingId: activeChat._id,
                content: text
            });
            if (res.data?.data?.message) {
                setMsgs(prev => dedupeById([...prev, res.data.data.message]));
            } else {
                fetchMessages(activeChat._id, true);
            }
        } catch (err) {
            toast.error("Failed to send message.");
        }
    };

    const deleteMessage = async (msgId: string) => {
        try {
            const res = await api.delete(`/chat/${msgId}`);
            if (res.data.success) {
                setMsgs(prev => prev.filter(m => m._id !== msgId));
            }
        } catch (err) {
            console.error("Failed to delete message:", err);
        }
    };

    // ── ALL hooks must be declared before any early return ──
    const bottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [msgs]);

    const getPartner = (convo: any) => {
        if (!convo || !me) return null;
        const driverId = convo.driver?._id || convo.driver;
        const myId = me._id;
        if (!driverId || !myId) return convo.driver || convo.rider || null;
        return driverId.toString() === myId.toString() ? convo.rider : convo.driver;
    };

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;


    return (
        <div className="space-y-4">
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden" style={{ height: "calc(100vh - 170px)", minHeight: "420px" }}>
                <div className="flex h-full flex-col md:flex-row">
                    {/* Sidebar */}
                    <div className={`w-full md:w-72 border-r border-border flex flex-col shrink-0 ${activeChat ? "hidden md:flex" : "flex"}`}>
                        <div className="p-4 border-b border-border font-bold text-lg">Chats</div>
                        <div className="flex-1 overflow-y-auto">
                            {conversations.length > 0 ? conversations.map((convo) => {
                                const partner = getPartner(convo);
                                return (
                                    <button
                                        key={convo._id}
                                        onClick={() => setActiveChat(convo)}
                                        className={`w-full flex items-start gap-3 p-4 text-left hover:bg-muted/50 transition-colors border-b border-border/50 ${activeChat?._id === convo._id ? "bg-primary/5 border-primary/10" : ""}`}
                                    >
                                        <div className="shrink-0 w-11 h-11 rounded-full bg-gradient-primary flex items-center justify-center text-white text-sm font-bold">
                                            {partner?.avatar ? <img src={partner.avatar} className="w-full h-full object-cover rounded-full" /> : partner?.name?.[0]}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold truncate">{partner?.name}</div>
                                            <div className="text-[10px] text-primary font-medium">{convo.offer?.origin?.address?.split(',')[0] || 'CarpConnect'} ride</div>
                                        </div>
                                    </button>
                                );
                            }) : (
                                <div className="p-10 text-center text-muted-foreground text-sm">No conversations found.</div>
                            )}
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className={`${activeChat ? "flex" : "hidden md:flex"} flex-1 flex-col`}>
                        {activeChat ? (
                            <>
                                <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-border">
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setActiveChat(null)}
                                            className="md:hidden w-8 h-8 rounded-lg border border-border flex items-center justify-center"
                                        >
                                            <ArrowLeft className="w-4 h-4" />
                                        </button>
                                        <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white text-sm font-bold">
                                            {getPartner(activeChat)?.avatar ? <img src={getPartner(activeChat).avatar} className="w-full h-full object-cover rounded-full" /> : getPartner(activeChat)?.name?.[0]}
                                        </div>
                                        <div>
                                            <div className="font-semibold text-sm">{getPartner(activeChat).name}</div>
                                            <div className="text-xs text-muted-foreground">Ride Booking #{activeChat._id.slice(-6)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 bg-muted/5">
                                    {msgs.map((msg, i) => (
                                        <div key={msg._id} className={`flex ${msg.sender?._id === me?._id ? "justify-end" : "justify-start"} group`}>
                                            <div className="flex items-center gap-2">
                                                {msg.sender?._id === me?._id && (
                                                    <button onClick={() => deleteMessage(msg._id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 rounded-full transition-all" title="Delete message">
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${msg.sender?._id === me?._id ? "bg-primary text-white" : "bg-card border border-border text-foreground"}`}>
                                                    {msg.content}
                                                    <div className="text-[9px] mt-1 opacity-70 flex items-center justify-end gap-1">
                                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        {msg.sender?._id === me?._id && (
                                                            msg.status === 'seen' ? <CheckCheck size={12} className="text-blue-300" /> :
                                                            msg.status === 'delivered' ? <CheckCheck size={12} /> :
                                                            <Check size={12} />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {msgLoading && msgs.length === 0 && <div className="text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" /></div>}
                                    <div ref={bottomRef} />
                                </div>

                                <div className="px-4 md:px-6 py-4 border-t border-border bg-card">
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="text"
                                            placeholder="Type a message..."
                                            value={newMsg}
                                            onChange={(e) => setNewMsg(e.target.value)}
                                            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                                            className="flex-1 bg-muted rounded-xl px-4 py-3 text-sm outline-none"
                                        />
                                        <Button onClick={sendMessage} className="h-12 w-12 p-0 bg-primary text-white rounded-xl shadow-glow">
                                            <Send size={18} />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-30">
                                <MessageSquare size={64} className="mb-4" />
                                <p>Select a chat to start messaging</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Messages;
