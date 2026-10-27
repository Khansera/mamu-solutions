"""
Ledger Matching Engine for Tally 7.1.
Enforces ledger safety:
- Never silently substitutes ledgers
- Categorizes exact matches vs possible/fuzzy matches
- Refuses automatic ledger creation
- Prompts user for clarification when multiple candidates exist
"""
from typing import List, Dict, Any, Tuple
import re


def normalize_str(s: str) -> str:
    """Normalize string for fuzzy comparison by removing punctuation and extra spaces."""
    s = s.lower().strip()
    s = re.sub(r"[^\w\s%]", " ", s)
    s = re.sub(r"\s+", " ", s)
    return s


def calculate_similarity(s1: str, s2: str) -> float:
    """
    Computes token-based Jaccard similarity between two ledger names.
    """
    norm1 = set(normalize_str(s1).split())
    norm2 = set(normalize_str(s2).split())
    if not norm1 or not norm2:
        return 0.0
    intersection = norm1.intersection(norm2)
    union = norm1.union(norm2)
    return len(intersection) / len(union)


def match_ledger(requested_name: str, available_ledgers: List[Dict[str, Any]], expected_group: str = None) -> Dict[str, Any]:
    """
    Matches a requested ledger name against current Tally ledgers.
    Returns:
    {
        "requested": requested_name,
        "exact_match": dict or None,
        "possible_matches": list of dicts with score,
        "status": "EXACT" | "AMBIGUOUS" | "NOT_FOUND",
        "requires_confirmation": bool,
        "warning": str or None
    }
    """
    cleaned_req = requested_name.strip()
    req_upper = cleaned_req.upper()

    exact_match = None
    candidates = []

    for led in available_ledgers:
        led_name = led["name"].strip()
        led_upper = led_name.upper()

        if led_upper == req_upper:
            exact_match = led
            break

        # Compute similarity
        sim = calculate_similarity(cleaned_req, led_name)

        # Boost score if expected group matches (e.g. Sundry Creditors for suppliers)
        if expected_group and led.get("parent") == expected_group:
            sim += 0.15

        # Substring bonus
        if cleaned_req.lower() in led_name.lower() or led_name.lower() in cleaned_req.lower():
            sim = max(sim, 0.70)

        if sim >= 0.40:
            candidates.append({
                "ledger": led,
                "score": round(sim, 2)
            })

    candidates.sort(key=lambda x: x["score"], reverse=True)
    top_candidates = candidates[:5]

    if exact_match:
        return {
            "requested": requested_name,
            "exact_match": exact_match,
            "possible_matches": [],
            "status": "EXACT",
            "requires_confirmation": False,
            "warning": None
        }
    elif top_candidates:
        best = top_candidates[0]
        return {
            "requested": requested_name,
            "exact_match": None,
            "possible_matches": [c["ledger"] for c in top_candidates],
            "status": "AMBIGUOUS",
            "requires_confirmation": True,
            "warning": f"No exact match for '{requested_name}'. Found {len(top_candidates)} potential match(es) in Tally 7.1. Please select or confirm."
        }
    else:
        return {
            "requested": requested_name,
            "exact_match": None,
            "possible_matches": [],
            "status": "NOT_FOUND",
            "requires_confirmation": True,
            "warning": f"Ledger '{requested_name}' does not exist in Tally 7.1. Automatic ledger creation is disabled for accounting safety."
        }


def batch_match_voucher_ledgers(
    supplier_name: str,
    line_ledgers: List[str],
    tax_ledgers: List[str],
    available_ledgers: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Validates all requested ledgers for a draft voucher.
    Returns overall matching status and individual ledger analysis.
    """
    supplier_result = match_ledger(supplier_name, available_ledgers, expected_group="Sundry Creditors")

    lines_result = [
        match_ledger(name, available_ledgers, expected_group="Purchase Accounts")
        for name in line_ledgers
    ]

    taxes_result = [
        match_ledger(name, available_ledgers, expected_group="Duties & Taxes")
        for name in tax_ledgers
    ]

    all_matched = (
        supplier_result["status"] == "EXACT"
        and all(l["status"] == "EXACT" for l in lines_result)
        and all(t["status"] == "EXACT" for t in taxes_result)
    )

    unresolved_count = (
        (1 if supplier_result["status"] != "EXACT" else 0)
        + sum(1 for l in lines_result if l["status"] != "EXACT")
        + sum(1 for t in taxes_result if t["status"] != "EXACT")
    )

    return {
        "all_exact": all_matched,
        "unresolved_count": unresolved_count,
        "supplier": supplier_result,
        "purchase_lines": lines_result,
        "taxes": taxes_result
    }
