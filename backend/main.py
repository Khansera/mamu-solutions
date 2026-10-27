"""
FastAPI application backend for Tally 7.1 + OpenRouter AI Assistant.
Runs locally on Windows 10 with lightweight footprint (8GB RAM friendly).
Binds to 127.0.0.1 for maximum local security.
Supports Bulk Upload (Excel/XML/JSON), AI Bank Ledger Recommendations, and Safe Tally Import.
"""
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import os
import xml.etree.ElementTree as ET

from .config import (
    TALLY_URL,
    TARGET_COMPANY,
    TALLY_WRITE_ENABLED,
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    AI_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    MOCK_FALLBACK
)
from .tally_client import Tally7Client, TallyClientError
from .gst_calculator import calculate_and_validate_gst, to_decimal
from .xml_generator import VoucherDraft, escape_xml, format_tally_date
from .ledger_matcher import match_ledger, batch_match_voucher_ledgers
from .ai_service import call_ai, recommend_bulk_ledgers

app = FastAPI(
    title="Tally 7.1 + OpenRouter Accounting Bridge",
    description="Local integration bridge and AI assistant for Tally 7.1 with bulk Excel/XML/JSON upload and zero paid OpenAI API dependencies.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = Tally7Client(base_url=TALLY_URL)

SAMPLE_LEDGERS_PATH = os.path.join(os.path.dirname(__file__), "..", "test_data", "sample_ledgers.xml")


def get_cached_or_sample_ledgers() -> List[Dict[str, Any]]:
    if os.path.exists(SAMPLE_LEDGERS_PATH):
        try:
            tree = ET.parse(SAMPLE_LEDGERS_PATH)
            return client._parse_ledgers_xml(tree.getroot())
        except Exception:
            pass
    return []


# --- Pydantic Request Models ---

class GSTValidateRequest(BaseModel):
    items: List[Dict[str, Any]]
    is_interstate: bool = False
    other_charges: float = 0.0
    discount: float = 0.0
    expected_total: Optional[float] = None


class VoucherDraftRequest(BaseModel):
    voucher_type: str = "Purchase"
    company_name: Optional[str] = None
    date: str = "2026-10-27"
    supplier_name: str
    invoice_number: str
    narration: str = ""
    is_interstate: bool = False
    items: List[Dict[str, Any]]
    other_charges: float = 0.0
    other_charges_ledger: str = "Freight & Cartage Inward"
    discount: float = 0.0
    discount_ledger: str = "Discount Received"
    cgst_ledger_prefix: str = "Input CGST"
    sgst_ledger_prefix: str = "Input SGST"
    igst_ledger_prefix: str = "Input IGST"


class VoucherImportRequest(BaseModel):
    xml_content: str
    confirmed_by_user: bool = False
    target_company: Optional[str] = None
    is_test_company: bool = False


class AIChatRequest(BaseModel):
    message: str
    history: Optional[List[Dict[str, str]]] = None


class LedgerMatchRequest(BaseModel):
    requested_name: str
    expected_group: Optional[str] = None


class BulkRecommendRequest(BaseModel):
    transactions: List[Dict[str, Any]]
    batch_type: str = "bank"


class BulkGenerateXmlRequest(BaseModel):
    batch_type: str = "bank"
    items: List[Dict[str, Any]]
    company_name: Optional[str] = None
    bank_ledger: str = "J&K Bank - Current A/c (Resort Main)"


# --- API Endpoints ---

@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "Tally 7.1 + OpenRouter Bridge",
        "tally_url": TALLY_URL,
        "write_enabled": TALLY_WRITE_ENABLED,
        "ai_provider": AI_PROVIDER,
        "openrouter_configured": bool(OPENROUTER_API_KEY and OPENROUTER_API_KEY != "MY_OPENROUTER_API_KEY"),
        "openrouter_model": OPENROUTER_MODEL,
        "gemini_key_configured": bool(GEMINI_API_KEY and GEMINI_API_KEY != "MY_GEMINI_API_KEY")
    }


@app.get("/api/tally/status")
def tally_status():
    result = client.test_connection()
    if not result["connected"] and MOCK_FALLBACK:
        sample_ledgers = get_cached_or_sample_ledgers()
        result["mock_available"] = True
        result["mock_company"] = TARGET_COMPANY
        result["mock_ledger_count"] = len(sample_ledgers)
    return result


@app.get("/api/tally/company")
def tally_company():
    res = client.test_connection()
    if res["connected"]:
        return {"company_name": res["active_company"], "is_live": True}
    elif MOCK_FALLBACK:
        return {"company_name": TARGET_COMPANY, "is_live": False, "is_mock": True}
    else:
        raise HTTPException(status_code=503, detail=f"Tally not reachable: {res.get('error')}")


