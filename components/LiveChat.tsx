"use client";

import { useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import { timeAgo } from "@/lib/format";

type ChatMessage = {
  id: string;
  clientId: string;
  username: string;
  body: string;
  ts: number;
};

type Props = {
  streamId: string;
  signedIn: boolean;
  username: string | null;
};

export function LiveChat({ streamId, signedIn, username }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [present, setPresent] = useState(0);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!signedIn) return;
    const client = new Ably.Realtime({
      authUrl: "/api/ably/token",
      authMethod: "POST",
      echoMessages: true,
    });
    const channel = client.channels.get(`stream:${streamId}`);
    channelRef.current = channel;

    channel
      .subscribe("message", (msg) => {
        const data = msg.data as { body: string; username: string };
        setMessages((m) => [
          ...m.slice(-199),
          {
            id: msg.id ?? String(msg.timestamp),
            clientId: msg.clientId ?? "",
            username: data.username,
            body: data.body,
            ts: msg.timestamp ?? Date.now(),
          },
        ]);
      })
      .then(() => setReady(true));

    channel.presence.subscribe(() => {
      channel.presence.get().then((members) => setPresent(members.length));
    });
    channel.presence.enter({ username }).catch(() => {});

    return () => {
      channel.presence.leave().catch(() => {});
      channel.detach();
      client.close();
    };
  }, [streamId, signedIn, username]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !channelRef.current || !username) return;
    const body = draft.trim().slice(0, 500);
    await channelRef.current.publish("message", { body, username });
    setDraft("");
  }

  if (!signedIn) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-fg-muted">
        Log in to chat.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border px-4 py-1.5 text-xs text-fg-muted">
        {present} watching {!ready && "· connecting…"}
      </div>
      <ol className="flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm">
        {messages.map((m) => (
          <li key={m.id} className="leading-snug">
            <span className="mr-1 font-medium">{m.username}</span>
            <span>{m.body}</span>
            <span className="ml-2 text-[10px] text-fg-muted">{timeAgo(new Date(m.ts).toISOString())}</span>
          </li>
        ))}
        <div ref={endRef} />
      </ol>
      <form onSubmit={send} className="flex gap-2 border-t border-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something…"
          maxLength={500}
          className="flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  );
}
