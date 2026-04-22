"use client";

import { useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import { createAblyRealtime } from "@/lib/ably/client";

type Msg = { id: string; authorId: string; body: string; ts: number; username: string };
type Props = {
  conversationId: string;
  kind: "dm" | "group";
  selfId: string;
  selfUsername: string;
  initial: Msg[];
};

export function MessageThread({ conversationId, kind, selfId, selfUsername, initial }: Props) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const client = createAblyRealtime(selfId);
    const channelName = `${kind}:${conversationId}`;
    const channel = client.channels.get(channelName);
    channelRef.current = channel;

    channel.subscribe("message", (msg) => {
      const data = msg.data as { body: string; username: string; authorId: string; dbId?: string };
      setMessages((m) => {
        if (data.dbId && m.some((x) => x.id === data.dbId)) return m;
        return [
          ...m.slice(-199),
          {
            id: data.dbId ?? msg.id ?? String(msg.timestamp),
            authorId: data.authorId,
            body: data.body,
            ts: msg.timestamp ?? Date.now(),
            username: data.username,
          },
        ];
      });
    });

    return () => {
      channel.detach();
      client.close();
    };
  }, [conversationId, kind, selfId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const body = draft.trim().slice(0, 2000);
    setSending(true);
    setError(null);
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Failed to send" }));
      setError(j.error ?? "Failed to send");
      return;
    }
    setDraft("");
  }

  return (
    <>
      <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {messages.map((m) => {
          const mine = m.authorId === selfId;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[75%] rounded-xl px-3 py-2 ${mine ? "bg-accent text-accent-fg" : "bg-bg-elevated"}`}>
                {!mine && kind === "group" && (
                  <div className="mb-0.5 text-[10px] font-medium opacity-70">@{m.username}</div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
              </div>
            </li>
          );
        })}
        <div ref={endRef} />
      </ol>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message as @${selfUsername}`}
          maxLength={2000}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          Send
        </button>
      </form>
      {error && <p className="px-3 pb-2 text-xs text-red-400">{error}</p>}
    </>
  );
}
