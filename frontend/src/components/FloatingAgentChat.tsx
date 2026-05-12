import { useState, useRef, useEffect, useCallback } from "react";
import Markdown from "react-markdown";
import {
  createAgentSession, sendAgentMessage, agentEventsURL,
  createNLPAgentSession, nlpAgentEventsURL,
  sendAgentCommand,
} from "../api/client";
import { parseCommand } from "../utils/nlpParser";

// ── Types (mirrored from AgentChat.tsx) ──
type Segment =
  | { type: "text"; content: string; final?: boolean }
  | { type: "reasoning"; content: string }
  | { type: "item"; item: AgentItem };

interface AgentItem {
  id: string;
  kind: string;
  status?: string;
  command?: string;
  output?: string;
  files?: string[];
  text?: string;
  exitCode?: number | null;
  phase?: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  segments: Segment[];
}

interface FloatingAgentChatProps {
  mode?: "dashboard" | "gamedb";
  dashboardName?: string;
  draftId?: string;
  onDashboardCreated?: (name: string) => void;
  onFileChange?: () => void;
}

const finderGuyIdleStrip = `${import.meta.env.BASE_URL}imgs/finder-guy-idle.png`;
const finderGuyWaitingStrip = `${import.meta.env.BASE_URL}imgs/finder-guy-waiting.png`;
const finderGuyWaveStrip = `${import.meta.env.BASE_URL}imgs/finder-guy-wave.png`;

function storageKey(mode: string, dashboard: string): string {
  return mode === "gamedb" ? "dac-gamedb-agent-" : "dac-agent-" + dashboard;
}

interface PersistedChat {
  sessionId: string;
  messages: ChatMessage[];
  nextMsgId: number;
}

function loadChat(mode: string, dashboard: string): PersistedChat | null {
  try {
    const raw = localStorage.getItem(storageKey(mode, dashboard));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedChat;
  } catch {
    return null;
  }
}

function saveChat(mode: string, dashboard: string, data: PersistedChat) {
  try {
    localStorage.setItem(storageKey(mode, dashboard), JSON.stringify(data));
  } catch { /* ignore */ }
}

function clearChat(mode: string, dashboard: string) {
  localStorage.removeItem(storageKey(mode, dashboard));
}

