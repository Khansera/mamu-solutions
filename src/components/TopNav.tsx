import React from 'react';
import { PlusCircle, Radio, ShieldCheck, AlertCircle, UploadCloud } from 'lucide-react';
import { TallyStatus } from '../types/accounting';

interface TopNavProps {
  status: TallyStatus | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onNewVoucher: () => void;
  isMockMode: boolean;
  setIsMockMode: (mock: boolean) => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  status,
  activeTab,
  setActiveTab,
  onNewVoucher,
  isMockMode,
  setIsMockMode,
}) => {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-neutral-200">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setActiveTab('overview')}
          className="text-left group cursor-pointer focus:outline-none"
        >
          <div className="text-base font-bold tracking-tight text-neutral-900 group-hover:text-emerald-800 transition-colors whitespace-nowrap">
            Tally 7.1 AI Assistant
          </div>
          <div className="text-xs text-neutral-500 whitespace-nowrap">
            Chinar Resort & Spa Pvt Ltd. ACUTAL · OpenRouter AI Active
          </div>
        </button>
      </div>

      {/* Zone 2: 4-5 clean single-line nav links */}
      <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-neutral-600">
        <button
          onClick={() => setActiveTab('overview')}
          className={`hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1 cursor-pointer ${
            activeTab === 'overview' ? 'text-neutral-900 font-semibold border-b-2 border-neutral-900' : ''
          }`}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveTab('bulk')}
          className={`hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'bulk' ? 'text-neutral-900 font-semibold border-b-2 border-neutral-900' : ''
          }`}
        >
          <span>Bulk Upload</span>
          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1 rounded">
            AI
          </span>
        </button>
        <button
          onClick={() => setActiveTab('purchase')}
          className={`hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1 cursor-pointer ${
            activeTab === 'purchase' ? 'text-neutral-900 font-semibold border-b-2 border-neutral-900' : ''
          }`}
        >
          Purchase Entry
        </button>
        <button
          onClick={() => setActiveTab('ledgers')}
          className={`hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1 cursor-pointer ${
            activeTab === 'ledgers' ? 'text-neutral-900 font-semibold border-b-2 border-neutral-900' : ''
          }`}
        >
          Ledger Roster
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`hover:text-neutral-900 transition-colors whitespace-nowrap shrink-0 py-1 cursor-pointer ${
            activeTab === 'ai' ? 'text-neutral-900 font-semibold border-b-2 border-neutral-900' : ''
          }`}
        >
          OpenRouter AI
        </button>
      </nav>

      {/* Zone 3: Status & 1 primary action */}
      <div className="flex items-center gap-4 shrink-0">
        <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-500">
          {status?.connected ? (
            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              Tally 7.1 Connected
            </span>
          ) : isMockMode ? (
            <span className="flex items-center gap-1.5 text-amber-800 font-medium bg-amber-50 px-2 py-1 rounded">
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              Test Fixtures (240 Ledgers)
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-red-700 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Tally Offline (port 9000)
            </span>
          )}
        </div>

        <button
          onClick={onNewVoucher}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-neutral-900 rounded-lg hover:bg-neutral-800 transition-colors shadow-sm whitespace-nowrap shrink-0 cursor-pointer"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>New Voucher</span>
        </button>
      </div>
    </header>
  );
};
