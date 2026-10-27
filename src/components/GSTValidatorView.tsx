import React, { useState, useEffect } from 'react';
import {
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Info,
  Scale,
  RefreshCw,
} from 'lucide-react';

export const GSTValidatorView: React.FC = () => {
  const [taxableAmount, setTaxableAmount] = useState<number>(28400);
  const [rate, setRate] = useState<number>(5);
  const [isInterstate, setIsInterstate] = useState<boolean>(false);
  const [otherCharges, setOtherCharges] = useState<number>(0);
  const [discount, setDiscount] = useState<number>(0);
  const [expectedTotal, setExpectedTotal] = useState<string>('29820');

  const [validationResult, setValidationResult] = useState<any>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const runValidation = async () => {
    setIsValidating(true);
    try {
      const res = await fetch('/api/gst/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              description: 'Sample GST Validation Line',
              taxable_amount: taxableAmount,
              gst_rate: rate,
            },
          ],
          is_interstate: isInterstate,
          other_charges: otherCharges,
          discount: discount,
          expected_total: expectedTotal ? parseFloat(expectedTotal) : null,
        }),
      });
      const data = await res.json();
      setValidationResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsValidating(false);
    }
  };

  useEffect(() => {
    runValidation();
  }, [taxableAmount, rate, isInterstate, otherCharges, discount, expectedTotal]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-neutral-200">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900">
          Deterministic GST Calculator & Invariant Validator
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Precision Decimal financial arithmetic with zero floating-point error · Enforces GST Act 2017 rules
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Input Form */}
        <div className="lg:col-span-5 bg-white p-6 rounded-xl border border-neutral-200 space-y-4">
          <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            <span>Invoice Values & Tax Parameters</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="space-y-1">
              <label className="font-medium text-neutral-700">Taxable Base Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                value={taxableAmount}
                onChange={(e) => setTaxableAmount(parseFloat(e.target.value || '0'))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono font-semibold text-neutral-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
            </div>

            <div className="space-y-1">
              <label className="font-medium text-neutral-700">Applicable GST Rate *</label>
              <select
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white font-mono font-semibold text-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              >
                <option value="0">0% (Nil / Exempt Supply)</option>
                <option value="5">5% (e.g. Packaged Dairy, Hotel Rooms &lt; ₹1,000, Restaurant F&B)</option>
                <option value="12">12% (e.g. Ayurvedic Oils, Guest Laundry, Spa Equipment)</option>
                <option value="18">18% (e.g. Standard Hospitality Services, Banquet, Processed Foods)</option>
                <option value="28">28% (e.g. Aerated Beverages, Luxury Fixtures)</option>
              </select>
            </div>

            <div className="space-y-1 pt-1">
              <label className="font-medium text-neutral-700">Transaction Type / Place of Supply</label>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsInterstate(false)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                    !isInterstate
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  Intra-State (CGST + SGST)
                </button>
                <button
                  type="button"
                  onClick={() => setIsInterstate(true)}
                  className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-colors cursor-pointer ${
                    isInterstate
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
                  }`}
                >
                  Inter-State (IGST)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Freight & Inward Charges (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={otherCharges}
                  onChange={(e) => setOtherCharges(parseFloat(e.target.value || '0'))}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded font-mono tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="font-medium text-neutral-700">Trade Discount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(parseFloat(e.target.value || '0'))}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1 pt-1">
              <label className="font-medium text-neutral-700">
                Supplier Billed Total to Verify (₹)
              </label>
              <input
                type="number"
                step="0.01"
                value={expectedTotal}
                onChange={(e) => setExpectedTotal(e.target.value)}
                placeholder="Enter total printed on invoice to test discrepancy..."
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono text-neutral-900 tabular-nums focus:outline-none focus:ring-1 focus:ring-neutral-900"
              />
              <span className="text-[11px] text-neutral-500">
                Validates whether vendor's printed figure matches deterministic accounting rules.
              </span>
            </div>
          </div>
        </div>

        {/* Right: Validation Proof & Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-6 rounded-xl border border-neutral-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
              <h2 className="text-xs font-bold text-neutral-900 uppercase tracking-wide flex items-center gap-2">
                <Scale className="w-4 h-4 text-emerald-700" />
                <span>Deterministic Verification Output</span>
              </h2>
              {validationResult?.is_balanced ? (
                <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Exact Mathematical Balance Verified
                </span>
              ) : (
                <span className="text-xs font-semibold text-red-800 bg-red-50 px-2.5 py-1 rounded flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Discrepancy Detected
                </span>
              )}
            </div>

            {/* Error alerts */}
            {validationResult?.errors && validationResult.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 space-y-1">
                {validationResult.errors.map((err: string, i: number) => (
                  <div key={i}>• {err}</div>
                ))}
              </div>
            )}

            {/* Step-by-step audit table */}
            <div className="space-y-3 text-xs">
              <div className="p-4 bg-neutral-50 rounded-lg space-y-2 border border-neutral-200/80">
                <div className="flex justify-between">
                  <span className="text-neutral-600">Base Taxable Amount:</span>
                  <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                    ₹{taxableAmount.toFixed(2)}
                  </span>
                </div>

                {!isInterstate ? (
                  <>
                    <div className="flex justify-between text-neutral-700">
                      <span>Central Tax (CGST) @ {(rate / 2).toFixed(1)}%:</span>
                      <span className="font-mono tabular-nums">
                        ₹{(validationResult?.cgst_total || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-neutral-700">
                      <span>State Tax (SGST) @ {(rate / 2).toFixed(1)}%:</span>
                      <span className="font-mono tabular-nums">
                        ₹{(validationResult?.sgst_total || 0).toFixed(2)}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-neutral-700">
                    <span>Integrated Tax (IGST) @ {rate}%:</span>
                    <span className="font-mono tabular-nums">
                      ₹{(validationResult?.igst_total || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                {otherCharges > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>Inward Freight:</span>
                    <span className="font-mono tabular-nums">+₹{otherCharges.toFixed(2)}</span>
                  </div>
                )}

                {discount > 0 && (
                  <div className="flex justify-between text-neutral-700">
                    <span>Discount:</span>
                    <span className="font-mono tabular-nums">-₹{discount.toFixed(2)}</span>
                  </div>
                )}

                {validationResult?.round_off !== 0 && (
                  <div className="flex justify-between text-neutral-600 text-[11px]">
                    <span>Round-Off adjustment (to nearest integer):</span>
                    <span className="font-mono tabular-nums">
                      {validationResult?.round_off > 0 ? '+' : ''}₹
                      {(validationResult?.round_off || 0).toFixed(2)}
                    </span>
                  </div>
                )}

                <div className="pt-2 border-t border-neutral-200 flex justify-between font-bold text-neutral-900 text-sm">
                  <span>Computed Payable Total:</span>
                  <span className="font-mono text-base tabular-nums text-emerald-800">
                    ₹{(validationResult?.invoice_total || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Accounting explanation box */}
              <div className="p-4 bg-white rounded-lg border border-neutral-200 space-y-1.5 text-neutral-600 text-[11px] leading-relaxed">
                <div className="font-semibold text-neutral-900 text-xs flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-neutral-500" />
                  <span>GST Accounting Rule Reference</span>
                </div>
                <div>
                  <strong>Intra-State:</strong> Both supplier and resort are located within Jammu & Kashmir (01).
                  Tax liability is split equally into <strong>CGST (50%)</strong> and <strong>SGST (50%)</strong>.
                </div>
                <div>
                  <strong>Inter-State:</strong> Supplier is located in another State (e.g. Delhi 07, Punjab 03).
                  Entire liability flows to <strong>IGST (100%)</strong>.
                </div>
                <div>
                  <strong>Deterministic Decimal Precision:</strong> Calculations never use binary floating-point.
                  Rounding follows statutory <code>ROUND_HALF_UP</code> rules.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