export function FloatingAgentChat({ mode = "dashboard", dashboardName = "__create__", draftId, onDashboardCreated, onFileChange }: FloatingAgentChatProps) {
  const persisted = useRef(loadChat(mode, dashboardName));
  const [messages, setMessages] = useState<ChatMessage[]>(persisted.current?.messages ?? []);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(persisted.current?.sessionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isFinderGuyWaving, setIsFinderGuyWaving] = useState(false);

  const sendTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finderGuyWaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const messageIdRef = useRef(persisted.current?.nextMsgId ?? 0);
  const finalAnswerRef = useRef(false);
  const onCreatedRef = useRef(onDashboardCreated);
  onCreatedRef.current = onDashboardCreated;
  const onFileChangeRef = useRef(onFileChange);
  onFileChangeRef.current = onFileChange;

  useEffect(() => {
    if (sessionId) {
      saveChat(mode, dashboardName, { sessionId, messages, nextMsgId: messageIdRef.current });
    }
  }, [messages, sessionId, dashboardName, mode]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!isCollapsed) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isCollapsed]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (finderGuyWaveTimeoutRef.current) {
        clearTimeout(finderGuyWaveTimeoutRef.current);
      }
    };
  }, []);

  const sseConnectedRef = useRef(false);
  useEffect(() => {
    if (sessionId && !sseConnectedRef.current) {
      sseConnectedRef.current = true;
      connectSSE(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const connectSSE = useCallback((sid: string) => {
    eventSourceRef.current?.close();
    const es = new EventSource(mode === "gamedb" ? nlpAgentEventsURL(sid) : agentEventsURL(sid));
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "start") {
          setIsStreaming(true);
          setError(null);
          finalAnswerRef.current = false;
          return;
        }
        if (data.type === "chunk") {
          const text = data.payload?.text ?? "";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "agent") return prev;
            const segs = [...last.segments];
            const txtSeg = segs.find((s) => s.type === "text");
            if (txtSeg && txtSeg.type === "text") {
              (txtSeg as { content: string }).content += text;
            } else {
              segs.push({ type: "text", content: text });
            }
            return [...prev.slice(0, -1), { ...last, segments: segs }];
          });
          return;
        }
        if (data.type === "item") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== "agent") return prev;
            return [...prev.slice(0, -1), { ...last, segments: [...last.segments, { type: "item", item: data.payload }] }];
          });
          if (data.payload?.kind === "files" && data.payload?.files?.length) {
            onFileChangeRef.current?.();
          }
          return;
        }
        if (data.type === "done") {
          setIsStreaming(false);
          return;
        }
        if (data.type === "error") {
          setIsStreaming(false);
          setError(data.payload?.message ?? "Agent error");
          return;
        }
      } catch {
        /* ignore malformed SSE */
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
    };
  }, [mode]);

  const createSession = useCallback(async () => {
    const res = mode === "gamedb"
      ? await createNLPAgentSession()
      : await createAgentSession(dashboardName, draftId);
    setSessionId(res.session_id);
    return res.session_id;
  }, [mode, dashboardName, draftId]);

  const ensureSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const sid = await createSession();
    sseConnectedRef.current = false;
    return sid;
  }, [sessionId, createSession]);

  const handleNewChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    finalAnswerRef.current = false;
    sseConnectedRef.current = false;
    clearChat(mode, dashboardName);
  }, [dashboardName, mode]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    const msgId = messageIdRef.current++;
    const userMsg: ChatMessage = { id: `u-${msgId}`, role: "user", segments: [{ type: "text", content: text }] };
    setMessages((prev) => [...prev, userMsg, { id: `a-${msgId}`, role: "agent", segments: [] }]);
    setInput("");
    setIsStreaming(true);
    setError(null);

    try {
      if (mode === "gamedb") {
        const parsed = await parseCommand(text);
        const result = await sendAgentCommand({
          intent: parsed.intent,
          game_name: parsed.gameName,
          entities: parsed.entities.map((e) => ({ type: e.type, value: e.value })),
          raw: text,
        });
        // Add result as agent message.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "agent") return prev;
          return [...prev.slice(0, -1), { ...last, segments: [{ type: "text", content: result.message }] }];
        });
        onFileChangeRef.current?.();
        setIsStreaming(false);
        return;
      }
      const sid = await ensureSession();
      await sendAgentMessage(sid, text);
    } catch (err) {
      if (sendTimeoutRef.current) { clearTimeout(sendTimeoutRef.current); sendTimeoutRef.current = null; }
      setError(err instanceof Error ? err.message : "Failed to send message");
      setIsStreaming(false);
    }
  }, [input, isStreaming, ensureSession, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFinderGuyClick = () => {
    setIsCollapsed(false);
    setIsFinderGuyWaving(true);
    if (finderGuyWaveTimeoutRef.current) {
      clearTimeout(finderGuyWaveTimeoutRef.current);
    }
    finderGuyWaveTimeoutRef.current = setTimeout(() => {
      setIsFinderGuyWaving(false);
      finderGuyWaveTimeoutRef.current = null;
    }, 1200);
  };

  const finderGuyStrip = isStreaming ? finderGuyWaitingStrip : isFinderGuyWaving ? finderGuyWaveStrip : finderGuyIdleStrip;
  const finderGuyFrameClass = isFinderGuyWaving && !isStreaming ? "finder-guy-wave-sprite--four-frame" : "";
  const finderGuyMood = isStreaming ? "waiting" : "idle";

  return (
    <div className="safe-bottom-pad pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="relative h-[min(520px,calc(100svh-var(--safe-top)-16px))]">
        <div className={`pointer-events-auto absolute bottom-5 right-4 transition-all duration-300 ease-out sm:right-6 ${isCollapsed ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
          <button
            type="button"
            onClick={handleFinderGuyClick}
            className="finder-guy-launch-button group relative flex h-10 w-10 items-center justify-center rounded-full outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-white/60"
            title="Open Finder Guy"
            aria-label="Open Finder Guy assistant"
          >
            <span className="finder-guy-launch-chevron" aria-hidden="true" />
          </button>
        </div>

        <div className={`pointer-events-auto absolute bottom-5 right-3 w-[min(calc(100vw-1.5rem),430px)] transition-all duration-300 ease-out sm:right-6 ${isCollapsed ? 'translate-x-8 translate-y-8 opacity-0 pointer-events-none' : 'translate-x-0 translate-y-0 opacity-100'}`}>
          <button
            type="button"
            onClick={handleFinderGuyClick}
            className="finder-guy-chat-pet absolute -top-[74px] right-8 h-[96px] w-[96px] overflow-visible rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Finder Guy is ready"
            tabIndex={-1}
          >
            <span className="absolute bottom-0 left-1/2 h-7 w-16 -translate-x-1/2 rounded-full bg-black/45 blur-md" />
            <span className={`finder-guy-wave-sprite finder-guy-wave-sprite--${finderGuyMood} ${finderGuyFrameClass} relative h-[96px] w-[96px]`} style={{ ["--finder-guy-wave" as string]: `url("${finderGuyStrip}")` }} />
          </button>

          <div className="relative h-[min(var(--agent-chat-expanded-height),calc(100svh-var(--safe-top)-132px))] overflow-hidden rounded-2xl border border-white/14 bg-[#080808]/94 shadow-[0_18px_54px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.14)]">
          <div className="relative z-10 flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b border-white/12">
              <div className="flex items-center gap-2">
                <span className="finder-guy-wave-sprite finder-guy-wave-sprite--header h-8 w-8" style={{ ["--finder-guy-wave" as string]: `url("${finderGuyIdleStrip}")` }} />
                <span className="text-[12px] text-white/72">Finder Guy</span>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleNewChat}
                    className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    title="New chat"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3H4C3.45 3 3 3.45 3 4V12C3 12.55 3.45 13 4 13H12C12.55 13 13 12.55 13 12V4C13 3.45 12.55 3 12 3Z" />
                      <path d="M8 6V10" />
                      <path d="M6 8H10" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Close"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M4 12L12 4M12 12L4 4" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2 space-y-3">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-lg rounded-br-sm border border-white/15 bg-white/10 px-3 py-2 text-[13px] leading-relaxed text-white whitespace-pre-wrap">
                        {(msg.segments[0] as { content: string }).content}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[13px] text-white leading-relaxed space-y-2">
                      {msg.segments.map((seg, i) => {
                        if (seg.type === "text") return <Markdown key={i}>{seg.content}</Markdown>;
                        if (seg.type === "reasoning") return <div key={i} className="text-white/50 italic">{seg.content}</div>;
                        if (seg.type === "item") {
                          const item = seg.item;
                          if (item.kind === "files" && item.files) {
                            return (
                              <div key={i} className="space-y-1">
                                {item.files.map((f) => (
                                  <div key={i} className="text-[#60a5fa]">{f}</div>
                                ))}
                              </div>
                            );
                          }
                          return <div key={i} className="rounded border border-white/15 bg-white/10 px-2 py-1 font-mono text-[12px] text-white/80">{item.text || item.command || JSON.stringify(item)}</div>;
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && messages.length > 0 && messages[messages.length - 1].role === "agent" && messages[messages.length - 1].segments.length === 0 && (
                <div className="text-[12px] text-white/50">Thinking...</div>
              )}

              {error && (
                <div className="text-[12px] text-red-400">{error}</div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-white/12 px-3 py-2">
              <div className="relative">
                <textarea
                  id="floating-agent-chat-input"
                  name="floating-agent-chat-input"
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter data here"
                  rows={1}
                  className="w-full resize-none rounded border border-white/15 bg-white/10 py-2 pl-3 pr-8 text-[13px] text-white placeholder:text-white/40 transition-colors focus:border-white/40 focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-white/50 hover:text-white disabled:opacity-30 disabled:hover:text-white/50 transition-colors"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 1.5L14.5 8L1.5 14.5V9.5L10 8L1.5 6.5V1.5Z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
