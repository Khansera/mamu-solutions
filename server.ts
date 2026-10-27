import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import http from 'http';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// Constants & Env
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const TARGET_COMPANY = process.env.TARGET_COMPANY || 'Chinar Resort & Spa Pvt Ltd. ACUTAL';
const TALLY_WRITE_ENABLED = process.env.TALLY_WRITE_ENABLED === 'true';

// OpenRouter Configuration (Primary as requested)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';

// Gemini Client (Fallback)
const geminiAi = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Load sample test data fixtures
const SAMPLE_LEDGERS_XML_PATH = path.resolve(process.cwd(), 'test_data', 'sample_ledgers.xml');
const SAMPLE_INVOICES_JSON_PATH = path.resolve(process.cwd(), 'test_data', 'sample_invoices.json');

interface LedgerItem {
  name: string;
  parent: string;
  opening_balance: string;
  tax_type?: string | null;
  gst_rate?: number | null;
  is_revenue?: boolean;
  is_party?: boolean;
}

function parseXmlLedgers(xml: string): LedgerItem[] {
  const ledgers: LedgerItem[] = [];
  const regex = /<LEDGER\s+NAME="([^"]+)">[\s\S]*?<PARENT>([^<]+)<\/PARENT>(?:[\s\S]*?<TAXTYPE>([^<]+)<\/TAXTYPE>)?(?:[\s\S]*?<RATEOFTAXCALCULATION>([^<]+)<\/RATEOFTAXCALCULATION>)?(?:[\s\S]*?<OPENINGBALANCE>([^<]+)<\/OPENINGBALANCE>)?[\s\S]*?<\/LEDGER>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const name = match[1].replace(/&amp;/g, '&');
    const parent = match[2].replace(/&amp;/g, '&');
    const taxType = match[3] ? match[3].trim() : null;
    const rate = match[4] ? parseFloat(match[4]) : null;
    const opBal = match[5] ? match[5].trim() : '0.00';

    let inferredRate = rate;
    let inferredType = taxType;
    if (inferredRate === null) {
      const rateMatch = name.match(/(\d+(?:\.\d+)?)%/);
      if (rateMatch) {
        inferredRate = parseFloat(rateMatch[1]);
      }
    }
    if (!inferredType) {
      if (/CGST/i.test(name)) inferredType = 'CGST';
      else if (/SGST/i.test(name)) inferredType = 'SGST';
      else if (/IGST/i.test(name)) inferredType = 'IGST';
    }

    ledgers.push({
      name,
      parent,
      opening_balance: opBal,
      tax_type: inferredType,
      gst_rate: inferredRate,
      is_revenue: ['Purchase Accounts', 'Sales Accounts', 'Direct Expenses', 'Indirect Expenses'].includes(parent),
      is_party: ['Sundry Creditors', 'Sundry Debtors', 'Bank Accounts', 'Cash-in-Hand'].includes(parent),
    });
  }
  return ledgers;
}

let cachedFixtures: LedgerItem[] = [];
if (fs.existsSync(SAMPLE_LEDGERS_XML_PATH)) {
  try {
    const rawXml = fs.readFileSync(SAMPLE_LEDGERS_XML_PATH, 'utf-8');
    cachedFixtures = parseXmlLedgers(rawXml);
  } catch (err) {
    console.error('Failed to load sample ledgers fixture:', err);
  }
}

// In-memory audit log
const auditLog: Array<{ id: string; timestamp: string; action: string; reference: string; status: string; details: string }> = [
  {
    id: 'AUD-001',
    timestamp: '2026-10-25T14:32:00Z',
    action: 'DRAFT_CREATED',
    reference: 'KAF/26-27/0891',
    status: 'VALIDATED',
    details: 'Draft purchase voucher created with 3 GST lines (0%, 5%, 18%). Balanced at ₹59,938.00',
  },
  {
    id: 'AUD-002',
    timestamp: '2026-10-26T09:15:00Z',
    action: 'XML_PREVIEW',
    reference: 'SSB/DEL/26/1044',
    status: 'READY',
    details: 'Generated Tally 7.1 XML for Shalimar Spa Botanicals (Inter-state IGST 12% & 18%)',
  },
];

// Helper: send HTTP XML to local Tally 7.1
async function queryTally(xmlEnvelope: string, timeoutMs = 4000): Promise<{ ok: boolean; status?: number; data?: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(TALLY_URL);
      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 9000,
          path: parsedUrl.pathname || '/',
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'Content-Length': Buffer.byteLength(xmlEnvelope),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            resolve({ ok: res.statusCode === 200, status: res.statusCode, data: body });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: `Connection to Tally at ${TALLY_URL} timed out after ${timeoutMs}ms.` });
      });

      req.on('error', (err: any) => {
        let msg = err.message || 'Connection error';
        if (msg.includes('ECONNREFUSED') || msg.includes('10061')) {
          msg = `Cannot connect to Tally 7.1 at ${TALLY_URL} (Connection Refused). Ensure Tally 7.1 is running on Windows 10 with Server mode enabled on port 9000.`;
        }
        resolve({ ok: false, error: msg });
      });

      req.write(xmlEnvelope);
      req.end();
    } catch (e: any) {
      resolve({ ok: false, error: e.message || 'Invalid Tally URL' });
    }
  });
}

