"""
Deterministic GST calculation and voucher balancing engine.
Enforces precision Decimal arithmetic with no floating-point inaccuracies.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Dict, Any, Optional

TWO_PLACES = Decimal("0.01")


def to_decimal(val: Any) -> Decimal:
    """Safely convert any numeric representation to Decimal."""
    if val is None or val == "":
        return Decimal("0.00")
    if isinstance(val, (int, float, str)):
        return Decimal(str(val)).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    if isinstance(val, Decimal):
        return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)
    return Decimal("0.00")


def round_currency(val: Decimal) -> Decimal:
    """Round to 2 decimal places using standard accounting half-up method."""
    return val.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


class GSTLineItem:
    def __init__(
        self,
        description: str,
        taxable_amount: Decimal,
        gst_rate: Decimal,
        ledger_name: Optional[str] = None,
        hsn_sac: Optional[str] = None
    ):
        self.description = description
        self.taxable_amount = to_decimal(taxable_amount)
        self.gst_rate = to_decimal(gst_rate)
        self.ledger_name = ledger_name or f"Purchase @ {self.gst_rate}%"
        self.hsn_sac = hsn_sac or ""


class GSTCalculationResult:
    def __init__(
        self,
        is_interstate: bool,
        lines: List[Dict[str, Any]],
        total_taxable: Decimal,
        cgst_total: Decimal,
        sgst_total: Decimal,
        igst_total: Decimal,
        other_charges: Decimal,
        discount: Decimal,
        round_off: Decimal,
        invoice_total: Decimal,
        tax_breakup: Dict[str, Dict[str, Decimal]],
        is_balanced: bool,
        errors: List[str]
    ):
        self.is_interstate = is_interstate
        self.lines = lines
        self.total_taxable = total_taxable
        self.cgst_total = cgst_total
        self.sgst_total = sgst_total
        self.igst_total = igst_total
        self.other_charges = other_charges
        self.discount = discount
        self.round_off = round_off
        self.invoice_total = invoice_total
        self.tax_breakup = tax_breakup
        self.is_balanced = is_balanced
        self.errors = errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_interstate": self.is_interstate,
            "lines": self.lines,
            "total_taxable": float(self.total_taxable),
            "cgst_total": float(self.cgst_total),
            "sgst_total": float(self.sgst_total),
            "igst_total": float(self.igst_total),
            "other_charges": float(self.other_charges),
            "discount": float(self.discount),
            "round_off": float(self.round_off),
            "invoice_total": float(self.invoice_total),
            "tax_breakup": {
                rate: {k: float(v) for k, v in data.items()}
                for rate, data in self.tax_breakup.items()
            },
            "is_balanced": self.is_balanced,
            "errors": self.errors
        }


def calculate_and_validate_gst(
    items: List[Dict[str, Any]],
    is_interstate: bool = False,
    other_charges: Any = 0,
    discount: Any = 0,
    expected_total: Optional[Any] = None
) -> GSTCalculationResult:
    """
    Deterministically computes tax lines, split rates, and validates invoice totals.
    Preserves individual lines per rate without premature collapsing.
    """
    errors: List[str] = []
    processed_lines = []
    tax_breakup: Dict[str, Dict[str, Decimal]] = {}

    total_taxable = Decimal("0.00")
    total_cgst = Decimal("0.00")
    total_sgst = Decimal("0.00")
    total_igst = Decimal("0.00")

    other_chg_dec = to_decimal(other_charges)
    disc_dec = to_decimal(discount)

    for idx, item in enumerate(items, start=1):
        desc = item.get("description", f"Item #{idx}")
        taxable = to_decimal(item.get("taxable_amount", 0))
        rate = to_decimal(item.get("gst_rate", 0))
        ledger = item.get("ledger_name", "")

        if taxable < Decimal("0.00"):
            errors.append(f"Line {idx} ({desc}): Taxable amount cannot be negative ({taxable}).")

        # Deterministic formula: Taxable * Rate / 100
        tax_amount = round_currency((taxable * rate) / Decimal("100.00"))

        if is_interstate:
            cgst = Decimal("0.00")
            sgst = Decimal("0.00")
            igst = tax_amount
        else:
            # 50-50 split for intra-state
            # Half of tax amount
            cgst = round_currency((taxable * (rate / Decimal("2.00"))) / Decimal("100.00"))
            sgst = round_currency((taxable * (rate / Decimal("2.00"))) / Decimal("100.00"))
            # Catch 1-paisa rounding divergence on odd paisa tax amounts
            diff = tax_amount - (cgst + sgst)
            if diff != Decimal("0.00"):
                # Standard convention: add discrepancy to CGST or keep exact split
                cgst += diff
            igst = Decimal("0.00")

        line_item_total = taxable + cgst + sgst + igst

        processed_lines.append({
            "line_no": idx,
            "description": desc,
            "ledger_name": ledger,
            "taxable_amount": float(taxable),
            "gst_rate": float(rate),
            "cgst_amount": float(cgst),
            "sgst_amount": float(sgst),
            "igst_amount": float(igst),
            "line_total": float(line_item_total)
        })

        total_taxable += taxable
        total_cgst += cgst
        total_sgst += sgst
        total_igst += igst

        rate_str = f"{rate}%"
        if rate_str not in tax_breakup:
            tax_breakup[rate_str] = {
                "taxable": Decimal("0.00"),
                "cgst": Decimal("0.00"),
                "sgst": Decimal("0.00"),
                "igst": Decimal("0.00"),
                "total_tax": Decimal("0.00")
            }
        tax_breakup[rate_str]["taxable"] += taxable
        tax_breakup[rate_str]["cgst"] += cgst
        tax_breakup[rate_str]["sgst"] += sgst
        tax_breakup[rate_str]["igst"] += igst
        tax_breakup[rate_str]["total_tax"] += (cgst + sgst + igst)

    calculated_subtotal = total_taxable + total_cgst + total_sgst + total_igst + other_chg_dec - disc_dec
    calculated_subtotal = round_currency(calculated_subtotal)

    # Optional round-off to nearest integer rupee
    nearest_integer = calculated_subtotal.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    round_off = round_currency(nearest_integer - calculated_subtotal)
    invoice_total = calculated_subtotal + round_off

    is_balanced = True
    if expected_total is not None and expected_total != "":
        exp_dec = to_decimal(expected_total)
        # Check against both exact calculated and rounded total
        diff_exact = abs(exp_dec - calculated_subtotal)
        diff_rounded = abs(exp_dec - invoice_total)
        if diff_exact > Decimal("1.00") and diff_rounded > Decimal("1.00"):
            is_balanced = False
            errors.append(
                f"Invoice total mismatch: Supplied total {exp_dec} differs from computed {calculated_subtotal} (diff: {diff_exact})."
            )

    return GSTCalculationResult(
        is_interstate=is_interstate,
        lines=processed_lines,
        total_taxable=total_taxable,
        cgst_total=total_cgst,
        sgst_total=total_sgst,
        igst_total=total_igst,
        other_charges=other_chg_dec,
        discount=disc_dec,
        round_off=round_off,
        invoice_total=invoice_total,
        tax_breakup=tax_breakup,
        is_balanced=is_balanced,
        errors=errors
    )
