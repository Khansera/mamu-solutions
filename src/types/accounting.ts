export interface LedgerItem {
  name: string;
  parent: string;
  opening_balance: string;
  tax_type?: string | null;
  gst_rate?: number | null;
  is_revenue?: boolean;
  is_party?: boolean;
}

export interface GSTLineItem {
  line_no?: number;
  description: string;
  taxable_amount: number;
  gst_rate: number;
  ledger_name?: string;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  line_total?: number;
}

export interface GSTCalculationResult {
  is_interstate: boolean;
  lines: GSTLineItem[];
  total_taxable: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  other_charges: number;
  discount: number;
  round_off: number;
  invoice_total: number;
  is_balanced: boolean;
  errors: string[];
}

export interface LedgerEntryRow {
  ledger_name: string;
  is_deemed_positive: boolean;
  amount: number;
  entry_type: 'Debit' | 'Credit';
  particulars: string;
}

export interface VoucherPreview {
  voucher_type: string;
  company_name: string;
  date: string;
  reference: string;
  supplier_name: string;
  narration: string;
  invoice_total: number;
  debit_sum: number;
  credit_sum: number;
  is_balanced: boolean;
  ledger_entries: LedgerEntryRow[];
}

export interface VoucherRecord {
  voucher_type: string;
  date: string;
  voucher_number: string;
  reference: string;
  party_name: string;
  amount: number;
  narration: string;
}

export interface TallyStatus {
  connected: boolean;
  is_live?: boolean;
  url: string;
  active_company: string;
  error?: string;
  mock_available?: boolean;
  mock_ledger_count?: number;
  diagnostic_hint?: string;
}

export interface AuditItem {
  id: string;
  timestamp: string;
  action: string;
  reference: string;
  status: string;
  details: string;
}