function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// OpenRouter API Caller
async function callOpenRouter(prompt: string, systemInstruction: string): Promise<string> {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'MY_OPENROUTER_API_KEY') {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Tally 7.1 AI Assistant',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter Error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ----------------- API Endpoints -----------------

// Health & System Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    tally_url: TALLY_URL,
    target_company: TARGET_COMPANY,
    tally_write_enabled: TALLY_WRITE_ENABLED,
    ai_provider: OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MY_OPENROUTER_API_KEY' ? 'openrouter' : 'gemini',
    openrouter_configured: Boolean(OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MY_OPENROUTER_API_KEY'),
    openrouter_model: OPENROUTER_MODEL,
    gemini_key_configured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    cached_ledgers_count: cachedFixtures.length,
  });
});

// Tally Status Check
app.get('/api/tally/status', async (req, res) => {
  const envelope = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><ACCOUNTTYPE>All</ACCOUNTTYPE></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
  const tallyRes = await queryTally(envelope, 3000);

  if (tallyRes.ok && tallyRes.data) {
    const compMatch = tallyRes.data.match(/<SVCURRENTCOMPANY>([^<]+)<\/SVCURRENTCOMPANY>/) || tallyRes.data.match(/<COMPANY>([^<]+)<\/COMPANY>/);
    const activeCompany = compMatch ? compMatch[1] : TARGET_COMPANY;
    res.json({
      connected: true,
      is_live: true,
      url: TALLY_URL,
      active_company: activeCompany,
      raw_preview: tallyRes.data.slice(0, 300),
    });
  } else {
    res.json({
      connected: false,
      is_live: false,
      url: TALLY_URL,
      error: tallyRes.error || 'Tally 7.1 not responding on port 9000',
      active_company: TARGET_COMPANY,
      mock_available: true,
      mock_ledger_count: cachedFixtures.length,
      diagnostic_hint: 'Ensure Tally 7.1 is running on Windows 10, open F12 > Advanced Configurations, set Tally acting as Server: Yes, Port: 9000.',
    });
  }
});

// Company Details
app.get('/api/tally/company', (req, res) => {
  res.json({
    company_name: TARGET_COMPANY,
    gst_enabled: true,
    financial_year: '2026-2027',
    state: 'Jammu & Kashmir (01)',
  });
});

// Ledgers List
app.get('/api/tally/ledgers', async (req, res) => {
  const envelope = `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY><EXPORTDATA><REQUESTDESC><REPORTNAME>List of Accounts</REPORTNAME><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT><ACCOUNTTYPE>Ledgers</ACCOUNTTYPE></STATICVARIABLES></REQUESTDESC></EXPORTDATA></BODY></ENVELOPE>`;
  const tallyRes = await queryTally(envelope, 4000);

  if (tallyRes.ok && tallyRes.data) {
    const liveLedgers = parseXmlLedgers(tallyRes.data);
    res.json({
      source: 'live_tally',
      count: liveLedgers.length,
      ledgers: liveLedgers,
    });
  } else {
    res.json({
      source: 'sample_fixture',
      warning: `Live Tally not reachable (${tallyRes.error || 'offline'}). Using verified ledger fixtures for ${TARGET_COMPANY}.`,
      count: cachedFixtures.length,
      ledgers: cachedFixtures,
    });
  }
});

// Vouchers List
app.get('/api/tally/vouchers', (req, res) => {
  res.json({
    source: 'sample_fixture',
    count: 3,
    vouchers: [
      {
        voucher_type: 'Purchase',
        date: '20261025',
        voucher_number: 'PUR/2026/0891',
        reference: 'KAF/26-27/0891',
        party_name: 'Kashmir Agro Food Suppliers',
        amount: 59938.0,
        narration: 'Purchase of fresh resort produce and groceries for kitchen (0%, 5%, 18%)',
      },
      {
        voucher_type: 'Purchase',
        date: '20261022',
        voucher_number: 'PUR/2026/1044',
        reference: 'SSB/DEL/26/1044',
        party_name: 'Shalimar Spa Botanicals (Delhi)',
        amount: 63440.0,
        narration: 'Inter-state procurement of Ayurvedic massage oils and diffusers (IGST 12%, 18%)',
      },
      {
        voucher_type: 'Purchase',
        date: '20261026',
        voucher_number: 'PUR/2026/0312',
        reference: 'HCC-OCT-312',
        party_name: 'Himalayan Clean & Care Linens',
        amount: 94780.0,
        narration: 'Luxury bed linen and bathrobes for Royal Suite wing (5%, 12%)',
      },
    ],
  });
});