@app.get("/api/tally/ledgers")
def tally_ledgers():
    try:
        ledgers = client.get_ledgers()
        return {"source": "live_tally", "count": len(ledgers), "ledgers": ledgers}
    except Exception as e:
        if MOCK_FALLBACK:
            sample = get_cached_or_sample_ledgers()
            return {
                "source": "sample_fixture",
                "warning": f"Tally live connection failed ({str(e)}). Loaded Chinar Resort & Spa test fixtures.",
                "count": len(sample),
                "ledgers": sample
            }
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/tally/vouchers")
def tally_vouchers(from_date: str = "20260401", to_date: str = "20261027"):
    try:
        vouchers = client.get_vouchers(from_date=from_date, to_date=to_date)
        return {"source": "live_tally", "count": len(vouchers), "vouchers": vouchers}
    except Exception as e:
        if MOCK_FALLBACK:
            return {
                "source": "sample_fixture",
                "warning": f"Live Tally query failed ({str(e)}). Showing verified draft history.",
                "count": 2,
                "vouchers": [
                    {
                        "voucher_type": "Purchase",
                        "date": "20261025",
                        "voucher_number": "PUR/2026/0891",
                        "reference": "KAF/26-27/0891",
                        "party_name": "Kashmir Agro Food Suppliers",
                        "amount": 59938.00,
                        "narration": "Purchase of fresh resort produce and groceries for kitchen"
                    },
                    {
                        "voucher_type": "Purchase",
                        "date": "20261022",
                        "voucher_number": "PUR/2026/1044",
                        "reference": "SSB/DEL/26/1044",
                        "party_name": "Shalimar Spa Botanicals (Delhi)",
                        "amount": 63440.00,
                        "narration": "Inter-state procurement of Ayurvedic massage oils and diffusers"
                    }
                ]
            }
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/gst/validate")
def gst_validate(req: GSTValidateRequest):
    res = calculate_and_validate_gst(
        items=req.items,
        is_interstate=req.is_interstate,
        other_charges=req.other_charges,
        discount=req.discount,
        expected_total=req.expected_total
    )
    return res.to_dict()


@app.post("/api/vouchers/draft")
def voucher_draft(req: VoucherDraftRequest):
    company = req.company_name or TARGET_COMPANY
    draft = VoucherDraft(
        voucher_type=req.voucher_type,
        company_name=company,
        date_str=req.date,
        supplier_name=req.supplier_name,
        invoice_number=req.invoice_number,
        narration=req.narration,
        items=req.items,
        is_interstate=req.is_interstate,
        other_charges=req.other_charges,
        other_charges_ledger=req.other_charges_ledger,
        discount=req.discount,
        discount_ledger=req.discount_ledger,
        cgst_ledger_prefix=req.cgst_ledger_prefix,
        sgst_ledger_prefix=req.sgst_ledger_prefix,
        igst_ledger_prefix=req.igst_ledger_prefix
    )

    is_valid, errors, preview = draft.validate_and_build()

    xml_content = ""
    if is_valid:
        xml_content = draft.generate_tally7_xml()

    return {
        "is_valid": is_valid,
        "errors": errors,
        "preview": preview,
        "xml": xml_content
    }


@app.post("/api/vouchers/import")
def voucher_import(req: VoucherImportRequest):
    if not req.confirmed_by_user:
        raise HTTPException(
            status_code=400,
            detail="Safety violation: User confirmation is strictly required before writing any voucher to Tally."
        )

    if not TALLY_WRITE_ENABLED and not req.is_test_company:
        raise HTTPException(
            status_code=403,
            detail="Write operations disabled by safety configuration (TALLY_WRITE_ENABLED=false). You can preview and download the XML, or enable writes in .env after testing on a backup company."
        )

    success, msg, details = client.import_voucher_xml(req.xml_content)
    if not success:
        raise HTTPException(status_code=422, detail=f"Tally rejected import: {msg}")

    return {
        "success": True,
        "message": msg,
        "details": details
    }


@app.post("/api/ledgers/match")
def match_ledger_api(req: LedgerMatchRequest):
    ledgers = get_cached_or_sample_ledgers()
    try:
        live = client.get_ledgers()
        if live:
            ledgers = live
    except Exception:
        pass

    result = match_ledger(req.requested_name, ledgers, expected_group=req.expected_group)
    return result


@app.post("/api/bulk/recommend")
def bulk_recommend_api(req: BulkRecommendRequest):
    """
    Analyzes uploaded bulk transactions (Bank, Purchase, or Sales)
    and returns AI & rule-based ledger recommendations with confidence scores.
    """
    ledgers = get_cached_or_sample_ledgers()
    try:
        live = client.get_ledgers()
        if live:
            ledgers = live
    except Exception:
        pass

    recommendations = recommend_bulk_ledgers(
        items=req.transactions,
        available_ledgers=ledgers,
        batch_type=req.batch_type
    )

    return {
        "batch_type": req.batch_type,
        "count": len(recommendations),
        "items": recommendations
    }


