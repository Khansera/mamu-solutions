import React from 'react';
import {
  LayoutDashboard,
  FileSpreadsheet,
  BookOpen,
  Calculator,
  Code2,
  FileCheck2,
  Bot,
  Settings,
  Shield,
  UploadCloud,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  ledgerCount: number;
  voucherCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  ledgerCount,
  voucherCount,
}) => {
  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'bulk', label: 'Bulk AI Upload (Excel/XML)', icon: UploadCloud, highlight: true },
    { id: 'purchase', label: 'Purchase Entry', icon: FileSpreadsheet },
    { id: 'ledgers', label: 'Ledgers & Matcher', icon: BookOpen, badge: ledgerCount || 240 },
    { id: 'gst', label: 'GST Validator', icon: Calculator },
    { id: 'xml', label: 'Tally 7.1 XML Studio', icon: Code2 },
    { id: 'reconcile', label: 'Reconciliation', icon: FileCheck2 },
    { id: 'ai', label: 'OpenRouter AI Assistant', icon: Bot },
    { id: 'diagnostics', label: 'Connection & Setup', icon: Settings },
  ];

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-neutral-200 flex flex-col justify-between min-h-[calc(100vh-57px)]">
      <div className="p-4 space-y-6">
        <div>
          <div className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-2">
            Accounting Suite
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-neutral-900 text-white font-semibold'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </div>
                  {item.badge ? (
                    <span
                      className={`text-[11px] font-mono tabular-nums ${
                        isActive ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      {item.badge}
                    </span>
                  ) : item.highlight ? (
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                      NEW
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Accounting Invariants Panel */}
        <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200/80 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-neutral-900">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>Safety Invariants</span>
          </div>
          <div className="text-neutral-600 text-[11px] space-y-1 leading-relaxed">
            <div>· Pure Decimal math (0.00)</div>
            <div>· Auto ledger creation forbidden</div>
            <div>· Debit = Credit balancing enforced</div>
            <div>· Pure automation review stage</div>
            <div>· Safe import verification gate</div>
          </div>
        </div>
      </div>

      {/* Footer Profile info */}
      <div className="p-4 border-t border-neutral-200 bg-neutral-50/50">
        <div className="text-[11px] text-neutral-500">Target Company</div>
        <div className="text-xs font-semibold text-neutral-900 truncate">
          Chinar Resort & Spa Pvt Ltd.
        </div>
        <div className="text-[11px] text-neutral-500 mt-1 font-mono">
          Endpoint: localhost:9000
        </div>
      </div>
    </aside>
  );
};