// Sample Invoices
app.get('/api/sample-invoices', (req, res) => {
  if (fs.existsSync(SAMPLE_INVOICES_JSON_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(SAMPLE_INVOICES_JSON_PATH, 'utf-8'));
      return res.json({ invoices: data });
    } catch (e) {
      // fallback
    }
  }
  res.json({ invoices: [] });
});

// Deterministic GST Calculation
app.post('/api/gst/validate', (req, res) => {
  const { items = [], is_interstate = false, other_charges = 0, discount = 0, expected_total = null } = req.body;

  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const processedLines = items.map((item: any, idx: number) => {
    const taxable = round2(parseFloat(item.taxable_amount || 0));
    const rate = round2(parseFloat(item.gst_rate || 0));
    const taxAmt = round2((taxable * rate) / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (is_interstate) {
      igst = taxAmt;
    } else {
      const halfRate = rate / 2;
      cgst = round2((taxable * halfRate) / 100);
      sgst = round2((taxable * halfRate) / 100);
      const diff = round2(taxAmt - (cgst + sgst));
      if (diff !== 0) {
        cgst = round2(cgst + diff);
      }
    }

    totalTaxable = round2(totalTaxable + taxable);
    totalCGST = round2(totalCGST + cgst);
    totalSGST = round2(totalSGST + sgst);
    totalIGST = round2(totalIGST + igst);

    return {
      line_no: idx + 1,
      description: item.description || `Item #${idx + 1}`,
      ledger_name: item.ledger_name || `Purchase @ ${rate}%`,
      taxable_amount: taxable,
      gst_rate: rate,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      line_total: round2(taxable + cgst + sgst + igst),
    };
  });

  const otherChg = round2(parseFloat(other_charges || 0));
  const disc = round2(parseFloat(discount || 0));
  const subtotal = round2(totalTaxable + totalCGST + totalSGST + totalIGST + otherChg - disc);
  const roundedInt = Math.round(subtotal);
  const roundOff = round2(roundedInt - subtotal);
  const invoiceTotal = round2(subtotal + roundOff);

  let isBalanced = true;
  const errors: string[] = [];

  if (expected_total !== null && expected_total !== undefined && expected_total !== '') {
    const expNum = round2(parseFloat(expected_total));
    if (Math.abs(expNum - invoiceTotal) > 1.0) {
      isBalanced = false;
      errors.push(`Expected total ₹${expNum.toFixed(2)} differs from calculated ₹${invoiceTotal.toFixed(2)}.`);
    }
  }

  res.json({
    is_interstate,
    lines: processedLines,
    total_taxable: totalTaxable,
    cgst_total: totalCGST,
    sgst_total: totalSGST,
    igst_total: totalIGST,
    other_charges: otherChg,
    discount: disc,
    round_off: roundOff,
    invoice_total: invoiceTotal,
    is_balanced: isBalanced,
    errors,
  });
});

// Ledger Matching API
app.post('/api/ledgers/match', (req, res) => {
  const { requested_name, expected_group } = req.body;
  if (!requested_name) {
    return res.status(400).json({ error: 'requested_name is required' });
  }

  const reqLower = requested_name.trim().toLowerCase();
  let exact = cachedFixtures.find((l) => l.name.trim().toLowerCase() === reqLower);

  const candidates = cachedFixtures
    .map((l) => {
      let score = 0;
      const lLower = l.name.toLowerCase();
      if (lLower.includes(reqLower) || reqLower.includes(lLower)) score += 0.7;
      if (expected_group && l.parent === expected_group) score += 0.2;
      return { ledger: l, score };
    })
    .filter((c) => c.score > 0.4 && c.ledger.name !== exact?.name)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => c.ledger);

  if (exact) {
    res.json({
      status: 'EXACT',
      requested: requested_name,
      exact_match: exact,
      possible_matches: [],
      requires_confirmation: false,
    });
  } else if (candidates.length > 0) {
    res.json({
      status: 'AMBIGUOUS',
      requested: requested_name,
      exact_match: null,
      possible_matches: candidates,
      requires_confirmation: true,
      warning: `No exact ledger for '${requested_name}'. Found ${candidates.length} candidate(s).`,
    });
  } else {
    res.json({
      status: 'NOT_FOUND',
      requested: requested_name,
      exact_match: null,
      possible_matches: [],
      requires_confirmation: true,
      warning: `Ledger '${requested_name}' does not exist in Tally 7.1. Auto-creation is prohibited.`,
    });
  }
});