@app.post("/api/bulk/generate-xml")
def bulk_generate_xml_api(req: BulkGenerateXmlRequest):
    """
    Generates a multi-voucher Tally 7.1 XML envelope for reviewed bulk transactions.
    """
    company = req.company_name or TARGET_COMPANY
    xml_lines = [
        '<ENVELOPE>',
        '  <HEADER>',
        '    <TALLYREQUEST>Import Data</TALLYREQUEST>',
        '  </HEADER>',
        '  <BODY>',
        '    <IMPORTDATA>',
        '      <REQUESTDESC>',
        '        <REPORTNAME>All Masters</REPORTNAME>',
        '        <STATICVARIABLES>',
        f'          <SVCURRENTCOMPANY>{escape_xml(company)}</SVCURRENTCOMPANY>',
        '        </STATICVARIABLES>',
        '      </REQUESTDESC>',
        '      <REQUESTDATA>',
    ]

    total_count = 0
    batch_total = 0.0

    for idx, item in enumerate(req.items, start=1):
        tally_date = format_tally_date(item.get("date", "2026-10-27"))
        vch_type = item.get("voucher_type", "Payment")
        ref_no = item.get("reference", f"BATCH-{idx}")
        narration = escape_xml(item.get("narration", "Bulk import"))
        amt = float(item.get("amount", 0))
        target_ledger = escape_xml(item.get("suggested_ledger", "Suspense A/c"))
        bank_ledger = escape_xml(req.bank_ledger)

        batch_total += amt
        total_count += 1

        xml_lines.append('        <TALLYMESSAGE xmlns:UDF="TallyUDF">')
        xml_lines.append(f'          <VOUCHER VCHTYPE="{vch_type}" ACTION="Create">')
        xml_lines.append(f'            <DATE>{tally_date}</DATE>')
        xml_lines.append(f'            <VOUCHERTYPENAME>{vch_type}</VOUCHERTYPENAME>')
        xml_lines.append(f'            <REFERENCE>{ref_no}</REFERENCE>')
        xml_lines.append(f'            <VOUCHERNUMBER>{ref_no}</VOUCHERNUMBER>')
        xml_lines.append(f'            <PARTYLEDGERNAME>{target_ledger}</PARTYLEDGERNAME>')
        xml_lines.append(f'            <NARRATION>{narration}</NARRATION>')

        if vch_type == "Payment":
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{target_ledger}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>-{amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{bank_ledger}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>{amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')
        else:
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{bank_ledger}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>-{amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')
            xml_lines.append('            <ALLLEDGERENTRIES.LIST>')
            xml_lines.append(f'              <LEDGERNAME>{target_ledger}</LEDGERNAME>')
            xml_lines.append('              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>')
            xml_lines.append(f'              <AMOUNT>{amt:.2f}</AMOUNT>')
            xml_lines.append('            </ALLLEDGERENTRIES.LIST>')

        xml_lines.append('          </VOUCHER>')
        xml_lines.append('        </TALLYMESSAGE>')

    xml_lines.append('      </REQUESTDATA>')
    xml_lines.append('    </IMPORTDATA>')
    xml_lines.append('  </BODY>')
    xml_lines.append('</ENVELOPE>')

    final_xml = "\r\n".join(xml_lines)

    return {
        "success": True,
        "vouchers_count": total_count,
        "batch_total": batch_total,
        "xml": final_xml,
        "filename": f"Tally7_Batch_{req.batch_type}_{total_count}_Vouchers.xml"
    }


@app.post("/api/ai/chat")
def ai_chat(req: AIChatRequest):
    ledgers = get_cached_or_sample_ledgers()
    try:
        live = client.get_ledgers()
        if live:
            ledgers = live
    except Exception:
        pass

    summary_lines = [
        f"Active Company: {TARGET_COMPANY}",
        f"Total Ledgers: {len(ledgers)}",
        "Key Purchase Ledgers: " + ", ".join([l['name'] for l in ledgers if l.get('parent') == 'Purchase Accounts'][:8]),
        "Key Tax Ledgers: " + ", ".join([l['name'] for l in ledgers if l.get('parent') == 'Duties & Taxes'][:8]),
        "Key Suppliers: " + ", ".join([l['name'] for l in ledgers if l.get('parent') == 'Sundry Creditors'][:8])
    ]
    summary_str = "\n".join(summary_lines)

    result = call_ai(
        user_prompt=req.message,
        conversation_history=req.history,
        available_ledgers_summary=summary_str
    )

    return result
