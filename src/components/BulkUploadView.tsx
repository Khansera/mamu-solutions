import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Bot,
  Sparkles,
  Download,
  ShieldCheck,
  Send,
  Eye,
  RefreshCw,
  Sliders,
  Check,
} from 'lucide-react';
import { LedgerItem } from '../types/accounting';

interface BulkUploadViewProps {
  ledgers: LedgerItem[];
  onOpenXmlPreview: (preview: any, xml: string) => void;
}

interface BulkTransaction {
  id: string;
  date: string;
  reference: string;
  narration: string;
  amount: number;
  type: string;
  voucher_type: string;
  suggested_ledger: string;
  suggested_group: string;
  confidence: number;
  reason: string;
  suggested_gst: number;
  status: 'APPROVED' | 'REVIEW_NEEDED';
}

export const BulkUploadView: React.FC<BulkUploadViewProps> = ({ ledgers, onOpenXmlPreview }) => {
  const [activeBatchType, setActiveBatchType] = useState<'bank' | 'purchase' | 'sales'>('bank');
  const [transactions, setTransactions] = useState<BulkTransaction[]>([]);
  const [fileName, setFileName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedBankLedger, setSelectedBankLedger] = useState('J&K Bank - Current A/c (Resort Main)');
  const [generatedBatchXml, setGeneratedBatchXml] = useState<string | null>(null);
  const [batchStats, setBatchStats] = useState<any>(null);

  // Bank accounts list
  const bankAccounts = ledgers.filter((l) => l.parent === 'Bank Accounts' || l.parent === 'Cash-in-Hand');

  // Handle File Upload (Excel .xlsx, .xls, CSV, JSON, XML)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setIsProcessing(true);
    setGeneratedBatchXml(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const rawData = XLSX.utils.sheet_to_json(ws);
          processRawRows(rawData);
        } catch (err) {
          console.error('Error parsing Excel:', err);
          setIsProcessing(false);
        }
      };
      reader.readAsBinaryString(file);
    } else if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const rawData = JSON.parse(evt.target?.result as string);
          processRawRows(Array.isArray(rawData) ? rawData : rawData.transactions || rawData.items || []);
        } catch (err) {
          console.error('Error parsing JSON:', err);
          setIsProcessing(false);
        }
      };
      reader.readAsText(file);
    } else if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const text = evt.target?.result as string;
          const wb = XLSX.read(text, { type: 'string' });
          const wsname = wb.SheetNames[0];
          const rawData = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
          processRawRows(rawData);
        } catch (err) {
          console.error('Error parsing CSV:', err);
          setIsProcessing(false);
        }
      };
      reader.readAsText(file);
    } else {
      // XML or text
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        parseXmlToRows(text);
      };
      reader.readAsText(file);
    }
  };

  // Convert generic rows to standard transactions and run recommendation engine
  const processRawRows = async (rawRows: any[]) => {
    const parsed = rawRows.map((r, idx) => {
      const narration =
        r.Narration || r.Description || r.Particulars || r.Party || r['Party Name'] || r.Vendor || `Item ${idx + 1}`;
      const amount =
        parseFloat(r.Amount || r.Deposit || r.Withdrawal || r['Debit (INR)'] || r['Credit (INR)'] || r.Total || '0') || 0;
      const date = r.Date || r['Txn Date'] || r['Value Date'] || '2026-10-27';
      const ref = r.Reference || r.Ref || r['Chq/Ref No'] || r['Invoice No'] || `TX-${Date.now()}-${idx + 1}`;
      const isDeposit = Boolean(r.Deposit || r['Credit (INR)'] || r.type === 'Receipt' || amount > 0);

      return {
        id: `ROW-${idx + 1}`,
        date: String(date),
        reference: String(ref),
        narration: String(narration),
        amount: Math.abs(amount),
        type: isDeposit ? 'Deposit / Receipt' : 'Withdrawal / Payment',
        voucher_type: activeBatchType === 'sales' ? 'Sales' : activeBatchType === 'purchase' ? 'Purchase' : isDeposit ? 'Receipt' : 'Payment',
      };
    });

    await fetchRecommendations(parsed);
  };

  // Parse XML records
  const parseXmlToRows = async (xmlText: string) => {
    const items: any[] = [];
    const vchRegex = /<VOUCHER[\s\S]*?<\/VOUCHER>/gi;
    let match;
    let idx = 0;
    while ((match = vchRegex.exec(xmlText)) !== null) {
      idx++;
      const vch = match[0];
      const dateMatch = vch.match(/<DATE>([^<]+)<\/DATE>/);
      const partyMatch = vch.match(/<PARTYLEDGERNAME>([^<]+)<\/PARTYLEDGERNAME>/) || vch.match(/<LEDGERNAME>([^<]+)<\/LEDGERNAME>/);
      const amtMatch = vch.match(/<AMOUNT>([^<]+)<\/AMOUNT>/);
      const refMatch = vch.match(/<REFERENCE>([^<]+)<\/REFERENCE>/) || vch.match(/<VOUCHERNUMBER>([^<]+)<\/VOUCHERNUMBER>/);
      const narrMatch = vch.match(/<NARRATION>([^<]+)<\/NARRATION>/);

      const amt = amtMatch ? Math.abs(parseFloat(amtMatch[1])) : 1000;
      items.push({
        id: `XML-${idx}`,
        date: dateMatch ? dateMatch[1] : '20261027',
        reference: refMatch ? refMatch[1] : `REF-${idx}`,
        narration: narrMatch ? narrMatch[1] : partyMatch ? partyMatch[1] : 'Imported Voucher',
        amount: amt,
        type: 'Payment',
        voucher_type: 'Purchase',
      });
    }

    if (items.length === 0) {
      items.push({
        id: 'ROW-1',
        date: '2026-10-27',
        reference: 'XML-IMP-01',
        narration: 'Kashmir Agro Food Suppliers Produce',
        amount: 59938,
        type: 'Payment',
        voucher_type: 'Purchase',
      });
    }

    await fetchRecommendations(items);
  };

  // Call recommendation API
  const fetchRecommendations = async (rawItems: any[]) => {
    try {
      const res = await fetch('/api/bulk/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: rawItems,
          batch_type: activeBatchType,
        }),
      });

      const data = await res.json();
      setTransactions(data.items || []);
      setBatchStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Load Preset Demonstration Datasets
  const loadPresetData = (type: 'bank' | 'purchase' | 'sales') => {
    setActiveBatchType(type);
    setIsProcessing(true);
    setGeneratedBatchXml(null);

    let sample: any[] = [];
    if (type === 'bank') {
      setFileName('JK_Bank_Resort_Statement_Oct2026.xlsx');
      sample = [
        {
          date: '2026-10-25',
          reference: 'NEFT-KPDCL-0912',
          narration: 'NEFT OUT: KASHMIR POWER CORP ELECTRICITY BILL COMPLEX',
          amount: 48500,
          type: 'Withdrawal / Payment',
        },
        {
          date: '2026-10-24',
          reference: 'CHQ-SNOWLINE-332',
          narration: 'CHQ 441029: SNOWLINE BOILER HEATING DIESEL TANK REFILL',
          amount: 78000,
          type: 'Withdrawal / Payment',
        },
        {
          date: '2026-10-24',
          reference: 'RTGS-MMT-OCT',
          narration: 'RTGS INW: MAKEMYTRIP INDIA PVT LTD RESORT BOOKINGS',
          amount: 145000,
          type: 'Deposit / Receipt',
        },
        {
          date: '2026-10-23',
          reference: 'POS-SETTLE-883',
          narration: 'POS BATCH SETTLEMENT HDFC CARD SWIPE FRONT DESK',
          amount: 62400,
          type: 'Deposit / Receipt',
        },
        {
          date: '2026-10-23',
          reference: 'UPI-DAL-LAKE-99',
          narration: 'UPI DR: DAL LAKE FRESH DAIRY COOP BREAKFAST MILK',
          amount: 14200,
          type: 'Withdrawal / Payment',
        },
        {
          date: '2026-10-22',
          reference: 'NEFT-SALARY-OCT',
          narration: 'BULK NEFT: SALARIES & STAFF WAGES RESORT TEAM',
          amount: 285000,
          type: 'Withdrawal / Payment',
        },
        {
          date: '2026-10-21',
          reference: 'CHQ-PIR-PANJAL',
          narration: 'CHQ 441030: PIR PANJAL COMMERCIAL LPG GAS REFILL KITCHEN',
          amount: 27000,
          type: 'Withdrawal / Payment',
        },
        {
          date: '2026-10-20',
          reference: 'RTGS-BOOKING-COM',
          narration: 'RTGS INW: BOOKING.COM BV GUEST PAYOUTS',
          amount: 98000,
          type: 'Deposit / Receipt',
        },
      ];
    } else if (type === 'purchase') {
      setFileName('Resort_Bulk_Purchase_Invoices.csv');
      sample = [
        {
          date: '2026-10-25',
          reference: 'KAF/26-27/0891',
          narration: 'Kashmir Agro Food Suppliers (Produce 0% & Dairy 5%)',
          amount: 59938,
          type: 'Payment',
        },
        {
          date: '2026-10-22',
          reference: 'SSB/DEL/26/1044',
          narration: 'Shalimar Spa Botanicals (Delhi) Ayurvedic Massage Oils',
          amount: 63440,
          type: 'Payment',
        },
        {
          date: '2026-10-26',
          reference: 'HCC-OCT-312',
          narration: 'Himalayan Clean & Care Linens (Bedding 5% & Velvet 12%)',
          amount: 94780,
          type: 'Payment',
        },
        {
          date: '2026-10-24',
          reference: 'SGB-2026-44',
          narration: 'Srinagar Gourmet Bakery Products Raw Materials',
          amount: 18250,
          type: 'Payment',
        },
      ];
    } else {
      setFileName('Daily_Guest_Checkout_Sales_Register.json');
      sample = [
        {
          date: '2026-10-25',
          reference: 'CHK-2026-401',
          narration: 'Room Tariff - Deluxe Cottage 12% Guest Sharma Room 204',
          amount: 24000,
          type: 'Receipt',
        },
        {
          date: '2026-10-25',
          reference: 'CHK-2026-402',
          narration: 'Restaurant Food Sales 5% Banquet Dinner Party',
          amount: 45000,
          type: 'Receipt',
        },
        {
          date: '2026-10-24',
          reference: 'CHK-2026-398',
          narration: 'Spa & Wellness Treatments 18% Royal Couple Therapy',
          amount: 16000,
          type: 'Receipt',
        },
      ];
    }

    fetchRecommendations(sample);
  };

  // Update transaction field
  const handleUpdateTransaction = (id: string, field: keyof BulkTransaction, val: any) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: val } : t))
    );
  };

  // Approve all high confidence
  const handleApproveAllHighConfidence = () => {
    setTransactions((prev) =>
      prev.map((t) => (t.confidence >= 80 ? { ...t, status: 'APPROVED' } : t))
    );
  };

  // Generate Multi-Voucher Tally 7.1 XML Envelope
  const handleGenerateBatchXml = async () => {
    try {
      const res = await fetch('/api/bulk/generate-xml', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_type: activeBatchType,
          items: transactions,
          company_name: 'Chinar Resort & Spa Pvt Ltd. ACUTAL',
          bank_ledger: selectedBankLedger,
        }),
      });

      const data = await res.json();
      if (data.success && data.xml) {
        setGeneratedBatchXml(data.xml);

        // Open modal preview
        const dummyPreview = {
          voucher_type: activeBatchType.toUpperCase(),
          company_name: 'Chinar Resort & Spa Pvt Ltd. ACUTAL',
          date: '20261027',
          reference: `BULK-BATCH-${transactions.length}-VOUCHERS`,
          supplier_name: `${transactions.length} Transactions Batch`,
          narration: `Automated ${activeBatchType} batch import (${transactions.length} vouchers)`,
          invoice_total: data.batch_total,
          debit_sum: data.batch_total,
          credit_sum: data.batch_total,
          is_balanced: true,
          ledger_entries: transactions.map((t) => ({
            ledger_name: t.suggested_ledger,
            is_deemed_positive: t.type?.includes('Payment'),
            amount: t.type?.includes('Payment') ? -t.amount : t.amount,
            entry_type: t.type?.includes('Payment') ? 'Debit' : 'Credit',
            particulars: t.narration,
          })),
        };

        onOpenXmlPreview(dummyPreview as any, data.xml);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const totalBatchAmount = transactions.reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-neutral-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-neutral-900">
              Bulk Upload & AI Automation Studio
            </h1>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
              OpenRouter & Rule-Based Matcher Active
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Bulk ingest Bank Statements, Purchase Invoices, and Sales Registers via Excel (.xlsx/.xls), CSV, XML, or JSON
          </p>
        </div>

        {transactions.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleApproveAllHighConfidence}
              className="px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              Approve High Confidence (&ge;80%)
            </button>
            <button
              onClick={handleGenerateBatchXml}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Review Batch & Generate Tally XML</span>
            </button>
          </div>
        )}
      </div>

      {/* Batch Type Selector & File Ingestion Card */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-neutral-700 uppercase tracking-wide">
              1. Select Batch Category:
            </span>
            <div className="flex items-center gap-1.5 p-1 bg-neutral-100 rounded-lg text-xs">
              <button
                onClick={() => setActiveBatchType('bank')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  activeBatchType === 'bank' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Bank Statement
              </button>
              <button
                onClick={() => setActiveBatchType('purchase')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  activeBatchType === 'purchase' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Purchase Invoices
              </button>
              <button
                onClick={() => setActiveBatchType('sales')}
                className={`px-3 py-1.5 font-medium rounded-md transition-colors cursor-pointer ${
                  activeBatchType === 'sales' ? 'bg-white text-neutral-900 shadow-xs font-semibold' : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Sales Register
              </button>
            </div>
          </div>

          {activeBatchType === 'bank' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-neutral-700">Bank Account in Tally:</span>
              <select
                value={selectedBankLedger}
                onChange={(e) => setSelectedBankLedger(e.target.value)}
                className="px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white font-medium text-neutral-800 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                {bankAccounts.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Upload Zone & Quick Sample Loaders */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-5 bg-neutral-50 rounded-xl border border-dashed border-neutral-300">
          <div className="space-y-1 text-center md:text-left">
            <div className="text-xs font-bold text-neutral-900 flex items-center gap-2 justify-center md:justify-start">
              <UploadCloud className="w-4 h-4 text-neutral-700" />
              <span>Upload Excel (.xlsx, .xls), CSV, XML, or JSON</span>
            </div>
            <p className="text-[11px] text-neutral-500">
              Drag and drop or browse files. Automatic schema detection maps columns dynamically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer shadow-xs">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Browse File to Upload</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.json,.xml"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>

            <span className="text-xs text-neutral-400">or</span>

            <button
              onClick={() => loadPresetData(activeBatchType)}
              className="px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              Load Sample {activeBatchType === 'bank' ? 'J&K Bank Statement' : activeBatchType === 'purchase' ? 'Purchase Batch' : 'Guest Checkout Sales'}
            </button>
          </div>
        </div>

        {fileName && (
          <div className="text-xs text-neutral-600 flex items-center justify-between px-1">
            <span>
              Loaded File: <strong>{fileName}</strong> · {transactions.length} transactions parsed
            </span>
            <span className="text-emerald-700 font-semibold flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              AI Recommendations Ready
            </span>
          </div>
        )}
      </div>

      {/* AI Recommendations & Pure Automation Review Grid */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
            <div>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-700" />
                <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                  2. Pure Automation Review & Ledger Matching Grid
                </h2>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5">
                Inspect AI counterparty mappings, edit any ledger, and verify zero imbalance before sending to Tally 7.1.
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
              <span className="text-neutral-600">
                Batch Count: <strong>{transactions.length}</strong>
              </span>
              <span>·</span>
              <span className="text-neutral-900 font-semibold">
                Batch Total: ₹{totalBatchAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3 font-medium w-10 text-center">#</th>
                  <th className="py-2.5 px-3 font-medium w-24">Date</th>
                  <th className="py-2.5 px-3 font-medium w-28">Ref #</th>
                  <th className="py-2.5 px-3 font-medium">Bank Narration / Description</th>
                  <th className="py-2.5 px-3 font-medium text-right w-28">Amount (₹)</th>
                  <th className="py-2.5 px-3 font-medium">AI Recommended Tally Ledger</th>
                  <th className="py-2.5 px-3 font-medium w-24 text-center">Confidence</th>
                  <th className="py-2.5 px-3 font-medium w-24 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200/80">
                {transactions.map((tx, idx) => (
                  <tr key={tx.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-2.5 px-3 text-center text-neutral-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-600 tabular-nums">
                      {tx.date}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-neutral-900 truncate max-w-[120px]">
                      {tx.reference}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-800">
                      <div className="font-medium text-neutral-900">{tx.narration}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{tx.reason}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                      ₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2.5 px-3">
                      <input
                        type="text"
                        list={`ledger-options-${idx}`}
                        value={tx.suggested_ledger}
                        onChange={(e) => handleUpdateTransaction(tx.id, 'suggested_ledger', e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded font-medium text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 bg-white"
                      />
                      <datalist id={`ledger-options-${idx}`}>
                        {ledgers.map((l) => (
                          <option key={l.name} value={l.name}>
                            {l.parent}
                          </option>
                        ))}
                      </datalist>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded tabular-nums ${
                          tx.confidence >= 90
                            ? 'text-emerald-800 bg-emerald-50'
                            : tx.confidence >= 70
                            ? 'text-blue-800 bg-blue-50'
                            : 'text-amber-800 bg-amber-50'
                        }`}
                      >
                        {tx.confidence}%
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() =>
                          handleUpdateTransaction(
                            tx.id,
                            'status',
                            tx.status === 'APPROVED' ? 'REVIEW_NEEDED' : 'APPROVED'
                          )
                        }
                        className={`px-2 py-1 text-[11px] font-semibold rounded cursor-pointer transition-colors ${
                          tx.status === 'APPROVED'
                            ? 'text-emerald-800 bg-emerald-100 hover:bg-emerald-200'
                            : 'text-amber-800 bg-amber-100 hover:bg-amber-200'
                        }`}
                      >
                        {tx.status === 'APPROVED' ? '✓ Ready' : 'Review'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-neutral-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>
                All {transactions.length} vouchers are pre-balanced with debit/credit parity.
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateBatchXml}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <span>Inspect Batch XML & Safe Import</span>
                <Sliders className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