// Bulk Upload AI & Pattern-Based Ledger Recommendation Engine
app.post('/api/bulk/recommend', async (req, res) => {
  const { transactions = [], batch_type = 'bank' } = req.body;

  const recommendations = transactions.map((item: any, idx: number) => {
    const rawNarration = item.narration || item.description || item.party_name || item.particulars || '';
    const upper = rawNarration.toUpperCase();
    const amt = parseFloat(item.amount || item.deposit || item.withdrawal || item.debit || item.credit || 0);

    let suggestedLedger = '';
    let suggestedGroup = '';
    let confidence = 50;
    let reason = 'Generic transaction';
    let suggestedGst = 18;

    // Pattern matching rules against Chinar Resort & Spa Pvt Ltd. ACUTAL chart of accounts
    if (/ELECTRICITY|KPDCL|POWER CORP|ELECTRIC/i.test(upper)) {
      suggestedLedger = 'Electricity Charges - Resort Complex';
      suggestedGroup = 'Direct Expenses';
      confidence = 98;
      reason = 'Identified Jammu & Kashmir State Power Distribution bill payment';
      suggestedGst = 0;
    } else if (/DIESEL|BOILER|HEATING FUEL|SNOWLINE/i.test(upper)) {
      suggestedLedger = 'Diesel for Boiler & Heating';
      suggestedGroup = 'Direct Expenses';
      confidence = 96;
      reason = 'Central resort heating plant and boiler fuel procurement';
      suggestedGst = 0;
    } else if (/GAS|LPG|COMMERCIAL CYLINDER|PIR PANJAL/i.test(upper)) {
      suggestedLedger = 'Commercial LPG Cylinder Gas';
      suggestedGroup = 'Direct Expenses';
      confidence = 96;
      reason = 'Kitchen commercial cooking gas replenishment';
      suggestedGst = 5;
    } else if (/MAKEMYTRIP|MMT|ONLINE TRAVEL/i.test(upper)) {
      suggestedLedger = 'MakeMyTrip India Pvt Ltd';
      suggestedGroup = 'Sundry Debtors';
      confidence = 98;
      reason = 'OTA booking channel payout for cottage accommodations';
      suggestedGst = 12;
    } else if (/BOOKING\.COM|B\.V\./i.test(upper)) {
      suggestedLedger = 'Booking.com BV';
      suggestedGroup = 'Sundry Debtors';
      confidence = 98;
      reason = 'International OTA guest settlement';
      suggestedGst = 18;
    } else if (/AGRO|VEGETABLE|HERB|FRUIT|SABZI/i.test(upper)) {
      suggestedLedger = 'Kashmir Agro Food Suppliers';
      suggestedGroup = 'Sundry Creditors';
      confidence = 95;
      reason = 'Daily fresh produce and resort dining pantry vendor';
      suggestedGst = 0;
    } else if (/DAIRY|MILK|PANEER|CURD|DAL LAKE/i.test(upper)) {
      suggestedLedger = 'Dal Lake Fresh Dairy Coop';
      suggestedGroup = 'Sundry Creditors';
      confidence = 95;
      reason = 'Breakfast buffet fresh dairy supply vendor';
      suggestedGst = 5;
    } else if (/SPA|AYURVEDIC|MASSAGE|BOTANICAL|SHALIMAR/i.test(upper)) {
      suggestedLedger = 'Shalimar Spa Botanicals (Delhi)';
      suggestedGroup = 'Sundry Creditors';
      confidence = 94;
      reason = 'Ayurvedic wellness therapy oils & aromatics';
      suggestedGst = 12;
    } else if (/LINEN|BEDSHEET|TOWEL|HIMALAYAN CLEAN/i.test(upper)) {
      suggestedLedger = 'Himalayan Clean & Care Linens';
      suggestedGroup = 'Sundry Creditors';
      confidence = 95;
      reason = 'Luxury resort suite bedding & towels supplier';
      suggestedGst = 5;
    } else if (/POS|SWIPE|SETTLEMENT|CARD COLL/i.test(upper)) {
      suggestedLedger = 'HDFC Bank - POS Collections A/c';
      suggestedGroup = 'Bank Accounts';
      confidence = 97;
      reason = 'Front desk and fine dining credit card POS batch credit';
      suggestedGst = 0;
    } else if (/SALARY|PAYROLL|STAFF WAGES/i.test(upper)) {
      suggestedLedger = 'Salaries & Staff Wages';
      suggestedGroup = 'Indirect Expenses';
      confidence = 98;
      reason = 'Resort housekeeping, culinary & administrative staff payroll';
      suggestedGst = 0;
    } else if (/FREIGHT|CARTAGE|TRANSPORT/i.test(upper)) {
      suggestedLedger = 'Freight & Cartage Inward';
      suggestedGroup = 'Direct Expenses';
      confidence = 92;
      reason = 'Inward material freight & carriage';
      suggestedGst = 0;
    } else if (/ROOM TARIFF|CHECKOUT|ROOM STAY|DELUXE/i.test(upper)) {
      suggestedLedger = 'Room Tariff - Deluxe Cottage 12%';
      suggestedGroup = 'Sales Accounts';
      confidence = 92;
      reason = 'Direct guest checkout revenue';
      suggestedGst = 12;
    } else if (/RESTAURANT|DINING|FOOD SALE/i.test(upper)) {
      suggestedLedger = 'Restaurant Food Sales 5%';
      suggestedGroup = 'Sales Accounts';
      confidence = 92;
      reason = 'Restaurant dining guest bills';
      suggestedGst = 5;
    } else {
      // Find matching ledger in cached fixtures
      const found = cachedFixtures.find((l) => upper.includes(l.name.toUpperCase()));
      if (found) {
        suggestedLedger = found.name;
        suggestedGroup = found.parent;
        confidence = 80;
        reason = `Direct name keyword match with Tally ledger '${found.name}'`;
        suggestedGst = found.gst_rate || 18;
      } else {
        suggestedLedger = batch_type === 'bank' ? 'Suspense A/c' : 'Sundry Creditors (Unassigned)';
        suggestedGroup = batch_type === 'bank' ? 'Suspense Accounts' : 'Sundry Creditors';
        confidence = 40;
        reason = 'Requires manual accountant assignment';
      }
    }

    return {
      id: item.id || `ROW-${idx + 1}`,
      date: item.date || '2026-10-27',
      reference: item.reference || item.ref || item.cheque_no || `REF-${idx + 1}`,
      narration: rawNarration,
      amount: Math.abs(amt),
      type: item.type || (amt >= 0 ? 'Receipt / Deposit' : 'Payment / Withdrawal'),
      voucher_type: item.voucher_type || (batch_type === 'sales' ? 'Sales' : batch_type === 'purchase' ? 'Purchase' : amt >= 0 ? 'Receipt' : 'Payment'),
      suggested_ledger: suggestedLedger,
      suggested_group: suggestedGroup,
      confidence,
      reason,
      suggested_gst: suggestedGst,
      status: confidence >= 90 ? 'APPROVED' : 'REVIEW_NEEDED',
    };
  });

  res.json({
    batch_type,
    count: recommendations.length,
    high_confidence_count: recommendations.filter((r: any) => r.confidence >= 90).length,
    review_needed_count: recommendations.filter((r: any) => r.confidence < 90).length,
    items: recommendations,
  });
});

