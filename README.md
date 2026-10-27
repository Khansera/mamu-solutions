# Tally 7.1 AI Assistant — OpenRouter AI + Tally 7.1

A production-grade, local accounting assistant and integration bridge connecting **Tally 7.1** running on **Windows 10** to **OpenRouter API** (with models like `openai/gpt-4o-mini`, `anthropic/claude-3.5-haiku`, `deepseek/deepseek-chat`, `meta-llama/llama-3.3-70b-instruct`) and Google's Gemini API, with zero paid OpenAI direct subscription required.

Built specifically for **Chinar Resort & Spa Pvt Ltd. ACUTAL** with GST enabled and ~240 verified ledgers, featuring **Bulk Ingestion (Excel, CSV, XML, JSON)**, **AI Bank Statement Counter-Ledger Matching**, and **Pure Automation Review**.

---

## 1. Key Architectural Principles

- **Bulk Upload Studio (Excel/XML/JSON):** Ingest Bank Statements, Purchase Registers, and Sales Invoices in bulk from `.xlsx`, `.xls`, `.csv`, `.xml`, or `.json`.
- **AI Bank Statement Matching:** AI automatically reads unformatted bank narrations (e.g. `NEFT KPDCL ELECTRICITY` -> `Electricity Charges - Resort Complex`, `RTGS MAKEMYTRIP PAYOUT` -> `MakeMyTrip India Pvt Ltd`) and maps counterparty ledgers with confidence scores.
- **Pure Automation Review:** Multi-step pipeline: Upload -> AI Suggestions -> Batch Review & Override -> Automated Debit/Credit Balancing -> Multi-Voucher Tally 7.1 XML Envelope Generation -> Safe Import.
- **Deterministic Financial Invariants:** Tax arithmetic, split CGST/SGST (50/50), inter-state IGST, trade discounts, freight charges, and round-off adjustments are computed strictly using Python `Decimal` arithmetic. AI is used solely for natural-language extraction and user guidance.
- **Ledger-Aware Accounting:** Matching engine inspects actual Tally 7.1 ledgers and groups before generating vouchers. Exact matches and potential candidate matches are categorized separately; **automatic ledger creation and silent substitutions are strictly prohibited**.
- **Tally 7.1 XML Schema Conformity:** Adheres to Tally 7.1 XML envelope standards (`<ENVELOPE><HEADER><TALLYREQUEST>...`), `YYYYMMDD` date formatting, supplier invoice reference preservation, and `ISDEEMEDPOSITIVE` sign conventions (`Yes` for Debits, `No` for Credits).
- **Lightweight 8 GB RAM Footprint:** Combined backend and frontend run in under 350 MB RAM, leaving >7.5 GB for Tally 7.1, Windows system processes, and browser tabs.

---

## 2. Windows 10 Installation & Quick Start

