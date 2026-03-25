"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Loader2,
  Plus,
  MessageSquare,
  ArrowLeft,
  Trash2,
  Menu,
  X,
} from "lucide-react";
import { useTelegramBackButton } from "@/lib/hooks/use-telegram";
import { apiFetch } from "@/lib/api";

interface Session {
  key: string;
  label?: string;
  lastMessage?: { role: string; content: string; timestamp: number };
  updatedAt?: number;
}

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}


export default function ChatPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();

  useTelegramBackButton(() => router.push(`/app/agents/${agentId}`));

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiFetch(`/agents/${agentId}/sessions`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingSessions(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load chat history when session changes
  useEffect(() => {
    if (!activeSession) {
      setMessages([]);
      return;
    }
    setLoadingHistory(true);
    apiFetch(`/agents/${agentId}/sessions/${encodeURIComponent(activeSession)}/history`)
      .then((r) => r.json())
      .then((data) => {
        const msgs: ChatMessage[] = (data.messages || []).map(
          (m: { role: string; content: string | Array<{ text?: string }> }) => ({
            role: m.role,
            content:
              typeof m.content === "string"
                ? m.content
                : m.content
                    ?.map((c) => c.text || "")
                    .join("") || "",
          }),
        );
        setMessages(msgs);
      })
      .catch(() => setMessages([]))
      .finally(() => setLoadingHistory(false));
  }, [activeSession, agentId]);

  // Create new session
  const createNewSession = async () => {
    try {
      const res = await apiFetch(`/agents/${agentId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveSession(data.key);
        setMessages([]);
        setSidebarOpen(false);
        await fetchSessions();
      }
    } catch {
      // ignore
    }
  };

  // Delete session
  const deleteSessionHandler = async (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiFetch(`/agents/${agentId}/sessions/${encodeURIComponent(key)}`, {
        method: "DELETE",
      });
      if (activeSession === key) {
        setActiveSession(null);
        setMessages([]);
      }
      await fetchSessions();
    } catch {
      // ignore
    }
  };

  // Send message with SSE streaming
  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);

    // Create session if none active
    let sessionKey = activeSession;
    if (!sessionKey) {
      try {
        const res = await apiFetch(`/agents/${agentId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          sessionKey = data.key;
          setActiveSession(data.key);
        }
      } catch {
        setSending(false);
        return;
      }
    }

    // Add placeholder assistant message
    const assistantIdx = updatedMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await apiFetch(`/agents/${agentId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey,
          messages: [{ role: "user", content: text }],
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) => {
          const next = [...prev];
          next[assistantIdx] = {
            role: "assistant",
            content: `Error: ${err.error || res.statusText}`,
          };
          return next;
        });
        setSending(false);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                const current = accumulated;
                setMessages((prev) => {
                  const next = [...prev];
                  next[assistantIdx] = { role: "assistant", content: current };
                  return next;
                });
              }
            } catch {
              // skip malformed chunks
            }
          }
        }
      }

      // Refresh sessions to update last message
      fetchSessions();
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIdx] = {
          role: "assistant",
          content: "Error: Failed to connect to agent",
        };
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Session sidebar */}
      <div
        className={`${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0 fixed md:static inset-y-0 left-0 z-30 w-64 border-r border-[var(--border)] bg-[var(--background)] flex flex-col transition-transform duration-200`}
      >
        <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold">Sessions</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={createNewSession}
              className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors"
              title="New session"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--muted-foreground)]">
              No sessions yet
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setActiveSession(s.key);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] flex items-start gap-2 hover:bg-[var(--accent)] transition-colors group ${
                  activeSession === s.key ? "bg-[var(--accent)]" : ""
                }`}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.label || s.key}
                  </p>
                  {s.lastMessage && (
                    <p className="text-xs text-[var(--muted-foreground)] truncate mt-0.5">
                      {s.lastMessage.content}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => deleteSessionHandler(s.key, e)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all shrink-0"
                >
                  <Trash2 className="h-3 w-3 text-red-400" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[var(--border)] shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            onClick={() => router.push(`/app/agents/${agentId}`)}
            className="p-1.5 rounded-lg hover:bg-[var(--accent)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-sm font-semibold truncate">
            {activeSession
              ? sessions.find((s) => s.key === activeSession)?.label ||
                "Chat"
              : "Chat"}
          </h1>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {loadingHistory ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)]">
              <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm">Send a message to start chatting</p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                    msg.role === "user"
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--accent)] text-[var(--foreground)]"
                  }`}
                >
                  {msg.content || (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)] max-h-32"
              style={{
                height: "auto",
                minHeight: "2.75rem",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="flex items-center justify-center rounded-xl bg-[var(--primary)] text-white p-2.5 disabled:opacity-40 active:opacity-80 transition-opacity shrink-0"
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
