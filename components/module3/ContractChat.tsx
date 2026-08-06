"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FileText, Loader2, Sparkles, User } from "lucide-react";
import * as api from "./lib/api";
import { uid } from "./lib/store";
import type { ChatMessage, ChatScope } from "./lib/types";

interface ContractChatProps {
  backendUrl: string;
  contractId: string | null;
  contractFilename?: string | null;
  backendOnline: boolean | null;
}

export function ContractChat({ backendUrl, contractId, contractFilename, backendOnline }: ContractChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<ChatScope>("contract_and_kb");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid("msg"), role: "user", content: text };
    const pendingMsg: ChatMessage = { id: uid("msg"), role: "assistant", content: "", pending: true };
    setMessages((prev) => [...prev, userMsg, pendingMsg]);
    setSending(true);

    try {
      const history = messages
        .filter((m) => !m.pending)
        .slice(-8)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api.sendChatMessage(backendUrl, {
        message: text,
        contractId: contractId || undefined,
        scope,
        history,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === pendingMsg.id ? { ...m, content: res.answer, sources: res.sources, pending: false } : m))
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingMsg.id
            ? { ...m, content: `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`, pending: false }
            : m
        )
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 rounded-xl border bg-background/50">
      {contractId && (
        <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
          <span className="text-[11px] font-medium text-muted-foreground mr-1">Search scope:</span>
          {(
            [
              ["contract_and_kb", "This contract + KB"],
              ["contract_only", "This contract only"],
              ["kb_only", "Knowledge base only"],
            ] as [ChatScope, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setScope(value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                scope === value ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <ScrollArea className="flex-1 px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 text-primary/40" />
            <p className="text-sm font-medium text-foreground">Ask anything about your contracts</p>
            <p className="max-w-xs text-xs">
              {contractFilename
                ? `Grounded in "${contractFilename}" and your knowledge base — every answer cites its source.`
                : "Grounded in your knowledge base — every answer cites its source."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    m.role === "user" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"
                  )}
                >
                  {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                </div>
                <div className={cn("max-w-[85%] space-y-1.5", m.role === "user" && "flex flex-col items-end")}>
                  <div
                    className={cn(
                      "rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/60 text-foreground"
                    )}
                  >
                    {m.pending ? (
                      <div className="space-y-2 py-0.5" aria-label="Generating response">
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-11/12" />
                        <Skeleton className="h-3 w-4/5" />
                      </div>
                    ) : (
                      <span className="whitespace-pre-wrap">{m.content}</span>
                    )}
                  </div>
                  {!!m.sources?.length && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.sources.map((s, i) => (
                        <div
                          key={i}
                          title={s.snippet}
                          className="flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[10px] text-muted-foreground"
                        >
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="max-w-[160px] truncate">
                            {s.filename}
                            {s.page ? ` · p.${s.page}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      <div className="flex items-end gap-2 border-t p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={backendOnline === false ? "Backend offline — start it to chat." : "Ask about clauses, risks, entitlements…"}
          disabled={backendOnline === false || sending}
          className="min-h-[42px] max-h-32 flex-1 resize-none text-sm"
          rows={1}
        />
        <Button size="sm" className="h-[42px] shrink-0" onClick={send} disabled={!input.trim() || sending || backendOnline === false}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
        </Button>
      </div>
    </div>
  );
}