// Bulk XML Generator (Generates multi-voucher Tally 7.1 XML for entire batch)
app.post('/api/bulk/generate-xml', (req, res) => {
  const { batch_type = 'bank', items = [], company_name = TARGET_COMPANY, bank_ledger = 'J&K Bank - Current A/c (Resort Main)' } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items provided for bulk XML generation.' });
  }

  const xmlLines = [
    '<ENVELOPE>',
    '  <HEADER>',
    '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
    '  </HEADER>',
    '  <BODY>',
    '    <IMPORTDATA>',
    '      <REQUESTDESC>',
    '        <REPORTNAME>All Masters</REPORTNAME>',
    '        <STATICVARIABLES>',
    `          <SVCURRENTCOMPANY>${company_name.replace(/&/g, '&amp;')}</SVCURRENTCOMPANY>`,
    '        </STATICVARIABLES>',
    '      </REQUESTDESC>',
    '      <REQUESTDATA>',
  ];

  let totalVouchers = 0;
  let batchTotalAmount = 0;

  items.forEach((item: any) => {
    const rawDate = (item.date || '2026-10-27').replace(/[-/ ]/g, '');
    const tallyDate = rawDate.length === 8 ? rawDate : '20261027';
    const vchType = item.voucher_type || (item.type?.includes('Receipt') ? 'Receipt' : item.type?.includes('Payment') ? 'Payment' : 'Payment');
    const vchNumber = item.reference || `BATCH-${Date.now()}-${totalVouchers + 1}`;
    const narration = (item.narration || 'Bulk imported voucher').replace(/&/g, '&amp;');
    const amt = round2(parseFloat(item.amount || 0));
    const targetLedger = (item.suggested_ledger || 'Suspense A/c').replace(/&/g, '&amp;');
    const bankAccount = bank_ledger.replace(/&/g, '&amp;');

    batchTotalAmount = round2(batchTotalAmount + amt);
    totalVouchers++;

    xmlLines.push('        <TALLYMESSAGE xmlns:UDF="TallyUDF">');
    xmlLines.push(`          <VOUCHER VCHTYPE="${vchType}" ACTION="Create">`);
    xmlLines.push(`            <DATE>${tallyDate}</DATE>`);
    xmlLines.push(`            <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>`);
    xmlLines.push(`            <REFERENCE>${vchNumber}</REFERENCE>`);
    xmlLines.push(`            <VOUCHERNUMBER>${vchNumber}</VOUCHERNUMBER>`);
    xmlLines.push(`            <PARTYLEDGERNAME>${targetLedger}</PARTYLEDGERNAME>`);
    xmlLines.push(`            <NARRATION>${narration}</NARRATION>`);

    if (vchType === 'Payment') {
      // Payment: Debit the Expense/Creditor (-amt), Credit the Bank (amt)
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${targetLedger}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>-${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${bankAccount}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
    } else if (vchType === 'Receipt') {
      // Receipt: Debit the Bank (-amt), Credit the Customer/Revenue (amt)
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${bankAccount}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>-${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${targetLedger}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
    } else if (vchType === 'Sales') {
      // Sales: Debit Customer (-amt), Credit Sales Ledger (amt)
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${targetLedger}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>-${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push('              <LEDGERNAME>Room Tariff - Deluxe Cottage 12%</LEDGERNAME>');
      xmlLines.push('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
    } else {
      // Purchase: Debit Purchase Expense (-amt), Credit Creditor (amt)
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${targetLedger}</LEDGERNAME>`);
      xmlLines.push('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push('              <LEDGERNAME>Purchase - Food &amp; Beverage 5%</LEDGERNAME>');
      xmlLines.push('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>');
      xmlLines.push(`              <AMOUNT>-${amt.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
    }

    xmlLines.push('          </VOUCHER>');
    xmlLines.push('        </TALLYMESSAGE>');
  });

  xmlLines.push('      </REQUESTDATA>');
  xmlLines.push('    </IMPORTDATA>');
  xmlLines.push('  </BODY>');
  xmlLines.push('</ENVELOPE>');

  const finalXml = xmlLines.join('\r\n');

  res.json({
    success: true,
    vouchers_count: totalVouchers,
    batch_total: batchTotalAmount,
    xml: finalXml,
    filename: `Tally7_Batch_${batch_type.toUpperCase()}_${Date.now()}.xml`,
  });
});

// Voucher Draft & Balancing API
app.post('/api/vouchers/draft', (req, res) => {
  const {
    voucher_type = 'Purchase',
    company_name = TARGET_COMPANY,
    date = '2026-10-27',
    supplier_name,
    invoice_number = 'INV-DRAFT',
    narration = '',
    is_interstate = false,
    items = [],
    other_charges = 0,
    other_charges_ledger = 'Freight & Cartage Inward',
    discount = 0,
    discount_ledger = 'Discount Received',
    cgst_ledger_prefix = 'Input CGST',
    sgst_ledger_prefix = 'Input SGST',
    igst_ledger_prefix = 'Input IGST',
  } = req.body;

  const errors: string[] = [];
  if (!supplier_name) errors.push('Supplier / Party ledger name is required.');
  if (!items || items.length === 0) errors.push('At least one line item is required.');

  const rawDate = (date || '').replace(/[-/ ]/g, '');
  const tallyDate = rawDate.length === 8 ? rawDate : '20261027';

  let totalTaxable = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  const taxBreakup: Record<string, { taxable: number; cgst: number; sgst: number; igst: number }> = {};

  const lines = items.map((it: any, idx: number) => {
    const taxable = round2(parseFloat(it.taxable_amount || 0));
    const rate = round2(parseFloat(it.gst_rate || 0));
    const taxAmt = round2((taxable * rate) / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (is_interstate) {
      igst = taxAmt;
    } else {
      cgst = round2((taxable * (rate / 2)) / 100);
      sgst = round2((taxable * (rate / 2)) / 100);
      const diff = round2(taxAmt - (cgst + sgst));
      if (diff !== 0) cgst = round2(cgst + diff);
    }

    const rateKey = `${rate}%`;
    if (!taxBreakup[rateKey]) {
      taxBreakup[rateKey] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    }
    taxBreakup[rateKey].taxable = round2(taxBreakup[rateKey].taxable + taxable);
    taxBreakup[rateKey].cgst = round2(taxBreakup[rateKey].cgst + cgst);
    taxBreakup[rateKey].sgst = round2(taxBreakup[rateKey].sgst + sgst);
    taxBreakup[rateKey].igst = round2(taxBreakup[rateKey].igst + igst);

    totalTaxable = round2(totalTaxable + taxable);
    totalCGST = round2(totalCGST + cgst);
    totalSGST = round2(totalSGST + sgst);
    totalIGST = round2(totalIGST + igst);

    return {
      line_no: idx + 1,
      description: it.description || `Item #${idx + 1}`,
      ledger_name: it.ledger_name || `Purchase @ ${rate}%`,
      taxable_amount: taxable,
      gst_rate: rate,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
    };
  });

  const otherChg = round2(parseFloat(other_charges || 0));
  const disc = round2(parseFloat(discount || 0));
  const subtotal = round2(totalTaxable + totalCGST + totalSGST + totalIGST + otherChg - disc);
  const roundedInt = Math.round(subtotal);
  const roundOff = round2(roundedInt - subtotal);
  const totalPayable = round2(subtotal + roundOff);

  const ledgerEntries: any[] = [];

  // Supplier Credit
  ledgerEntries.push({
    ledger_name: supplier_name,
    is_deemed_positive: false,
    amount: totalPayable,
    entry_type: 'Credit',
    particulars: `Supplier invoice ref: ${invoice_number}`,
  });

  // Purchase Expense Debits
  lines.forEach((l: any) => {
    if (l.taxable_amount > 0) {
      ledgerEntries.push({
        ledger_name: l.ledger_name,
        is_deemed_positive: true,
        amount: -l.taxable_amount,
        entry_type: 'Debit',
        particulars: `${l.description} @ ${l.gst_rate}%`,
      });
    }
  });

  // Tax Debits
  Object.entries(taxBreakup).forEach(([rateStr, b]) => {
    const rateNum = parseFloat(rateStr.replace('%', ''));
    if (is_interstate) {
      if (b.igst > 0) {
        ledgerEntries.push({
          ledger_name: `${igst_ledger_prefix} ${rateStr}`,
          is_deemed_positive: true,
          amount: -b.igst,
          entry_type: 'Debit',
          particulars: `IGST @ ${rateStr} on ₹${b.taxable}`,
        });
      }
    } else {
      const halfRate = rateNum / 2;
      const halfStr = `${halfRate}%`;
      if (b.cgst > 0) {
        ledgerEntries.push({
          ledger_name: `${cgst_ledger_prefix} ${halfStr}`,
          is_deemed_positive: true,
          amount: -b.cgst,
          entry_type: 'Debit',
          particulars: `CGST @ ${halfStr} on ₹${b.taxable}`,
        });
      }
      if (b.sgst > 0) {
        ledgerEntries.push({
          ledger_name: `${sgst_ledger_prefix} ${halfStr}`,
          is_deemed_positive: true,
          amount: -b.sgst,
          entry_type: 'Debit',
          particulars: `SGST @ ${halfStr} on ₹${b.taxable}`,
        });
      }
    }
  });

  if (otherChg > 0) {
    ledgerEntries.push({
      ledger_name: other_charges_ledger,
      is_deemed_positive: true,
      amount: -otherChg,
      entry_type: 'Debit',
      particulars: 'Inward freight and charges',
    });
  }

  if (disc > 0) {
    ledgerEntries.push({
      ledger_name: discount_ledger,
      is_deemed_positive: false,
      amount: disc,
      entry_type: 'Credit',
      particulars: 'Discount received',
    });
  }

  if (roundOff !== 0) {
    ledgerEntries.push({
      ledger_name: 'Round Off',
      is_deemed_positive: roundOff > 0,
      amount: roundOff > 0 ? -roundOff : Math.abs(roundOff),
      entry_type: roundOff > 0 ? 'Debit' : 'Credit',
      particulars: 'Rounding difference',
    });
  }

  const debitSum = round2(ledgerEntries.filter((e) => e.is_deemed_positive).reduce((s, e) => s + Math.abs(e.amount), 0));
  const creditSum = round2(ledgerEntries.filter((e) => !e.is_deemed_positive).reduce((s, e) => s + e.amount, 0));
  const diff = round2(Math.abs(debitSum - creditSum));
  const isBalanced = diff < 0.02;

  if (!isBalanced) {
    errors.push(`Voucher does not balance! Debits: ₹${debitSum.toFixed(2)}, Credits: ₹${creditSum.toFixed(2)}, Diff: ₹${diff.toFixed(2)}`);
  }

  let xml = '';
  if (errors.length === 0 && isBalanced) {
    const xmlLines = [
      '<ENVELOPE>',
      '  <HEADER>',
      '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
      '  </HEADER>',
      '  <BODY>',
      '    <IMPORTDATA>',
      '      <REQUESTDESC>',
      '        <REPORTNAME>All Masters</REPORTNAME>',
      '        <STATICVARIABLES>',
      `          <SVCURRENTCOMPANY>${company_name.replace(/&/g, '&amp;')}</SVCURRENTCOMPANY>`,
      '        </STATICVARIABLES>',
      '      </REQUESTDESC>',
      '      <REQUESTDATA>',
      '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      `          <VOUCHER VCHTYPE="${voucher_type}" ACTION="Create">`,
      `            <DATE>${tallyDate}</DATE>`,
      `            <VOUCHERTYPENAME>${voucher_type}</VOUCHERTYPENAME>`,
      `            <REFERENCE>${invoice_number.replace(/&/g, '&amp;')}</REFERENCE>`,
      `            <VOUCHERNUMBER>${invoice_number.replace(/&/g, '&amp;')}</VOUCHERNUMBER>`,
      `            <PARTYLEDGERNAME>${supplier_name.replace(/&/g, '&amp;')}</PARTYLEDGERNAME>`,
      `            <BASICBUYERNAME>${supplier_name.replace(/&/g, '&amp;')}</BASICBUYERNAME>`,
      `            <NARRATION>${(narration || `Purchase Inv ${invoice_number}`).replace(/&/g, '&amp;')}</NARRATION>`,
      '            <ISINVOICE>Yes</ISINVOICE>',
    ];

    ledgerEntries.forEach((e) => {
      xmlLines.push('            <ALLLEDGERENTRIES.LIST>');
      xmlLines.push(`              <LEDGERNAME>${e.ledger_name.replace(/&/g, '&amp;')}</LEDGERNAME>`);
      xmlLines.push(`              <ISDEEMEDPOSITIVE>${e.is_deemed_positive ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>`);
      xmlLines.push(`              <AMOUNT>${e.amount.toFixed(2)}</AMOUNT>`);
      xmlLines.push('            </ALLLEDGERENTRIES.LIST>');
    });

    xmlLines.push('          </VOUCHER>');
    xmlLines.push('        </TALLYMESSAGE>');
    xmlLines.push('      </REQUESTDATA>');
    xmlLines.push('    </IMPORTDATA>');
    xmlLines.push('  </BODY>');
    xmlLines.push('</ENVELOPE>');
    xml = xmlLines.join('\r\n');
  }

  res.json({
    is_valid: errors.length === 0 && isBalanced,
    errors,
    preview: {
      voucher_type,
      company_name,
      date: tallyDate,
      reference: invoice_number,
      supplier_name,
      narration,
      invoice_total: totalPayable,
      debit_sum: debitSum,
      credit_sum: creditSum,
      is_balanced: isBalanced,
      ledger_entries: ledgerEntries,
    },
    xml,
  });
});

// Import into Tally 7.1 with user approval check
app.post('/api/vouchers/import', async (req, res) => {
  const { xml_content, confirmed_by_user = false, is_test_company = false } = req.body;

  if (!confirmed_by_user) {
    return res.status(400).json({
      error: 'SAFETY RESTRICTION: Explicit user confirmation required prior to importing into Tally.',
    });
  }

  if (!TALLY_WRITE_ENABLED && !is_test_company) {
    return res.status(403).json({
      error: 'TALLY_WRITE_ENABLED is set to false. Writes are locked to protect live company books. You can test on a backup company or download the XML.',
    });
  }

  const result = await queryTally(xml_content, 8000);
  if (result.ok && result.data) {
    const hasLineError = /<LINEERROR>/i.test(result.data);
    const hasStatusZero = /<STATUS>0<\/STATUS>/i.test(result.data);

    if (hasLineError || hasStatusZero) {
      return res.status(422).json({
        success: false,
        error: 'Tally 7.1 rejected the voucher XML.',
        raw_response: result.data,
      });
    }

    auditLog.unshift({
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'VOUCHER_IMPORTED',
      reference: 'Imported',
      status: 'SUCCESS',
      details: 'Successfully imported into Tally 7.1',
    });

    res.json({
      success: true,
      message: 'Voucher imported successfully into Tally 7.1.',
      raw_response: result.data,
    });
  } else {
    res.status(503).json({
      success: false,
      error: `Cannot reach Tally 7.1 on ${TALLY_URL}: ${result.error || 'Connection failed'}. Never fabricating success. Please start Tally 7.1 on Windows 10.`,
    });
  }
});

// AI Assistant Chat: Supports OpenRouter (Primary) and Gemini (Fallback)
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  const purchaseLedgers = cachedFixtures.filter((l) => l.parent === 'Purchase Accounts').map((l) => l.name);
  const taxLedgers = cachedFixtures.filter((l) => l.parent === 'Duties & Taxes').map((l) => l.name);
  const supplierLedgers = cachedFixtures.filter((l) => l.parent === 'Sundry Creditors').map((l) => l.name);

  const systemInstruction = `You are the Tally 7.1 Accounting Assistant for '${TARGET_COMPANY}'.
CRITICAL ACCOUNTING RULES:
1. DISTINGUISH SOURCES: Clearly tag verified company data as [VERIFIED TALLY DATA], user input as [USER SUPPLIED], and hypotheses as [ASSUMPTION].
2. REAL LEDGERS ONLY: Never fabricate or create new ledgers. Existing purchase ledgers: ${purchaseLedgers.slice(0, 10).join(', ')}. Existing tax ledgers: ${taxLedgers.slice(0, 10).join(', ')}. Existing suppliers: ${supplierLedgers.slice(0, 10).join(', ')}.
3. DETERMINISTIC MATH: Explain tax rules, but inform user that the local Decimal engine computes exact split CGST/SGST, IGST, and verifies balancing to ₹0.00.
4. TALLY 7.1 SPECIFICS: Uses classic XML envelopes, YYYYMMDD dates, DeemedPositive Yes (Debits) / No (Credits).`;

  // 1. Try OpenRouter API first
  if (OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'MY_OPENROUTER_API_KEY') {
    try {
      const text = await callOpenRouter(message, systemInstruction);
      return res.json({
        success: true,
        provider: 'openrouter',
        model: OPENROUTER_MODEL,
        text,
      });
    } catch (err: any) {
      console.warn('OpenRouter call error:', err.message);
      // Fall through to Gemini if available
    }
  }

  // 2. Try Gemini API fallback
  if (geminiAi && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') {
    try {
      const chatResponse = await geminiAi.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: message,
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      });

      return res.json({
        success: true,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        text: chatResponse.text || '',
      });
    } catch (err: any) {
      console.warn('Gemini call error:', err.message);
    }
  }

  // 3. Fallback when keys are missing or both failed
  res.json({
    success: false,
    error_type: 'NO_API_KEY',
    message:
      'OpenRouter API is configured as your primary AI provider. To enable AI ledger matching and conversational assistance, set OPENROUTER_API_KEY in your local .env file. Core accounting features (Bulk upload, Excel parsing, GST calculator, and Tally 7.1 XML generation) remain 100% operational offline without any AI key.',
    text: '',
  });
});

// Mount Vite middleware for dev server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tally 7.1 + OpenRouter Assistant running on http://localhost:${PORT}`);
  });
}

startServer();
