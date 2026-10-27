import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  Info,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { LedgerItem } from '../types/accounting';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  provider?: string;
  model?: string;
}

interface AIChatViewProps {
  ledgers: LedgerItem[];
  setActiveTab: (tab: string) => void;
}

export const AIChatView: React.FC<AIChatViewProps> = ({ ledgers, setActiveTab }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `Hello! I am your OpenRouter AI Accounting Assistant for **Chinar Resort & Spa Pvt Ltd. ACUTAL**.

I can help you:
- **Bank Statement Matching:** Suggest the exact Tally ledgers for narrations (e.g. NEFT to Kashmir Power Corp -> Electricity Charges, OTA settlements -> MakeMyTrip)
- **Bulk Review Guidance:** Advise on voucher types (Payment vs Receipt vs Sales vs Purchase)
- **GST Slabs & Rules:** Provide tax rates (0%, 5%, 12%, 18%, 28%) and Intra-State vs Inter-State rules
- **Tally 7.1 Schema:** Verify XML structure and DeemedPositive debit/credit conventions

All financial arithmetic and balancing calculations remain strictly computed in deterministic code. How can I assist you?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      provider: 'OpenRouter',
      model: 'openai/gpt-4o-mini',
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const presetQueries = [
    'How should I match bank narration: "NEFT KPDCL ELECTRICITY BILL"?',
    'Show my existing purchase ledgers',
    'Find all GST input tax ledgers',
    'How do I account for MakeMyTrip OTA payout in Tally 7.1?',
    'Explain Tally 7.1 DeemedPositive sign convention',
    'What ledger should I use for commercial kitchen LPG cylinder refills?',
  ];

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.success && data.text) {
        const assistantMsg: Message = {
          role: 'assistant',
          content: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          provider: data.provider || 'OpenRouter',
          model: data.model || 'openai/gpt-4o-mini',
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const notice = data.message || 'AI request did not complete.';
        setErrorNotice(notice);

        const fallbackMsg: Message = {
          role: 'assistant',
          content: `${notice}\n\n*Notice: You can continue using all core accounting features (Bulk Excel upload, Ledger roster, GST calculation, balancing, and XML export) without an AI key.*`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      }
    } catch (err: any) {
      setErrorNotice(err.message || 'Network error communicating with AI server.');
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              OpenRouter AI Accounting Assistant
            </h1>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
              Configured via OpenRouter
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Natural language understanding for ledger matching, bank narrations, and bulk invoice review
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500 font-mono">
          <span>Provider: OpenRouter</span>
          <span>·</span>
          <span>Endpoint: openrouter.ai/api/v1</span>
        </div>
      </div>

      {/* Main Chat Frame */}
      <div className="bg-white rounded-xl border border-neutral-200 flex flex-col h-[650px] overflow-hidden">
        {/* Messages Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-neutral-50/40">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-2xl rounded-xl p-4 text-xs leading-relaxed space-y-2 relative group shadow-2xs ${
                  msg.role === 'user'
                    ? 'bg-neutral-900 text-white rounded-tr-none'
                    : 'bg-white border border-neutral-200 text-neutral-800 rounded-tl-none'
                }`}
              >
                <div className="flex items-center justify-between gap-4 pb-1 border-b border-neutral-100/30 text-[10px] opacity-75">
                  <span>
                    {msg.role === 'user' ? 'Accountant' : `AI Assistant (${msg.provider || 'OpenRouter'})`}
                  </span>
                  <span>{msg.timestamp}</span>
                </div>

                <div className="whitespace-pre-wrap">{msg.content}</div>

                {msg.role === 'assistant' && (
                  <div className="pt-1 flex items-center justify-end">
                    <button
                      onClick={() => copyToClipboard(msg.content, idx)}
                      className="text-[11px] text-neutral-400 hover:text-neutral-700 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 animate-pulse" />
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-3.5 text-xs text-neutral-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-neutral-400 animate-ping" />
                <span>Consulting OpenRouter model...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Queries Chips */}
        <div className="px-6 py-2.5 bg-white border-t border-neutral-200 flex flex-wrap gap-1.5 text-xs">
          <span className="text-[11px] text-neutral-400 flex items-center gap-1 mr-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Quick Prompts:
          </span>
          {presetQueries.map((pq, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(pq)}
              disabled={isLoading}
              className="px-2.5 py-1 text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              {pq}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-neutral-200 flex items-center gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about bank narration mapping, existing ledgers, or Tally 7.1 XML rules..."
            className="flex-1 px-4 py-2.5 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-lg transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
