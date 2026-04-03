import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Car, Check, CheckCheck, Loader2, Megaphone, Send, Trash2, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChat } from "@/hooks/useChat";

type ChatScreenProps = {
  rideId?: string | null;
  me?: any;
  title: string;
  subtitle?: string;
  participantsLabel?: string;
  compact?: boolean;
};

const formatTime = (value: any) =>
  value
    ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

export default function ChatScreen({
  rideId,
  me,
  title,
  subtitle,
  participantsLabel,
  compact = false,
}: ChatScreenProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, participants, isLocked, loading, sending, sendMessage, deleteMessage } = useChat(rideId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const riderCount = useMemo(
    () => participants.filter((item) => item?.role !== "driver").length,
    [participants]
  );

  const handleSend = async () => {
    const ok = await sendMessage(text);
    if (ok) setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border bg-card px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-foreground">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div> : null}
          </div>
          <div className="rounded-full border border-border bg-muted/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {participantsLabel || `${participants.length || 0} participants`}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Users className="h-3 w-3" />
            {participants.length ? `${participants.length} in ride chat` : "Ride chat"}
          </div>
          {riderCount > 0 ? (
            <div className="rounded-full border border-border bg-muted/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {riderCount} rider{riderCount === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>
      </div>

      {isLocked ? (
        <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-sm font-medium text-emerald-600">
          Ride completed — chat is now read only.
        </div>
      ) : null}

      <div className={`flex-1 overflow-y-auto bg-muted/5 px-5 py-4 ${compact ? "space-y-3" : "space-y-4"}`}>
        {loading ? (
          <div className="flex justify-center pt-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
          </div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 pt-10 text-center text-sm text-muted-foreground">
            <AlertCircle className="h-6 w-6 text-muted-foreground/50" />
            No messages yet. This group chat will update live for the driver and riders.
          </div>
        ) : null}

        {messages.map((message) => {
          const senderId = String(message?.sender?._id || "");
          const isSystem = message?.type === "system" || senderId === "system";
          const isMe = !isSystem && senderId && String(me?._id || "") === senderId;
          const isDriver = !isSystem && String(message?.sender?.role || "") === "driver";

          if (isSystem) {
            return (
              <div key={message._id} className="flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-700">
                  <Megaphone className="h-3.5 w-3.5" />
                  {message.content}
                </div>
              </div>
            );
          }

          return (
            <div key={message._id} className={`group flex ${isMe ? "justify-end" : "justify-start"}`}>
              <div className="flex max-w-[85%] items-end gap-2">
                {isMe ? (
                  <button
                    type="button"
                    onClick={() => deleteMessage(message._id)}
                    className="opacity-0 transition-all group-hover:opacity-100 rounded-full p-1.5 text-red-500 hover:bg-red-500/10"
                    title="Delete message"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                ) : null}
                <div
                  className={[
                    "rounded-2xl px-4 py-3 text-sm shadow-sm",
                    isMe
                      ? "bg-primary text-white"
                      : isDriver
                        ? "border border-blue-500/20 bg-blue-500/10 text-foreground"
                        : "border border-border bg-card text-foreground",
                  ].join(" ")}
                >
                  <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${isMe ? "text-white/80" : isDriver ? "text-blue-600" : "text-muted-foreground"}`}>
                    {isDriver ? <Car className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {isDriver ? "Driver" : "Rider"} • {message?.sender?.name || "User"}
                  </div>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <div className={`mt-2 flex items-center justify-end gap-1 text-[10px] ${isMe ? "text-white/80" : "text-muted-foreground"}`}>
                    {formatTime(message.createdAt)}
                    {isMe ? (
                      message.status === "read" ? <CheckCheck className="h-3 w-3" /> :
                      message.status === "delivered" ? <CheckCheck className="h-3 w-3" /> :
                      <Check className="h-3 w-3" />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder={isLocked ? "Chat is locked for completed rides" : "Message everyone in this ride"}
            disabled={!rideId || isLocked || sending}
            className="flex-1 rounded-xl border border-border bg-muted px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/60 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={!rideId || isLocked || sending || !text.trim()}
            className="h-12 w-12 rounded-xl p-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
