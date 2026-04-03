import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import api from "@/lib/api";
import { toast } from "sonner";

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

const dedupeById = (items: any[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item?._id || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function useChat(rideId?: string | null) {
  const [messages, setMessages] = useState<any[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!rideId) {
      setMessages([]);
      setParticipants([]);
      setIsLocked(false);
      return;
    }

    let active = true;
    const token = localStorage.getItem("carpconnect_token");
    setLoading(true);

    const load = async () => {
      try {
        const res = await api.get(`/chat/${rideId}`);
        if (!active) return;
        setMessages(dedupeById(res.data?.data?.messages || []));
        setParticipants(res.data?.data?.room?.participants || []);
        setIsLocked(Boolean(res.data?.data?.room?.isLocked));
        await api.post(`/chat/${rideId}/read`).catch(() => {});
      } catch (error: any) {
        if (active) {
          const message = error?.response?.data?.message || "Failed to load chat history.";
          toast.error(message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    if (!token) {
      return () => {
        active = false;
      };
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join:chat", { rideId }, (response: any) => {
        if (!response?.ok) {
          toast.error(response?.message || "Unable to join ride chat.");
        } else {
          setIsLocked(Boolean(response?.isLocked));
        }
      });
    });

    socket.on("chat:message", (message: any) => {
      setMessages((prev) => dedupeById([...prev, message]));
    });

    socket.on("chat:deleted", ({ messageId }: any) => {
      setMessages((prev) => prev.filter((item) => item?._id !== messageId));
    });

    socket.on("ride_ended", () => {
      setIsLocked(true);
      setMessages((prev) =>
        dedupeById([
          ...prev,
          {
            _id: `ride-ended-${rideId}`,
            type: "system",
            content: "Ride completed — chat is now read only.",
            createdAt: new Date().toISOString(),
            sender: { _id: "system", name: "System", role: "system" },
          },
        ])
      );
    });

    socket.on("chat:error", (payload: any) => {
      if (payload?.message) toast.error(payload.message);
    });

    return () => {
      active = false;
      socket.emit("leave:chat", { rideId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [rideId]);

  const sendMessage = async (content: string) => {
    const value = String(content || "").trim();
    if (!rideId || !value || isLocked) return false;

    setSending(true);
    try {
      const res = await api.post("/chat", { rideId, content: value });
      const message = res.data?.data?.message;
      if (message) {
        setMessages((prev) => dedupeById([...prev, message]));
      }
      setIsLocked(Boolean(res.data?.data?.room?.isLocked));
      return true;
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to send message.");
      return false;
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!messageId) return;
    try {
      await api.delete(`/chat/${messageId}`);
      setMessages((prev) => prev.filter((item) => item?._id !== messageId));
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete message.");
    }
  };

  return useMemo(
    () => ({
      messages,
      participants,
      isLocked,
      loading,
      sending,
      sendMessage,
      deleteMessage,
    }),
    [messages, participants, isLocked, loading, sending]
  );
}
