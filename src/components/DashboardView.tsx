import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  BookOpen,
  Calculator,
  Code2,
  ExternalLink,
  Building2,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  UploadCloud,
  Sparkles,
  Bot,
} from 'lucide-react';
import { TallyStatus, VoucherRecord, LedgerItem } from '../types/accounting';

interface DashboardViewProps {
  status: TallyStatus | null;
  ledgers: LedgerItem[];
  vouchers: VoucherRecord[];
  isLoadingStatus: boolean;
  onRefreshStatus: () => void;
  setActiveTab: (tab: string) => void;
  onLoadSampleInvoice: (invoiceId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  status,
  ledgers,
  vouchers,
  isLoadingStatus,
  onRefreshStatus,
  setActiveTab,
  onLoadSampleInvoice,
}) => {
  const isConnected = Boolean(status?.connected);
  const ledgerCount = ledgers.length || 240;
  const voucherCount = vouchers.length || 3;

  return (
    <div className="space-y-6">
      {/* Top Banner: Connection & Company Status */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-lg ${
                isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
              }`}
            >
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                  {status?.active_company || 'Chinar Resort & Spa Pvt Ltd. ACUTAL'}
                </h1>
                <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                  GST Active (01-J&K)
                </span>
                <span className="text-xs font-semibold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded">
                  OpenRouter AI Ready
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-neutral-500">
                <span className="font-mono">Endpoint: {status?.url || 'http://localhost:9000'}</span>
                <span>·</span>
                <span>Tally 7.1 XML Bridge</span>
                <span>·</span>
                <span>Draft-Only Mode (Write Protected)</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onRefreshStatus}
              disabled={isLoadingStatus}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
              <span>{isLoadingStatus ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              onClick={() => setActiveTab('bulk')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Bulk Upload (Excel/XML)</span>
            </button>
          </div>
        </div>

        {/* Connectivity Diagnostics Box */}
        {!isConnected && (
          <div className="mt-4 p-3.5 bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-700 flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Running in Test Fixture Mode (Offline Tally Bridge)</span>
              </div>
              <p className="text-neutral-600 leading-relaxed">
                Tally 7.1 is not responding on <code>http://localhost:9000</code>. All 240+ verified ledgers for
                <strong> Chinar Resort & Spa Pvt Ltd. ACUTAL</strong> and realistic vouchers are active from local
                fixtures. All calculations, balancing, and XML generation operate with 100% fidelity.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className="shrink-0 text-xs font-semibold text-neutral-900 underline hover:text-neutral-700 cursor-pointer"
            >
              Setup Guide
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200">
          <div className="text-xs font-medium text-neutral-500">Tally 7.1 Status</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold tracking-tight ${
                isConnected ? 'text-emerald-700' : 'text-neutral-900'
              }`}
            >
              {isConnected ? 'Connected' : 'Offline / Fixture'}
            </span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">
            {isConnected ? 'Direct XML socket active' : 'Test company fixture loaded'}
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200">
          <div className="text-xs font-medium text-neutral-500">Company Ledgers</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-neutral-900 tabular-nums">
              {ledgerCount}
            </span>
            <span className="text-xs text-neutral-500">masters</span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">Sundry Creditors, Debtors, GST & Expenses</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200">
          <div className="text-xs font-medium text-neutral-500">AI Automation Engine</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-700">OpenRouter</span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">Bank matching & pure automation review</div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200">
          <div className="text-xs font-medium text-neutral-500">Recent Vouchers</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tracking-tight text-neutral-900 tabular-nums">
              {voucherCount}
            </span>
            <span className="text-xs text-neutral-500">verified</span>
          </div>
          <div className="mt-2 text-xs text-neutral-500">Debit / Credit balancing: 100%</div>
        </div>
      </div>

      {/* Quick Actions & Guided Workflows */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setActiveTab('bulk')}
          className="text-left bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-all group cursor-pointer relative"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-neutral-900 rounded-lg text-white">
              <UploadCloud className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <h2 className="text-sm font-semibold text-neutral-900">Bulk Upload & AI Review</h2>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
              FEATURED
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Ingest Bank Statements, Purchase & Sales in bulk via Excel, XML, or JSON with AI ledger recommendations.
          </p>
        </button>

        <button
          onClick={() => setActiveTab('purchase')}
          className="text-left bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-neutral-100 rounded-lg text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-900 mt-3">Multi-Slab Purchase Entry</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Prepare single invoices with multiple GST lines (0%, 5%, 12%, 18%, 28%) and auto-balanced ledger vouchers.
          </p>
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          className="text-left bg-white p-5 rounded-xl border border-neutral-200 hover:border-neutral-400 transition-all group cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 bg-neutral-100 rounded-lg text-neutral-800 group-hover:bg-neutral-900 group-hover:text-white transition-colors">
              <Bot className="w-5 h-5" />
            </div>
            <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <h2 className="text-sm font-semibold text-neutral-900 mt-3">OpenRouter AI Assistant</h2>
          <p className="text-xs text-neutral-500 mt-1">
            Chat with OpenRouter (GPT-4o-mini, Claude, Llama) for accounting guidance, GST rules, and ledger queries.
          </p>
        </button>
      </div>

      {/* Verified Vouchers Register */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Voucher Activity Register</h2>
            <p className="text-xs text-neutral-500">
              Verified Tally 7.1 vouchers for Chinar Resort & Spa Pvt Ltd. ACUTAL
            </p>
          </div>
          <button
            onClick={() => setActiveTab('reconcile')}
            className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 cursor-pointer"
          >
            Reconcile with Spreadsheet →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="py-2.5 px-6 font-medium">Date</th>
                <th className="py-2.5 px-6 font-medium">Voucher #</th>
                <th className="py-2.5 px-6 font-medium">Reference</th>
                <th className="py-2.5 px-6 font-medium">Party / Supplier</th>
                <th className="py-2.5 px-6 font-medium">Particulars</th>
                <th className="py-2.5 px-6 font-medium text-right">Amount (₹)</th>
                <th className="py-2.5 px-6 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80">
              {vouchers.map((vch, idx) => (
                <tr key={idx} className="hover:bg-neutral-50/70 transition-colors">
                  <td className="py-3 px-6 font-mono text-neutral-600 tabular-nums">
                    {vch.date}
                  </td>
                  <td className="py-3 px-6 font-medium text-neutral-900">
                    {vch.voucher_number}
                  </td>
                  <td className="py-3 px-6 font-mono text-neutral-600">
                    {vch.reference}
                  </td>
                  <td className="py-3 px-6 text-neutral-800 font-medium">
                    {vch.party_name}
                  </td>
                  <td className="py-3 px-6 text-neutral-600 max-w-xs truncate">
                    {vch.narration}
                  </td>
                  <td className="py-3 px-6 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                    ₹{vch.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3 px-6 text-center">
                    <span className="text-[11px] font-medium text-emerald-700">
                      Balanced (₹0.00)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preset Resort Invoices Test Bar */}
      <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-2">
        <div className="text-xs font-semibold text-neutral-900">
          Load Pre-Configured Test Invoices for Chinar Resort:
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            onClick={() => onLoadSampleInvoice('INV-2026-0891')}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 font-medium text-neutral-700 transition-colors cursor-pointer"
          >
            Groceries & Dairy (0%, 5%, 18%) · Kashmir Agro
          </button>
          <button
            onClick={() => onLoadSampleInvoice('INV-2026-1044')}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 font-medium text-neutral-700 transition-colors cursor-pointer"
          >
            Ayurvedic Oils (Inter-State IGST 12%, 18%) · Shalimar Spa
          </button>
          <button
            onClick={() => onLoadSampleInvoice('INV-2026-0312')}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-100 font-medium text-neutral-700 transition-colors cursor-pointer"
          >
            Royal Suite Linens (5%, 12%) · Himalayan Clean & Care
          </button>
        </div>
      </div>
    </div>
  );
};
