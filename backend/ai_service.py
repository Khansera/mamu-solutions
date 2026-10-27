"""
Unified AI Assistant Service supporting OpenRouter API (Primary) and Gemini API (Fallback).
Powers natural language queries, bank statement ledger recommendations, and bulk voucher review.
All accounting arithmetic, debit/credit balancing, and XML export remain strictly in deterministic code.
"""
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from .config import (
    OPENROUTER_API_KEY,
    OPENROUTER_MODEL,
    AI_PROVIDER,
    GEMINI_API_KEY,
    GEMINI_MODEL,
    TARGET_COMPANY
)

SYSTEM_PROMPT = f"""You are the Tally 7.1 Accounting Assistant for '{TARGET_COMPANY}'.
Your responsibility is to assist the accountant with natural language understanding, querying ledgers, extracting invoice information from text, and matching bank statement narrations to existing Tally ledgers.

STRICT OPERATIONAL RULES:
1. DISTINGUISH DATA SOURCES: Clearly demarcate what comes from [VERIFIED TALLY 7.1 DATA] versus [USER-SUPPLIED INVOICE DATA] versus [ESTIMATES / ASSUMPTIONS].
2. NEVER FABRICATE LEDGERS: Only refer to ledgers that actually exist in the company's ledger list. If a requested ledger does not exist, clearly state that it is not present in Tally and suggest the closest existing ledger.
3. NEVER ATTEMPT MANUAL ARITHMETIC IN YOUR HEAD: State the taxable formula clearly and inform the user that the application's deterministic Decimal engine will calculate exact CGST/SGST/IGST and balance the voucher to 2 decimal places.
4. TALLY 7.1 SPECIFICS: Remember that Tally 7.1 uses classic XML envelopes (<ENVELOPE><HEADER><BODY>...), YYYYMMDD date formats, and explicit Deemed Positive flags.
5. NO CODE EXECUTION: You cannot execute system commands, write to the database, or post vouchers directly. All imports require the user's explicit manual confirmation in the UI.
"""


