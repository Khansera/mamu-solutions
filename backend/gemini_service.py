"""
Google Gemini AI Assistant Service.
Strictly used for natural language queries, invoice text extraction, and ledger guidance.
All financial arithmetic, tax rates, and balancing logic remain strictly in deterministic code.
Treats all AI output as untrusted and requires user confirmation before any accounting action.
"""
import json
import urllib.request
import urllib.error
from typing import Dict, Any, List, Optional
from .config import GEMINI_API_KEY, GEMINI_MODEL


SYSTEM_PROMPT = """You are the Tally 7.1 Accounting Assistant for 'Chinar Resort & Spa Pvt Ltd. ACUTAL'.
Your responsibility is to assist the accountant with natural language understanding, querying ledgers, extracting invoice information from text, and explaining GST rules.

STRICT OPERATIONAL RULES:
1. DISTINGUISH DATA SOURCES: Clearly demarcate what comes from [VERIFIED TALLY 7.1 DATA] versus [USER-SUPPLIED INVOICE DATA] versus [ESTIMATES / ASSUMPTIONS].
2. NEVER FABRICATE LEDGERS: Only refer to ledgers that actually exist in the company's ledger list. If a requested ledger does not exist, clearly state that it is not present in Tally and suggest the closest existing ledger.
3. NEVER ATTEMPT MANUAL ARITHMETIC IN YOUR HEAD: State the taxable formula clearly and inform the user that the application's deterministic Decimal engine will calculate exact CGST/SGST/IGST and balance the voucher to 2 decimal places.
4. TALLY 7.1 SPECIFICS: Remember that Tally 7.1 uses classic XML envelopes (<ENVELOPE><HEADER><BODY>...), YYYYMMDD date formats, and explicit Deemed Positive flags.
5. NO CODE EXECUTION: You cannot execute system commands, write to the database, or post vouchers directly. All imports require the user's explicit manual confirmation in the UI.

When extracting invoice details from user prompts, structure your reply with:
- Supplier Name & suggested ledger
- Invoice Number and Date
- Line items with description, taxable amount, and GST rate (0%, 5%, 12%, 18%, 28%)
- Notes on whether intra-state (CGST + SGST) or inter-state (IGST) applies based on supplier location.
"""


def call_gemini(
    user_prompt: str,
    conversation_history: Optional[List[Dict[str, str]]] = None,
    available_ledgers_summary: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None
) -> Dict[str, Any]:
    """
    Sends request to Google Gemini API using HTTPS.
    Handles quota limits, invalid keys, and network timeouts gracefully.
    """
    effective_key = api_key or GEMINI_API_KEY
    effective_model = model or GEMINI_MODEL or "gemini-3.8-flash"

    if not effective_key or effective_key.strip() in ("", "MY_GEMINI_API_KEY", "YOUR_GEMINI_API_KEY"):
        return {
            "success": False,
            "error_type": "NO_API_KEY",
            "message": (
                "Google Gemini API key is not configured. "
                "You can still use all core accounting features (Ledger browsing, GST calculator, "
                "Voucher drafts, XML generation, and Tally connectivity) without an AI key. "
                "To enable AI assistance, set GEMINI_API_KEY in your local .env file. "
                "Google provides free-tier quota for Gemini (e.g. gemini-3.8-flash) with zero budget required."
            ),
            "text": ""
        }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{effective_model}:generateContent?key={effective_key}"

    contents = []
    # Include ledger context if provided
    context_prefix = ""
    if available_ledgers_summary:
        context_prefix = f"COMPANY CONTEXT (Tally 7.1 - Chinar Resort & Spa Pvt Ltd. ACUTAL):\n{available_ledgers_summary}\n\n"

    # Add conversation history
    if conversation_history:
        for turn in conversation_history[-6:]:
            role = "user" if turn.get("role") in ("user", "human") else "model"
            contents.append({
                "role": role,
                "parts": [{"text": turn.get("content", "")}]
            })

    # Add current user prompt
    contents.append({
        "role": "user",
        "parts": [{"text": context_prefix + user_prompt}]
    })

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 1024
        }
    }

    req_data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=req_data,
        headers={"Content-Type": "application/json", "User-Agent": "aistudio-build"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            candidate = data.get("candidates", [{}])[0]
            parts = candidate.get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)
            return {
                "success": True,
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

        if e.code == 429:
            return {
                "success": False,
                "error_type": "QUOTA_EXCEEDED",
                "message": (
                    f"Gemini API rate limit or free-tier quota exceeded (HTTP 429). "
                    f"Please wait a moment before sending another message. Note: Google free-tier quotas reset periodically. "
                    f"Error detail: {err_msg}"
                ),
                "text": ""
            }
        elif e.code == 400:
            return {
                "success": False,
                "error_type": "INVALID_REQUEST",
                "message": f"Gemini API request rejected (HTTP 400): {err_msg}. Check if model '{effective_model}' is supported.",
                "text": ""
            }
        elif e.code == 403:
            return {
                "success": False,
                "error_type": "FORBIDDEN",
                "message": f"Gemini API key rejected or unauthorized (HTTP 403): {err_msg}. Please verify your key.",
                "text": ""
            }
        return {
            "success": False,
            "error_type": "HTTP_ERROR",
            "message": f"Gemini API returned HTTP {e.code}: {err_msg}",
            "text": ""
        }
    except urllib.error.URLError as e:
        return {
            "success": False,
            "error_type": "NETWORK_ERROR",
            "message": f"Network error connecting to Gemini API: {str(e.reason)}. Check your internet connection.",
            "text": ""
        }
    except Exception as e:
        return {
            "success": False,
            "error_type": "UNKNOWN_ERROR",
            "message": f"Failed to get AI response: {str(e)}",
            "text": ""
        }
