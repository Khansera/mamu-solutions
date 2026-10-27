import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  UploadCloud,
  FileCode,
  ShieldAlert,
} from 'lucide-react';
import { VoucherPreview } from '../types/accounting';

interface XMLPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  preview: VoucherPreview | null;
  xmlContent: string;
}

export const XMLPreviewModal: React.FC<XMLPreviewModalProps> = ({
  isOpen,
  onClose,
  preview,
  xmlContent,
}) => {
  const [copied, setCopied] = useState(false);
  const [userConfirmed, setUserConfirmed] = useState(false);
  const [isTestCompany, setIsTestCompany] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importResponse, setImportResponse] = useState<any>(null);

  if (!isOpen || !preview) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([xmlContent], { type: 'text/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Tally7_${preview.reference.replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExecuteImport = async () => {
    if (!userConfirmed) return;
    setIsImporting(true);
    setImportResponse(null);

    try {
      const res = await fetch('/api/vouchers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xml_content: xmlContent,
          confirmed_by_user: true,
          is_test_company: isTestCompany,
          target_company: preview.company_name,
        }),
      });

      const data = await res.json();
      setImportResponse(data);
    } catch (err: any) {
      setImportResponse({ error: err.message || 'Failed to submit XML to Tally' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-neutral-100 rounded-lg text-neutral-800">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">
                Tally 7.1 XML Voucher Studio & Safe Import Pipeline
              </h2>
              <div className="text-xs text-neutral-500 flex items-center gap-2">
                <span>Ref: {preview.reference}</span>
                <span>·</span>
                <span>Party: {preview.supplier_name}</span>
                <span>·</span>
                <span>Target: {preview.company_name}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Stage Progress Bar */}
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between text-xs text-neutral-600 font-medium">
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                ✓ 1. Draft Built
              </span>
              <span>→</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                ✓ 2. Balancing Verified (₹0.00 diff)
              </span>
              <span>→</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                ✓ 3. Tally 7.1 XML Generated
              </span>
              <span>→</span>
              <span className="text-neutral-900 font-semibold flex items-center gap-1">
                4. User Approval Required
              </span>
            </div>
          </div>

          {/* Ledger Balancing Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                Ledger Balancing Particulars (Tally 7.1 DeemedPositive Convention)
              </h3>
              <span className="text-xs font-mono font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                Debit Total: ₹{preview.debit_sum.toFixed(2)} | Credit Total: ₹
                {preview.credit_sum.toFixed(2)}
              </span>
            </div>

            <div className="border border-neutral-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
                  <tr>
                    <th className="py-2 px-4 font-medium">Ledger Name</th>
                    <th className="py-2 px-4 font-medium">Entry Type</th>
                    <th className="py-2 px-4 font-medium">Deemed Positive</th>
                    <th className="py-2 px-4 font-medium text-right">Debit (₹)</th>
                    <th className="py-2 px-4 font-medium text-right">Credit (₹)</th>
                    <th className="py-2 px-4 font-medium">Particulars</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/80">
                  {preview.ledger_entries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50">
                      <td className="py-2 px-4 font-medium text-neutral-900">
                        {entry.ledger_name}
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`font-semibold ${
                            entry.entry_type === 'Debit' ? 'text-blue-700' : 'text-emerald-700'
                          }`}
                        >
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="py-2 px-4 font-mono text-[11px] text-neutral-600">
                        {entry.is_deemed_positive ? 'Yes (Debit)' : 'No (Credit)'}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-neutral-900">
                        {entry.is_deemed_positive ? `₹${Math.abs(entry.amount).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-4 text-right font-mono tabular-nums text-neutral-900 font-semibold">
                        {!entry.is_deemed_positive ? `₹${entry.amount.toFixed(2)}` : '—'}
                      </td>
                      <td className="py-2 px-4 text-neutral-500 text-[11px] truncate max-w-xs">
                        {entry.particulars}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* High-Contrast Tally 7.1 XML Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
                Raw Tally 7.1 XML Envelope
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied!' : 'Copy XML'}</span>
                </button>
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .xml</span>
                </button>
              </div>
            </div>

            <pre className="p-4 bg-neutral-900 text-neutral-100 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 leading-relaxed select-all">
              {xmlContent}
            </pre>
          </div>

          {/* Safe Import Stage Controls */}
          <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-200/80 space-y-3">
            <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Safety Gate: Multi-Factor Approval for Tally Writes</span>
            </div>

            <p className="text-xs text-amber-800 leading-relaxed">
              To guarantee zero accidental corruption of accounting books, writes require explicit
              confirmation. You can import into a test company first to review the resulting voucher.
            </p>

            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center gap-2 font-medium text-neutral-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={userConfirmed}
                  onChange={(e) => setUserConfirmed(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span>
                  I have inspected the debits, credits, and ledger names and authorize writing this voucher.
                </span>
              </label>

              <label className="flex items-center gap-2 text-neutral-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isTestCompany}
                  onChange={(e) => setIsTestCompany(e.target.checked)}
                  className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                />
                <span>
                  Treat as Test/Backup Company import (Bypasses live-book lock for testing).
                </span>
              </label>
            </div>

            {importResponse && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  importResponse.success
                    ? 'bg-emerald-100 text-emerald-900'
                    : 'bg-red-100 text-red-900'
                }`}
              >
                {importResponse.success ? (
                  <div>✓ {importResponse.message}</div>
                ) : (
                  <div>✕ {importResponse.error || 'Import failed'}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-neutral-700 hover:text-neutral-900 cursor-pointer"
          >
            Close Preview
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="px-4 py-2 text-xs font-semibold text-neutral-800 bg-white border border-neutral-300 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Download Tally 7.1 XML File
            </button>
            <button
              onClick={handleExecuteImport}
              disabled={!userConfirmed || isImporting}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>{isImporting ? 'Sending to Tally...' : 'Import into Tally 7.1'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