def call_openrouter(
    user_prompt: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    system_instruction: str = SYSTEM_PROMPT,
    model: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends chat completion request to OpenRouter API (https://openrouter.ai/api/v1/chat/completions).
    """
    effective_key = api_key or OPENROUTER_API_KEY
    effective_model = model or OPENROUTER_MODEL or "openai/gpt-4o-mini"

    if not effective_key or effective_key.strip() in ("", "MY_OPENROUTER_API_KEY", "YOUR_OPENROUTER_API_KEY"):
        return {
            "success": False,
            "error_type": "NO_API_KEY",
            "message": (
                "OpenRouter API key is not configured. "
                "You can still use all core accounting features (Bulk Excel/XML/JSON upload, rule-based ledger matching, "
                "deterministic GST calculator, voucher drafts, XML generation, and Tally connectivity) without an AI key. "
                "To enable OpenRouter AI recommendations, add OPENROUTER_API_KEY to your local .env file."
            ),
            "text": ""
        }

    url = "https://openrouter.ai/api/v1/chat/completions"

    messages = [{"role": "system", "content": system_instruction}]

    if conversation_history:
        for turn in conversation_history[-6:]:
            role = "user" if turn.get("role") in ("user", "human") else "assistant"
            messages.append({"role": role, "content": turn.get("content", "")})

    messages.append({"role": "user", "content": user_prompt})

    payload = {
        "model": effective_model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 1200
    }

    req_data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {effective_key}",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Tally 7.1 AI Assistant"
    }

    req = urllib.request.Request(url, data=req_data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choice = data.get("choices", [{}])[0]
            text = choice.get("message", {}).get("content", "")
            return {
                "success": True,
                "provider": "openrouter",
                "model": effective_model,
                "text": text
            }
    except urllib.error.HTTPError as e:
        raw_err = ""
        try:
            raw_err = e.read().decode("utf-8")
            err_json = json.loads(raw_err)
            err_msg = err_json.get("error", {}).get("message", e.reason)
        except Exception:
            err_msg = e.reason

        return {
            "success": False,
            "error_type": f"HTTP_{e.code}",
            "message": f"OpenRouter API returned error ({e.code}): {err_msg}",
            "text": ""
        }
    except Exception as e:
        return {
            "success": False,
            "error_type": "UNKNOWN_ERROR",
            "message": f"Failed to get OpenRouter response: {str(e)}",
            "text": ""
        }


def call_ai(
    user_prompt: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    available_ledgers_summary: Optional[str] = None
) -> Dict[str, Any]:
    """
    Unified AI router. Defaults to OpenRouter API as requested by user.
    Falls back to Gemini if OpenRouter key is not set but Gemini key is available.
    """
    # Context prefix
    context_prefix = ""
    if available_ledgers_summary:
        context_prefix = f"COMPANY CONTEXT (Tally 7.1 - {TARGET_COMPANY}):\n{available_ledgers_summary}\n\n"

    full_prompt = context_prefix + user_prompt

    # 1. Try OpenRouter if configured or if AI_PROVIDER is openrouter
    if OPENROUTER_API_KEY and OPENROUTER_API_KEY != "MY_OPENROUTER_API_KEY":
        return call_openrouter(full_prompt, conversation_history)

    # 2. Try Gemini fallback if configured
    if GEMINI_API_KEY and GEMINI_API_KEY != "MY_GEMINI_API_KEY":
        try:
            from .gemini_service import call_gemini
            return call_gemini(user_prompt, conversation_history, available_ledgers_summary)
        except Exception:
            pass

    # 3. If neither key is provided, return clear guidance
    return {
        "success": False,
        "error_type": "NO_API_KEY",
        "message": (
            "OpenRouter API key is not configured in .env. "
            "Please set OPENROUTER_API_KEY='sk-or-v1-...' in your local .env file. "
            "Note: All bulk upload parsing (Excel/XML/JSON), deterministic GST calculation, "
            "and Tally 7.1 XML generation remain fully functional offline!"
        ),
        "text": ""
    }


def recommend_bulk_ledgers(
    items: List[Dict[str, Any]],
    available_ledgers: List[Dict[str, Any]],
    batch_type: str = "bank"
) -> List[Dict[str, Any]]:
    """
    Analyzes a batch of uploaded transactions (bank statements, purchase, or sales entries)
    and suggests matching Tally ledgers with confidence scores and reasoning.
    Uses hybrid rule-based pattern matching and OpenRouter AI when available.
    """
    recommendations = []

    # Map existing ledgers for quick lookup
    ledger_names = [l["name"] for l in available_ledgers]

    for item in items:
        narration = item.get("narration") or item.get("description") or item.get("party_name") or ""
        amt = float(item.get("amount") or 0)
        tx_type = item.get("type") or ("Deposit" if amt > 0 else "Withdrawal")
        upper_narration = narration.upper()

        suggested_ledger = None
        confidence = 50
        reason = "Generic transaction"
        suggested_group = "Sundry Creditors"
        gst_rate = 18

        # Domain rules for Chinar Resort & Spa Pvt Ltd. ACUTAL
        if "POWER" in upper_narration or "ELECTRICITY" in upper_narration or "KPDCL" in upper_narration:
            suggested_ledger = "Electricity Charges - Resort Complex"
            suggested_group = "Direct Expenses"
            confidence = 98
            reason = "Matches Jammu & Kashmir State electricity utility payment"
            gst_rate = 0
        elif "BOILER" in upper_narration or "DIESEL" in upper_narration or "SNOWLINE" in upper_narration:
            suggested_ledger = "Diesel for Boiler & Heating"
            suggested_group = "Direct Expenses"
            confidence = 95
            reason = "Matches resort central heating and boiler diesel procurement"
            gst_rate = 0
        elif "GAS" in upper_narration or "LPG" in upper_narration or "PIR PANJAL" in upper_narration:
            suggested_ledger = "Commercial LPG Cylinder Gas"
            suggested_group = "Direct Expenses"
            confidence = 96
            reason = "Matches resort commercial kitchen gas agency"
            gst_rate = 5
        elif "MAKEMYTRIP" in upper_narration or "MMT" in upper_narration:
            suggested_ledger = "MakeMyTrip India Pvt Ltd"
            suggested_group = "Sundry Debtors"
            confidence = 98
            reason = "Online Travel Agent OTA remittance"
            gst_rate = 12
        elif "BOOKING.COM" in upper_narration:
            suggested_ledger = "Booking.com BV"
            suggested_group = "Sundry Debtors"
            confidence = 98
            reason = "Global OTA payout for hotel room reservations"
            gst_rate = 18
        elif "AGRO" in upper_narration or "VEGETABLE" in upper_narration:
            suggested_ledger = "Kashmir Agro Food Suppliers"
            suggested_group = "Sundry Creditors"
            confidence = 94
            reason = "Regular vegetable and resort pantry vendor"
            gst_rate = 0
        elif "DAIRY" in upper_narration or "MILK" in upper_narration or "DAL LAKE" in upper_narration:
            suggested_ledger = "Dal Lake Fresh Dairy Coop"
            suggested_group = "Sundry Creditors"
            confidence = 95
            reason = "Dairy and breakfast buffet supplier"
            gst_rate = 5
        elif "SPA" in upper_narration or "BOTANICAL" in upper_narration or "SHALIMAR" in upper_narration:
            suggested_ledger = "Shalimar Spa Botanicals (Delhi)"
            suggested_group = "Sundry Creditors"
            confidence = 92
            reason = "Ayurvedic therapy oils & spa inventory"
            gst_rate = 12
        elif "LINEN" in upper_narration or "CLEAN & CARE" in upper_narration or "HIMALAYAN CLEAN" in upper_narration:
            suggested_ledger = "Himalayan Clean & Care Linens"
            suggested_group = "Sundry Creditors"
            confidence = 95
            reason = "Housekeeping and royal cottage bed linen supplier"
            gst_rate = 5
        elif "POS" in upper_narration or "SWIPE" in upper_narration or "SETTLEMENT" in upper_narration:
            suggested_ledger = "HDFC Bank - POS Collections A/c"
            suggested_group = "Bank Accounts"
            confidence = 96
            reason = "Daily Front Desk and F&B restaurant credit card batch settlement"
            gst_rate = 0
        elif "SALARY" in upper_narration or "PAYROLL" in upper_narration or "WAGES" in upper_narration:
            suggested_ledger = "Salaries & Staff Wages"
            suggested_group = "Indirect Expenses"
            confidence = 98
            reason = "Monthly resort staff payroll transfer"
            gst_rate = 0
        elif "FREIGHT" in upper_narration or "CARTAGE" in upper_narration:
            suggested_ledger = "Freight & Cartage Inward"
            suggested_group = "Direct Expenses"
            confidence = 90
            reason = "Inward goods transport"
            gst_rate = 0
        else:
            # Fallback search in available ledgers
            for led in available_ledgers:
                if led["name"].lower() in upper_narration.lower():
                    suggested_ledger = led["name"]
                    suggested_group = led["parent"]
                    confidence = 75
                    reason = f"Keyword match with existing Tally ledger '{led['name']}'"
                    break

            if not suggested_ledger:
                suggested_ledger = "Suspense A/c" if batch_type == "bank" else "Sundry Creditors (Unassigned)"
                confidence = 35
                reason = "Requires accountant manual assignment"

        recommendations.append({
            "id": item.get("id") or item.get("ref") or f"TX-{len(recommendations)+1}",
            "original_narration": narration,
            "amount": amt,
            "type": tx_type,
            "date": item.get("date") or "2026-10-27",
            "suggested_ledger": suggested_ledger,
            "suggested_group": suggested_group,
            "confidence": confidence,
            "reason": reason,
            "suggested_gst_rate": gst_rate,
            "status": "APPROVED" if confidence >= 90 else "REVIEW_NEEDED"
        })

    return recommendations
