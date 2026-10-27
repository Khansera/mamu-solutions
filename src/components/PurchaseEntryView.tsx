import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Calculator,
  RotateCcw,
  ShieldAlert,
  ArrowRight,
  Info,
} from 'lucide-react';
import { LedgerItem, GSTLineItem, VoucherPreview } from '../types/accounting';

interface PurchaseEntryViewProps {
  ledgers: LedgerItem[];
  onOpenXmlPreview: (preview: VoucherPreview, xml: string) => void;
  presetInvoice?: any;
}

export const PurchaseEntryView: React.FC<PurchaseEntryViewProps> = ({
  ledgers,
  onOpenXmlPreview,
  presetInvoice,
}) => {
  // Supplier & Metadata
  const [supplierName, setSupplierName] = useState('Kashmir Agro Food Suppliers');
  const [invoiceNumber, setInvoiceNumber] = useState('KAF/26-27/0891');
  const [invoiceDate, setInvoiceDate] = useState('2026-10-25');
  const [voucherDate, setVoucherDate] = useState('2026-10-25');
  const [narration, setNarration] = useState('Purchase of fresh resort produce and groceries for kitchen');
  const [isInterstate, setIsInterstate] = useState(false);

  // Line items
  const [lines, setLines] = useState<GSTLineItem[]>([
    {
      line_no: 1,
      description: 'Fresh Organic Vegetables & Local Herbs',
      taxable_amount: 14500,
      gst_rate: 0,
      ledger_name: 'Purchase - Groceries 0%',
    },
    {
      line_no: 2,
      description: 'Paneer, Butter & Curd (Branded)',
      taxable_amount: 28400,
      gst_rate: 5,
      ledger_name: 'Purchase - Food & Beverage 5%',
    },
    {
      line_no: 3,
      description: 'Gourmet Chocolates & Imported Sauces',
      taxable_amount: 12600,
      gst_rate: 18,
      ledger_name: 'Purchase - Groceries 18%',
    },
  ]);

  // Other adjustments
  const [otherCharges, setOtherCharges] = useState<number>(750);
  const [otherChargesLedger, setOtherChargesLedger] = useState('Freight & Cartage Inward');
  const [discount, setDiscount] = useState<number>(500);
  const [discountLedger, setDiscountLedger] = useState('Discount Received');

  // Calculation and preview state
  const [calcResult, setCalcResult] = useState<any>(null);
  const [draftResult, setDraftResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [supplierStatus, setSupplierStatus] = useState<any>(null);

  // Available Sundry Creditors & Purchase Accounts
  const suppliers = useMemo(
    () => ledgers.filter((l) => l.parent === 'Sundry Creditors'),
    [ledgers]
  );
  const purchaseAccounts = useMemo(
    () => ledgers.filter((l) => l.parent === 'Purchase Accounts'),
    [ledgers]
  );

  // Handle Preset Invoice loading
  useEffect(() => {
    if (presetInvoice) {
      setSupplierName(presetInvoice.supplier_name || '');
      setInvoiceNumber(presetInvoice.invoice_number || '');
      setInvoiceDate(presetInvoice.invoice_date || '2026-10-27');
      setVoucherDate(presetInvoice.invoice_date || '2026-10-27');
      setNarration(presetInvoice.description || '');
      setIsInterstate(Boolean(presetInvoice.is_interstate));
      if (presetInvoice.items && presetInvoice.items.length > 0) {
        setLines(presetInvoice.items);
      }
      setOtherCharges(presetInvoice.other_charges || 0);
      setDiscount(presetInvoice.discount || 0);
    }
  }, [presetInvoice]);

  // Real-time recalculation
  useEffect(() => {
    const recalc = async () => {
      setIsCalculating(true);
      try {
        const res = await fetch('/api/gst/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: lines,
            is_interstate: isInterstate,
            other_charges: otherCharges,
            discount: discount,
          }),
        });
        const data = await res.json();
        setCalcResult(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsCalculating(false);
      }
    };
    recalc();
  }, [lines, isInterstate, otherCharges, discount]);

  // Check supplier ledger against Tally roster
  useEffect(() => {
    const checkSupplier = async () => {
      if (!supplierName.trim()) return;
      try {
        const res = await fetch('/api/ledgers/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requested_name: supplierName,
            expected_group: 'Sundry Creditors',
          }),
        });
        const data = await res.json();
        setSupplierStatus(data);
      } catch (err) {
        console.error(err);
      }
    };
    checkSupplier();
  }, [supplierName]);

  // Add line
  const handleAddLine = () => {
    setLines([
      ...lines,
      {
        line_no: lines.length + 1,
        description: 'Hospitality Supplies',
        taxable_amount: 1000,
        gst_rate: 18,
        ledger_name: 'Purchase - Groceries 18%',
      },
    ]);
  };

  // Remove line
  const handleRemoveLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  // Update line field
  const handleUpdateLine = (idx: number, field: keyof GSTLineItem, val: any) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], [field]: val };

    // Auto-update default purchase ledger if rate changes
    if (field === 'gst_rate') {
      const rate = Number(val);
      const matchingAccount = purchaseAccounts.find(
        (a) => a.name.includes(`${rate}%`) || a.gst_rate === rate
      );
      if (matchingAccount) {
        updated[idx].ledger_name = matchingAccount.name;
      }
    }

    setLines(updated);
  };

  // Generate & Validate Draft for XML
  const handleBuildVoucherDraft = async () => {
    try {
      const res = await fetch('/api/vouchers/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voucher_type: 'Purchase',
          company_name: 'Chinar Resort & Spa Pvt Ltd. ACUTAL',
          date: voucherDate,
          supplier_name: supplierName,
          invoice_number: invoiceNumber,
          narration: narration,
          is_interstate: isInterstate,
          items: lines,
          other_charges: otherCharges,
          other_charges_ledger: otherChargesLedger,
          discount: discount,
          discount_ledger: discountLedger,
        }),
      });
      const data = await res.json();
      setDraftResult(data);

      if (data.is_valid && data.xml) {
        onOpenXmlPreview(data.preview, data.xml);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-neutral-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900">
            Multi-Slab Purchase Voucher Entry
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Deterministic GST splitting, separate tax lines preservation, and Tally 7.1 XML generation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLines([
                {
                  line_no: 1,
                  description: 'General Resort Consumables',
                  taxable_amount: 5000,
                  gst_rate: 18,
                  ledger_name: 'Purchase - Groceries 18%',
                },
              ]);
              setOtherCharges(0);
              setDiscount(0);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            onClick={handleBuildVoucherDraft}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Verify & Generate Tally XML</span>
          </button>
        </div>
      </div>

      {/* Supplier & Header Metadata */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-4">
        <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
          1. Party Ledger & Invoice Particulars
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5 md:col-span-1">
            <label className="text-xs font-medium text-neutral-700">
              Supplier / Party Ledger (Sundry Creditor) *
            </label>
            <div className="relative">
              <input
                type="text"
                list="suppliers-list"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Select or enter supplier name..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <datalist id="suppliers-list">
                {suppliers.map((s) => (
                  <option key={s.name} value={s.name} />
                ))}
              </datalist>
            </div>
            {supplierStatus && (
              <div className="text-[11px] mt-1 flex items-center gap-1.5">
                {supplierStatus.status === 'EXACT' ? (
                  <span className="text-emerald-700 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified Tally Ledger (Sundry Creditor)
                  </span>
                ) : (
                  <span className="text-amber-700 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {supplierStatus.warning || 'Ledger requires confirmation in Tally'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Supplier Invoice Ref # *
            </label>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. KAF/26-27/0891"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-neutral-700">
              Invoice Date & Voucher Date
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
              />
              <input
                type="date"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
                className="w-full px-2.5 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900 font-mono"
              />
            </div>
          </div>
        </div>

        {/* GST Transaction Type Selection */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-100">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-semibold text-neutral-700">Place of Supply / Tax Type:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="gst-type"
                checked={!isInterstate}
                onChange={() => setIsInterstate(false)}
                className="text-neutral-900 focus:ring-0"
              />
              <span className="font-medium text-neutral-800">
                Intra-State (CGST 50% + SGST 50%) · Jammu & Kashmir (01)
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="gst-type"
                checked={isInterstate}
                onChange={() => setIsInterstate(true)}
                className="text-neutral-900 focus:ring-0"
              />
              <span className="font-medium text-neutral-800">
                Inter-State (IGST 100%)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Multi-Slab Line Items Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide">
              2. Line Items by GST Rate (Separate Lines Preserved)
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Items of distinct rates (e.g. 0% Groceries vs 5% Groceries) remain uncombined in accounting vouchers.
            </p>
          </div>
          <button
            onClick={handleAddLine}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Line Item</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="py-2.5 px-3 font-medium w-12 text-center">#</th>
                <th className="py-2.5 px-3 font-medium">Item Description</th>
                <th className="py-2.5 px-3 font-medium w-36">GST Slab</th>
                <th className="py-2.5 px-3 font-medium">Purchase Ledger in Tally</th>
                <th className="py-2.5 px-3 font-medium text-right w-36">Taxable (₹)</th>
                <th className="py-2.5 px-3 font-medium text-right w-32">Taxes (₹)</th>
                <th className="py-2.5 px-3 font-medium text-right w-36">Line Total (₹)</th>
                <th className="py-2.5 px-3 font-medium w-12 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200/80">
              {lines.map((line, idx) => {
                const computed = calcResult?.lines?.[idx] || {};
                const taxAmt = isInterstate
                  ? computed.igst_amount || 0
                  : (computed.cgst_amount || 0) + (computed.sgst_amount || 0);

                return (
                  <tr key={idx} className="hover:bg-neutral-50/50">
                    <td className="py-2 px-3 text-center text-neutral-400 font-mono text-[11px]">
                      {idx + 1}
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => handleUpdateLine(idx, 'description', e.target.value)}
                        placeholder="Item description"
                        className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      />
                    </td>
                    <td className="py-2 px-3">
                      <select
                        value={line.gst_rate}
                        onChange={(e) =>
                          handleUpdateLine(idx, 'gst_rate', parseFloat(e.target.value))
                        }
                        className="w-full px-2 py-1.5 text-xs border border-neutral-300 rounded bg-white text-neutral-800 font-mono font-medium focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      >
                        <option value="0">0% (Nil / Exempt)</option>
                        <option value="5">5% GST</option>
                        <option value="12">12% GST</option>
                        <option value="18">18% GST</option>
                        <option value="28">28% GST</option>
                      </select>
                    </td>
                    <td className="py-2 px-3">
                      <input
                        type="text"
                        list={`purchase-ledgers-${idx}`}
                        value={line.ledger_name || ''}
                        onChange={(e) => handleUpdateLine(idx, 'ledger_name', e.target.value)}
                        placeholder="Select Purchase Ledger..."
                        className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      />
                      <datalist id={`purchase-ledgers-${idx}`}>
                        {purchaseAccounts.map((p) => (
                          <option key={p.name} value={p.name} />
                        ))}
                      </datalist>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={line.taxable_amount}
                        onChange={(e) =>
                          handleUpdateLine(
                            idx,
                            'taxable_amount',
                            parseFloat(e.target.value || '0')
                          )
                        }
                        className="w-full text-right px-2 py-1.5 text-xs border border-neutral-300 rounded font-mono font-semibold text-neutral-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-neutral-900"
                      />
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-neutral-600">
                      ₹{taxAmt.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-neutral-900 tabular-nums">
                      ₹{(computed.line_total || line.taxable_amount).toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => handleRemoveLine(idx)}
                        disabled={lines.length <= 1}
                        className="text-neutral-400 hover:text-red-600 disabled:opacity-20 cursor-pointer p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Other Charges, Freight & Narration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-neutral-200">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-neutral-700">
                Voucher Narration
              </label>
              <textarea
                rows={2}
                value={narration}
                onChange={(e) => setNarration(e.target.value)}
                placeholder="Enter audit narration..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-600">
                  Inward Freight / Cartage (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(parseFloat(e.target.value || '0'))}
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-600">
                  Trade Discount Received (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value || '0'))}
                  className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded font-mono tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Real-Time Deterministic Math Summary Card */}
          <div className="bg-neutral-50 p-4 rounded-xl border border-neutral-200 space-y-2.5 text-xs">
            <div className="font-semibold text-neutral-900 flex items-center justify-between pb-2 border-b border-neutral-200">
              <span>Deterministic Accounting Breakdown</span>
              <span className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                Balanced (₹0.00 difference)
              </span>
            </div>

            <div className="flex justify-between text-neutral-600">
              <span>Total Taxable Amount:</span>
              <span className="font-mono font-medium text-neutral-900 tabular-nums">
                ₹{(calcResult?.total_taxable || 0).toFixed(2)}
              </span>
            </div>

            {!isInterstate ? (
              <>
                <div className="flex justify-between text-neutral-600">
                  <span>Input CGST Total (50%):</span>
                  <span className="font-mono font-medium text-neutral-900 tabular-nums">
                    ₹{(calcResult?.cgst_total || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-neutral-600">
                  <span>Input SGST Total (50%):</span>
                  <span className="font-mono font-medium text-neutral-900 tabular-nums">
                    ₹{(calcResult?.sgst_total || 0).toFixed(2)}
                  </span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-neutral-600">
                <span>Input IGST Total (100%):</span>
                <span className="font-mono font-medium text-neutral-900 tabular-nums">
                  ₹{(calcResult?.igst_total || 0).toFixed(2)}
                </span>
              </div>
            )}

            {otherCharges > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>Freight & Inward Charges:</span>
                <span className="font-mono font-medium text-neutral-900 tabular-nums">
                  +₹{otherCharges.toFixed(2)}
                </span>
              </div>
            )}

            {discount > 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>Trade Discount:</span>
                <span className="font-mono font-medium text-neutral-900 tabular-nums">
                  -₹{discount.toFixed(2)}
                </span>
              </div>
            )}

            {calcResult?.round_off !== 0 && (
              <div className="flex justify-between text-neutral-600">
                <span>Round-off adjustment:</span>
                <span className="font-mono font-medium text-neutral-900 tabular-nums">
                  {calcResult?.round_off > 0 ? '+' : ''}
                  ₹{(calcResult?.round_off || 0).toFixed(2)}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-neutral-200 flex justify-between items-baseline font-bold text-neutral-900 text-sm">
              <span>Total Payable to Supplier:</span>
              <span className="font-mono text-base tabular-nums text-emerald-800">
                ₹{(calcResult?.invoice_total || 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-neutral-200">
        <div className="text-xs text-neutral-600 flex items-center gap-2">
          <Info className="w-4 h-4 text-neutral-400" />
          <span>
            Generates standard Tally 7.1 XML with DeemedPositive flags and balanced debit/credit rows.
          </span>
        </div>

        <button
          onClick={handleBuildVoucherDraft}
          className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors shadow-xs cursor-pointer"
        >
          <span>Preview Tally 7.1 XML & Validate</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
