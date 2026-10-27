import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { LedgerItem } from '../types/accounting';

interface LedgersViewProps {
  ledgers: LedgerItem[];
  onSelectLedger?: (ledgerName: string) => void;
}

export const LedgersView: React.FC<LedgersViewProps> = ({ ledgers, onSelectLedger }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [selectedGstRate, setSelectedGstRate] = useState<string>('ALL');

  // Ledger Matcher Interactive Tester State
  const [testLedgerInput, setTestLedgerInput] = useState('Kashmir Agro Foods');
  const [matchResult, setMatchResult] = useState<any>(null);
  const [isMatching, setIsMatching] = useState(false);

  // Groups list
  const parentGroups = useMemo(() => {
    const set = new Set(ledgers.map((l) => l.parent));
    return Array.from(set).sort();
  }, [ledgers]);

  // Filtered ledgers
  const filteredLedgers = useMemo(() => {
    return ledgers.filter((led) => {
      const matchesSearch =
        led.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        led.parent.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesGroup = selectedGroup === 'ALL' || led.parent === selectedGroup;

      let matchesRate = true;
      if (selectedGstRate !== 'ALL') {
        const targetRate = parseFloat(selectedGstRate);
        matchesRate = led.gst_rate === targetRate;
      }

      return matchesSearch && matchesGroup && matchesRate;
    });
  }, [ledgers, searchTerm, selectedGroup, selectedGstRate]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Ledger Name', 'Parent Group', 'Opening Balance', 'GST Rate (%)', 'Tax Type'];
    const rows = filteredLedgers.map((l) => [
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.parent.replace(/"/g, '""')}"`,
      l.opening_balance || '0.00',
      l.gst_rate !== null && l.gst_rate !== undefined ? l.gst_rate : '',
      l.tax_type || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Tally7_Ledgers_${selectedGroup}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Run Matcher test
  const handleTestMatch = async () => {
    if (!testLedgerInput.trim()) return;
    setIsMatching(true);
    try {
      const res = await fetch('/api/ledgers/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_name: testLedgerInput }),
      });
      const data = await res.json();
      setMatchResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsMatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-neutral-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            Ledger Roster & Matching Engine
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            {ledgers.length} verified ledgers loaded from Tally 7.1 · Chinar Resort & Spa Pvt Ltd. ACUTAL
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Interactive Matcher Test Sandbox */}
      <div className="p-5 bg-white rounded-xl border border-neutral-200 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
              Ledger Safety & Verification Prober
            </span>
            <span className="text-xs text-neutral-500">
              (Prevents silent substitutions or auto-creation)
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={testLedgerInput}
              onChange={(e) => setTestLedgerInput(e.target.value)}
              placeholder="Enter supplier or ledger name to test (e.g. Kashmir Agro Foods)..."
              className="w-full px-3.5 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>
          <button
            onClick={handleTestMatch}
            disabled={isMatching}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isMatching ? 'Testing...' : 'Test Ledger Match'}
          </button>
        </div>

        {matchResult && (
          <div className="p-4 rounded-lg border text-xs space-y-2 bg-neutral-50 border-neutral-200">
            {matchResult.status === 'EXACT' ? (
              <div className="flex items-start gap-2 text-emerald-800 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
                <div>
                  <div>
                    Exact Match Confirmed: <strong>{matchResult.exact_match.name}</strong>
                  </div>
                  <div className="text-neutral-500 font-normal mt-0.5">
                    Parent Group: {matchResult.exact_match.parent} · Balance: ₹
                    {matchResult.exact_match.opening_balance}
                  </div>
                </div>
              </div>
            ) : matchResult.status === 'AMBIGUOUS' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Ambiguous Match — User Confirmation Required</span>
                </div>
                <p className="text-neutral-600 text-xs">{matchResult.warning}</p>
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-semibold text-neutral-500 uppercase">
                    Suggested Existing Ledgers in Tally:
                  </div>
                  {matchResult.possible_matches?.map((pm: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-white rounded border border-neutral-200 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-neutral-900">{pm.name}</span>
                        <span className="text-neutral-500 text-[11px] ml-2 font-mono">
                          ({pm.parent})
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setTestLedgerInput(pm.name);
                          if (onSelectLedger) onSelectLedger(pm.name);
                        }}
                        className="text-xs text-neutral-900 font-semibold hover:underline cursor-pointer"
                      >
                        Select This Ledger
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-red-800 font-medium">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <div>{matchResult.warning}</div>
                  <div className="text-neutral-600 text-[11px] mt-1 font-normal">
                    Policy enforced: To prevent polluting company books, please select an existing ledger
                    from the list below or create it manually inside Tally 7.1 before importing.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 bg-white rounded-xl border border-neutral-200 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search across all 240+ ledgers by name or parent group..."
              className="w-full pl-9 pr-4 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="ALL">All Account Groups ({parentGroups.length})</option>
              {parentGroups.map((grp) => (
                <option key={grp} value={grp}>
                  {grp}
                </option>
              ))}
            </select>

            <select
              value={selectedGstRate}
              onChange={(e) => setSelectedGstRate(e.target.value)}
              className="px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white text-neutral-700 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            >
              <option value="ALL">All GST Slabs</option>
              <option value="0">0% (Nil / Exempt)</option>
              <option value="5">5% GST</option>
              <option value="12">12% GST</option>
              <option value="18">18% GST</option>
              <option value="28">28% GST</option>
            </select>
          </div>
        </div>

        {/* Quick Filter Segmented Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-neutral-500 text-[11px] mr-1">Quick Filter:</span>
          {['ALL', 'Sundry Creditors', 'Purchase Accounts', 'Duties & Taxes', 'Direct Expenses', 'Bank Accounts'].map(
            (grp) => (
              <button
                key={grp}
                onClick={() => setSelectedGroup(grp)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors cursor-pointer ${
                  selectedGroup === grp
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {grp === 'ALL' ? 'Show All' : grp}
              </button>
            )
          )}
        </div>
      </div>

      {/* Ledgers Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-6 py-3.5 border-b border-neutral-200 flex items-center justify-between text-xs text-neutral-500">
          <span>
            Showing <strong className="text-neutral-900">{filteredLedgers.length}</strong> of{' '}
            {ledgers.length} ledgers
          </span>
          <span>Click any row to test matching or populate voucher</span>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-neutral-50 text-neutral-500 border-b border-neutral-200 shadow-xs">
              <tr>
                <th className="py-2.5 px-6 font-medium">Ledger Name</th>
                <th className="py-2.5 px-6 font-medium">Parent Group</th>
                <th className="py-2.5 px-6 font-medium">GST Rate</th>
                <th className="py-2.5 px-6 font-medium">Tax Type</th>
                <th className="py-2.5 px-6 font-medium text-right">Opening Balance</th>
                <th className="py-2.5 px-6 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80">
              {filteredLedgers.map((led, idx) => (
                <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                  <td className="py-2.5 px-6 font-medium text-neutral-900">
                    {led.name}
                  </td>
                  <td className="py-2.5 px-6 text-neutral-600 font-mono text-[11px]">
                    {led.parent}
                  </td>
                  <td className="py-2.5 px-6 font-mono tabular-nums">
                    {led.gst_rate !== null && led.gst_rate !== undefined ? (
                      <span className="font-semibold text-neutral-800">{led.gst_rate}%</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-6 text-neutral-600">
                    {led.tax_type ? (
                      <span className="font-mono text-[11px] text-neutral-700">{led.tax_type}</span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-6 text-right font-mono tabular-nums text-neutral-700">
                    {led.opening_balance}
                  </td>
                  <td className="py-2.5 px-6 text-center">
                    <button
                      onClick={() => {
                        setTestLedgerInput(led.name);
                        handleTestMatch();
                      }}
                      className="text-xs text-neutral-900 hover:text-neutral-700 font-semibold cursor-pointer"
                    >
                      Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
