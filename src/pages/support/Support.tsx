import { useState, useRef, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import type { OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots } from "../../services/portfolioService";
import { fetchDisputes, createDispute, type DisputeTicket } from "../../services/disputesService";
import { useApp } from "../../contexts/AppContext";

interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  time: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "m0",
    from: "agent",
    text: "Hi there! I'm the LandVault support assistant. How can I help you today? You can ask about your plots, payments, documents, or I can connect you with a human agent.",
    time: now(),
  },
];

export default function Support() {
  const [searchParams] = useSearchParams();
  const { user } = useApp();
  const isDisputeFlow = searchParams.get("dispute") === "true";
  const disputePlotId = searchParams.get("plot");

  const [tab, setTab] = useState<"chat" | "disputes">(isDisputeFlow ? "disputes" : "chat");
  const [tickets, setTickets] = useState<DisputeTicket[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDisputes().then((data) => { if (!cancelled) setTickets(data); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Support</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Chat with our team or raise a formal dispute. All conversations are retained for your records.</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[var(--border)] mb-6">
        <div className="flex gap-0">
          {([
            { id: "chat", label: "Live chat" },
            { id: "disputes", label: `Disputes (${tickets.length})` },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" && <ChatPanel userName={user?.name || "You"} />}
      {tab === "disputes" && (
        <DisputesPanel
          initialPlotId={isDisputeFlow ? disputePlotId || "" : ""}
          tickets={tickets}
          onCreated={(ticket) => setTickets((prev) => [ticket, ...prev])}
        />
      )}
    </div>
  );
}

// ─── Chat panel ────────────────────────────────────────────────────────────

function ChatPanel({ userName }: { userName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [agentTyping, setAgentTyping] = useState(false);
  const [handedOff, setHandedOff] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentTyping]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { id: `u${Date.now()}`, from: "user", text, time: now() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setAgentTyping(true);

    setTimeout(() => {
      setAgentTyping(false);
      const reply = autoReply(text);
      setMessages((m) => [...m, { id: `a${Date.now()}`, from: "agent", text: reply, time: now() }]);
    }, 1200 + Math.random() * 600);
  };

  const handleWhatsApp = () => {
    setHandedOff(true);
    setMessages((m) => [...m, {
      id: `sys${Date.now()}`,
      from: "agent",
      text: "I've prepared a WhatsApp handoff. You'll be connected with a human agent who can see your account context. Tap the button below to open WhatsApp.",
      time: now(),
    }]);
  };

  return (
    <div className="flex flex-col h-[560px] bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Chat header */}
      <div className="px-5 py-3 border-b border-[var(--border)] flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-semibold">LV</div>
        <div>
          <div className="text-sm font-semibold">LandVault Support</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            Automated assistant — ask to be connected to a person
          </div>
        </div>
        <button onClick={handleWhatsApp} className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors">
          <span>📱</span> WhatsApp
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.from === "user" ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--foreground)]"}`}>
              {msg.text}
              <div className={`text-[10px] mt-1 ${msg.from === "user" ? "text-white/60 text-right" : "text-[var(--muted-foreground)]"}`}>{msg.time}</div>
            </div>
          </div>
        ))}

        {agentTyping && (
          <div className="flex justify-start">
            <div className="bg-[var(--muted)] rounded-xl px-4 py-2.5 flex gap-1 items-center">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-[var(--muted-foreground)] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {handedOff && (
          <a
            href="https://wa.me/2348012345678?text=Hi%2C%20I%20need%20help%20with%20my%20LandVault%20account."
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 mx-auto w-fit px-4 py-2.5 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700 transition-colors"
          >
            📱 Open WhatsApp chat
          </a>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick replies */}
      <div className="px-5 py-2 border-t border-[var(--border)] flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((q) => (
          <button key={q} onClick={() => sendMessage(q)} className="text-xs px-3 py-1.5 bg-[var(--muted)] hover:bg-[var(--secondary)] rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[var(--border)] flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={!input.trim()}
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── Disputes panel ────────────────────────────────────────────────────────

function DisputesPanel({ initialPlotId, tickets, onCreated }: { initialPlotId: string; tickets: DisputeTicket[]; onCreated: (ticket: DisputeTicket) => void }) {
  const [showForm, setShowForm] = useState(!!initialPlotId);
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [form, setForm] = useState({
    plotId: initialPlotId || "",
    subject: "",
    category: "payment",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnedPlots().then((data) => { if (!cancelled) setOwnedPlots(data); });
    return () => { cancelled = true; };
  }, []);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const ticket = await createDispute(form);
      onCreated(ticket);
      setSubmitted(true);
      setShowForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Raise new dispute */}
      {!showForm ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--muted-foreground)]">{tickets.length} dispute{tickets.length !== 1 ? "s" : ""} on record</p>
          <button onClick={() => { setSubmitted(false); setShowForm(true); }} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Raise a dispute
          </button>
        </div>
      ) : (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-sm">New dispute</h3>
            <button onClick={() => setShowForm(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Related plot (optional)</label>
              <select value={form.plotId} onChange={set("plotId")} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]">
                <option value="">No specific plot</option>
                {ownedPlots.map((p) => (
                  <option key={p.id} value={p.id}>{p.estate} — {p.plotLabel}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Category</label>
              <select value={form.category} onChange={set("category")} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]">
                <option value="payment">Payment issue</option>
                <option value="document">Document problem</option>
                <option value="allocation">Allocation dispute</option>
                <option value="construction">Construction concern</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Subject</label>
              <input value={form.subject} onChange={set("subject")} required placeholder="Brief description of the issue" className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Details</label>
              <textarea
                value={form.description}
                onChange={set("description")}
                required
                rows={4}
                placeholder="Describe the issue with as much detail as possible — dates, amounts, reference numbers…"
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
              <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
                {submitting ? "Submitting…" : "Submit dispute"}
              </button>
            </div>
          </form>
        </div>
      )}

      {submitted && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
          ✓ Dispute submitted. You'll receive a reference number, and our team will review it as soon as possible.
        </div>
      )}

      {/* Ticket list */}
      {tickets.length > 0 && (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div key={t.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-medium text-sm">{t.subject}</div>
                  <div className="text-xs text-[var(--muted-foreground)] font-mono-data mt-0.5">{t.id} · {t.createdAt} · {t.category}</div>
                </div>
                <TicketStatusBadge status={t.status} />
              </div>
              <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{t.description}</p>
              {t.status === "in_review" && (
                <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  ↳ Under review by our disputes team — we'll update this ticket once there's movement.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketStatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    open: "bg-blue-50 text-blue-700 border-blue-200",
    in_review: "bg-amber-50 text-amber-700 border-amber-200",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  const labels: Record<string, string> = { open: "Open", in_review: "In review", resolved: "Resolved" };
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border whitespace-nowrap ${s[status] || ""}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function now() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const QUICK_REPLIES = [
  "Where's my allocation letter?",
  "Payment not confirmed",
  "I want to upgrade my plot",
  "Talk to a human agent",
];

function autoReply(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("allocation")) return "Allocation letters are issued within 24 hours of a confirmed deposit. You can find yours in your Document Vault under the Allocation Letter category. Would you like me to direct you there?";
  if (t.includes("payment") || t.includes("paid")) return "Payment confirmations depend on your gateway — Paystack is usually instant, while bank transfers can take up to 2 hours. If it's been longer, please raise a dispute from the Support tab and we'll investigate immediately.";
  if (t.includes("upgrade") || t.includes("swap")) return "You can initiate an upgrade directly from your portfolio — visit your plot detail page and tap 'Upgrade or swap plot'. Your existing equity is credited automatically. Would you like me to walk you through it?";
  if (t.includes("human") || t.includes("agent") || t.includes("person")) return "Of course. Tap the WhatsApp button above to connect with a human support agent. They have access to your account context and can resolve most issues in real time.";
  if (t.includes("kyc") || t.includes("verify")) return "KYC reviews typically take 1–2 business days. If you've already submitted your documents, you can check the status in Settings → Profile. If it's been more than 3 days, please raise a dispute so we can expedite.";
  return "Thanks for your message. Let me check that for you. If this requires account access, I'll transfer you to a specialist. Is there anything specific you'd like me to look into?";
}