### Prerequisites
- Windows 10 (64-bit)
- Tally 7.1 installed with company **"Chinar Resort & Spa Pvt Ltd. ACUTAL"**
- Python 3.10+ ([python.org](https://www.python.org/downloads/) — ensure *"Add Python to PATH"* is checked)
- Node.js 18+ ([nodejs.org](https://nodejs.org/))

---

### Step 1: Enable Tally 7.1 XML Server Mode (Port 9000)
1. Launch **Tally 7.1** on Windows 10.
2. Load company: **Chinar Resort & Spa Pvt Ltd. ACUTAL**.
3. Press `F12` (Configure) on your keyboard.
4. Select **Advanced Configuration**.
5. Set **"Tally is acting as"** to **Both** or **Server**.
6. Set **"Port"** to **9000**.
7. Press `Ctrl + A` or accept to save.
8. **Restart Tally 7.1** for the port changes to take effect.

---

### Step 2: Test Tally 7.1 XML Port in PowerShell
Open Windows PowerShell and run:
```powershell
.\scripts\test_tally.ps1
```

---

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```powershell
Copy-Item .env.example .env
```
Open `.env` and set:
```ini
# OpenRouter API Configuration (Primary)
OPENROUTER_API_KEY="sk-or-v1-YOUR_KEY_HERE"
OPENROUTER_MODEL="openai/gpt-4o-mini"
AI_PROVIDER="openrouter"

# Tally 7.1 Endpoint & Target Company
TALLY_URL="http://localhost:9000"
TARGET_COMPANY="Chinar Resort & Spa Pvt Ltd. ACUTAL"
TALLY_WRITE_ENABLED="false"
```
TARGET_COMPANY="Chinar Resort & Spa Pvt Ltd. ACUTAL"
TALLY_WRITE_ENABLED="false"
```
*Note: `TALLY_WRITE_ENABLED` defaults strictly to `false` (Draft-Only mode). Set to `true` only after testing imports in a backup/test company.*

---

### Step 4: Run the Accounting Test Suite
Verify that all deterministic GST calculations, balancing rules, and XML generation pass:
```powershell
python -m unittest discover -s backend/tests -v
```
All 10 unit tests will run and verify:
- Intra-state 50/50 CGST & SGST splitting
- Inter-state 100% IGST computation
- Multi-slab invoice line preservation (0%, 5%, 18%)
- Fractional paisa round-off adjustments
- Debit = Credit balance equality (₹0.00 difference)
- Tally 7.1 XML envelope generation & date format `YYYYMMDD`

---

### Step 5: Start the Application

#### Option A: One-Click PowerShell Launcher
```powershell
.\scripts\start.ps1
```

#### Option B: Manual Launch
In Terminal 1 (Python FastAPI Backend):
```powershell
pip install -r requirements.txt
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

In Terminal 2 (React Vite Frontend & Express Bridge):
```powershell
npm install
npm run dev
```

Open your browser to: **http://localhost:3000**

---

## 3. Application Walkthrough & Features

### A. Accounting Dashboard
- Live status indicator showing connectivity to Tally 7.1 on `http://localhost:9000`.
- If Tally is offline, automatically activates high-fidelity **Test Fixture Mode** loaded with verified data for **Chinar Resort & Spa Pvt Ltd. ACUTAL** (240+ ledgers).
- Quick KPI metrics: Ledger count, Voucher count, GST Compliance status (01-J&K).

### B. Multi-Slab Purchase Voucher Entry
- Enter or select supplier (Sundry Creditor).
- Real-time ledger matching flags whether the party name exists in Tally.
- Add line items with independent GST rates (0%, 5%, 12%, 18%, 28%).
- Load pre-configured sample resort invoices with 1 click:
  - **Kashmir Agro Food Suppliers:** Fresh produce (0%) + Branded dairy (5%) + Gourmet pantry (18%).
  - **Shalimar Spa Botanicals:** Inter-state Delhi procurement of Ayurvedic oils (IGST 12%, 18%).
  - **Himalayan Clean & Care Linens:** Egyptian cotton sheets (5%) + Royal suite cushion covers (12%).
- Real-time deterministic recalculation of CGST, SGST, IGST, freight, and net payable.

### C. Tally 7.1 XML Studio & Balancing Preview
- Click **"Verify & Generate Tally XML"** to inspect:
  - Every ledger entry, debit/credit assignment, and `ISDEEMEDPOSITIVE` flag.
  - Zero-difference debit/credit balance proof (`Debit Sum == Credit Sum`).
  - Formatted raw Tally 7.1 XML envelope ready for import.
- Download `.xml` file or copy directly to clipboard.
- **Safe Import Pipeline:** Requires explicit checkbox confirmation before sending any write request to Tally.

### D. Ledger Roster & Searchable Engine
- Browse all ~240 ledgers categorized by Parent Group:
  - Sundry Creditors (Kashmir Agro, Shalimar Spa, Dal Lake Fresh Dairy, etc.)
  - Sundry Debtors (MakeMyTrip, Booking.com, Cox & Kings, Corporate Clients)
  - Duties & Taxes (Input/Output CGST, SGST, IGST at 2.5%, 6%, 9%, 14%)
  - Purchase Accounts & Hotel Operations (F&B, Linens, Spa, Boiler Fuel, Electricity)
  - Bank Accounts (J&K Bank Main Current A/c, State Bank of India)
- Test arbitrary supplier names against the matching engine to review exact matches vs candidate matches vs uncreated ledgers.
- Export full ledger roster to CSV.

### E. Reconciliation & Duplicate Detection
- Upload vendor statements or purchase registers (CSV).
- Deterministically identifies:
  - Missing vouchers not yet entered into Tally
  - Tax or total amount discrepancies
  - Duplicate invoice references
- Export current Tally voucher register to CSV.

### F. Gemini AI Assistant
- Chat interface connected to `gemini-3.8-flash` via server-side proxy.
- Answers questions about company ledgers, tax rules, and invoice data extraction.
- **Strict Boundary:** AI explanations clearly demarcate `[VERIFIED TALLY DATA]` vs `[USER INPUT]` vs `[ASSUMPTIONS]`. Arithmetic and balancing remain in deterministic code.

---

## 4. Troubleshooting Guide

| Issue | Cause | Resolution |
| :--- | :--- | :--- |
| **`Connection Refused (WinError 10061)`** | Tally 7.1 is not running or Server mode is disabled | Open Tally 7.1 > F12 > Advanced Configuration > Set "Tally is acting as: Server" and "Port: 9000". Restart Tally. |
| **`Tally Import Returns Status 0`** | Ledger name mismatch or unbalanced voucher | Inspect the XML preview in Tally XML Studio. Ensure all ledger names match existing Tally ledgers exactly. |
| **`Gemini Quota Exceeded (HTTP 429)`** | Free-tier rate limit reached | Wait 60 seconds. Note: Free tier quotas reset regularly. Core accounting features (Ledgers, GST, XML) work 100% offline without AI. |
| **`High RAM Usage on Windows 10`** | Too many background processes | The application backend uses <350 MB RAM. Ensure dev server runs with `vite --host=127.0.0.1` and close unneeded browser tabs. |

---

## 5. Security & Isolation

- **Localhost Binding:** FastAPI binds strictly to `127.0.0.1:8000`. Tally port 9000 is never exposed to external networks.
- **Zero API Key Leaks:** `GEMINI_API_KEY` is read strictly server-side from local `.env`. It is never bundled into client JavaScript.
- **Untrusted AI Boundary:** AI output cannot directly invoke shell commands or write to the database. Every write operation requires explicit user approval.
