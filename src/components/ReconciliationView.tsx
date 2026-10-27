import React, { useState } from 'react';
import {
  FileCheck2,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Download,
  Search,
  CopyCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { VoucherRecord } from '../types/accounting';

interface ReconciliationViewProps {
  vouchers: VoucherRecord[];
}

export const ReconciliationView: React.FC<ReconciliationViewProps> = ({ vouchers }) => {
  const [uploadedRows, setUploadedRows] = useState<any[]>([]);
  const [reconcileReport, setReconcileReport] = useState<any>(null);
  const [fileName, setFileName] = useState('');

  // Handle CSV file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseAndReconcile(text);
    };
    reader.readAsText(file);
  };

  // Local deterministic parser and reconciliation (no AI transmission needed)
  const parseAndReconcile = (csvText: string) => {
    const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    const rows: any[] = [];
    // Simple CSV parser
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 3) {
        rows.push({
          ref: parts[0] || `ROW-${i}`,
          supplier: parts[1] || 'Unknown',
          amount: parseFloat(parts[2] || '0'),
          date: parts[3] || '',
        });
      }
    }
    setUploadedRows(rows);

    // Compare with Tally vouchers
    const matched: any[] = [];
    const missingInTally: any[] = [];
    const duplicates: any[] = [];
    const amountMismatches: any[] = [];

    // Track duplicate references within uploaded dataset
    const seenRefs = new Set<string>();

    rows.forEach((row) => {
      if (seenRefs.has(row.ref.toLowerCase())) {
        duplicates.push({ ...row, reason: 'Duplicate reference inside uploaded file' });
      }
      seenRefs.add(row.ref.toLowerCase());

      const found = vouchers.find(
        (v) =>
          v.reference.toLowerCase().trim() === row.ref.toLowerCase().trim() ||
          v.voucher_number.toLowerCase().trim() === row.ref.toLowerCase().trim()
      );

      if (found) {
        const diff = Math.abs(found.amount - row.amount);
        if (diff > 1.0) {
          amountMismatches.push({
            uploaded: row,
            tally: found,
            diff,
          });
        } else {
          matched.push({ uploaded: row, tally: found });
        }
      } else {
        missingInTally.push(row);
      }
    });

    setReconcileReport({
      totalUploaded: rows.length,
      matchedCount: matched.length,
      missingCount: missingInTally.length,
      mismatchCount: amountMismatches.length,
      duplicateCount: duplicates.length,
      missingInTally,
      amountMismatches,
      duplicates,
      matched,
    });
  };

  // Load sample reconciliation fixture
  const handleLoadSampleComparison = () => {
    const sampleCsv = `Reference,Supplier,Amount,Date
KAF/26-27/0891,Kashmir Agro Food Suppliers,59938.00,2026-10-25
SSB/DEL/26/1044,Shalimar Spa Botanicals (Delhi),63440.00,2026-10-22
HCC-OCT-312,Himalayan Clean & Care Linens,94780.00,2026-10-26
DLF-2026-904,Dal Lake Fresh Dairy Coop,34100.00,2026-10-20
KAF/26-27/0891,Kashmir Agro Food Suppliers,59938.00,2026-10-25`;

    setFileName('Resort_Audit_Spreadsheet_Oct2026.csv');
    parseAndReconcile(sampleCsv);
  };

  // Export Tally vouchers to CSV
  const handleExportVouchersCSV = () => {
    const headers = ['Voucher Type', 'Date', 'Voucher Number', 'Reference', 'Party Name', 'Amount (INR)', 'Narration'];
    const rows = vouchers.map((v) => [
      `"${v.voucher_type}"`,
      v.date,
      `"${v.voucher_number}"`,
      `"${v.reference}"`,
      `"${v.party_name.replace(/"/g, '""')}"`,
      v.amount.toFixed(2),
      `"${v.narration.replace(/"/g, '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tally7_Vouchers_Register_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-neutral-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            Audit, Reconciliation & Duplicate Detection
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Compare Tally 7.1 registers against vendor statements and purchase spreadsheets (100% local processing)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportVouchersCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Tally Vouchers CSV</span>
          </button>
        </div>
      </div>

      {/* Upload & Compare Bar */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
              Compare External Spreadsheet or Invoice Register
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Select a CSV file containing columns: Reference, Supplier, Amount, Date.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLoadSampleComparison}
              className="px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              Load Sample Resort Audit Sheet
            </button>
            <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer shadow-xs">
              <Upload className="w-3.5 h-3.5" />
              <span>{fileName ? 'Choose Another File' : 'Upload CSV Spreadsheet'}</span>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {fileName && (
          <div className="text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-lg border border-neutral-200 flex items-center justify-between">
            <span>
              Active file: <strong>{fileName}</strong> ({uploadedRows.length} rows loaded)
            </span>
            <span className="text-emerald-700 font-medium">Reconciled locally</span>
          </div>
        )}
      </div>

      {/* Reconciliation Summary Cards */}
      {reconcileReport && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-neutral-200">
              <div className="text-xs font-medium text-neutral-500">Fully Reconciled</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-emerald-700 tabular-nums">
                  {reconcileReport.matchedCount}
                </span>
                <span className="text-xs text-neutral-500">vouchers match</span>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Exact amount & reference</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-neutral-200">
              <div className="text-xs font-medium text-neutral-500">Missing in Tally</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-amber-700 tabular-nums">
                  {reconcileReport.missingCount}
                </span>
                <span className="text-xs text-neutral-500">unrecorded</span>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Requires purchase voucher entry</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-neutral-200">
              <div className="text-xs font-medium text-neutral-500">Amount Discrepancies</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-red-700 tabular-nums">
                  {reconcileReport.mismatchCount}
                </span>
                <span className="text-xs text-neutral-500">value variances</span>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Tax or round-off differences</div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-neutral-200">
              <div className="text-xs font-medium text-neutral-500">Potential Duplicates</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-purple-700 tabular-nums">
                  {reconcileReport.duplicateCount}
                </span>
                <span className="text-xs text-neutral-500">repeated refs</span>
              </div>
              <div className="mt-2 text-xs text-neutral-500">Duplicate invoice risk detected</div>
            </div>
          </div>

          {/* Actionable Discrepancy Findings */}
          {reconcileReport.missingCount > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-amber-50/50">
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Missing in Tally 7.1 (Present in Statement / Spreadsheet)</span>
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-6 font-medium">Invoice Ref</th>
                    <th className="py-2.5 px-6 font-medium">Supplier</th>
                    <th className="py-2.5 px-6 font-medium text-right">Amount (₹)</th>
                    <th className="py-2.5 px-6 font-medium">Date</th>
                    <th className="py-2.5 px-6 font-medium text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80">
                  {reconcileReport.missingInTally.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-6 font-mono font-semibold text-neutral-900">
                        {item.ref}
                      </td>
                      <td className="py-2.5 px-6 text-neutral-800">{item.supplier}</td>
                      <td className="py-2.5 px-6 text-right font-mono font-medium tabular-nums text-neutral-900">
                        ₹{item.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-6 text-neutral-500 font-mono">{item.date}</td>
                      <td className="py-2.5 px-6 text-center text-amber-800 font-medium">
                        Unentered
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reconcileReport.duplicateCount > 0 && (
            <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-200 bg-purple-50/50">
                <h3 className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-2">
                  <CopyCheck className="w-4 h-4 text-purple-700" />
                  <span>Duplicate Invoices Flagged (Safety Warning)</span>
                </h3>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-6 font-medium">Reference</th>
                    <th className="py-2.5 px-6 font-medium">Supplier</th>
                    <th className="py-2.5 px-6 font-medium text-right">Amount (₹)</th>
                    <th className="py-2.5 px-6 font-medium">Finding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80">
                  {reconcileReport.duplicates.map((dup: any, idx: number) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="py-2.5 px-6 font-mono font-bold text-purple-900">{dup.ref}</td>
                      <td className="py-2.5 px-6 text-neutral-800">{dup.supplier}</td>
                      <td className="py-2.5 px-6 text-right font-mono tabular-nums text-neutral-900">
                        ₹{dup.amount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-6 text-purple-800 font-medium">
                        Duplicate entry detected in statement
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
