"""
Tally 7.1 Voucher XML Generator and Validator.
Formats accounting vouchers conforming strictly to Tally 7.1 XML schema standards.
Ensures zero debit/credit imbalance before permitting XML export.
"""
from decimal import Decimal
import xml.etree.ElementTree as ET
import html
from typing import Dict, Any, List, Tuple

try:
    from .gst_calculator import calculate_and_validate_gst, to_decimal, round_currency
except ImportError:
    from backend.gst_calculator import calculate_and_validate_gst, to_decimal, round_currency


def escape_xml(text: str) -> str:
    """Escapes XML entities safely for Tally 7.1 compatibility."""
    if not text:
        return ""
    return (
        html.escape(str(text))
        .replace("&apos;", "'")
        .replace("\"", "&quot;")
    )


def format_tally_date(date_str: str) -> str:
    """
    Converts YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY into Tally 7.1 YYYYMMDD format.
    """
    if not date_str:
        return "20261027"
    raw = date_str.strip()
    # Check if separated by - or /
    for sep in ("-", "/"):
        if sep in raw:
            parts = [p.strip() for p in raw.split(sep)]
            if len(parts) == 3:
                if len(parts[0]) == 4:  # YYYY-MM-DD
                    y, m, d = parts[0], parts[1].zfill(2), parts[2].zfill(2)
                    return f"{y}{m}{d}"
                elif len(parts[2]) == 4:  # DD-MM-YYYY
                    d, m, y = parts[0].zfill(2), parts[1].zfill(2), parts[2]
                    return f"{y}{m}{d}"

    cleaned = raw.replace("-", "").replace("/", "").replace(" ", "")
    if len(cleaned) == 8 and cleaned.isdigit():
        return cleaned
    return "20261027"


class VoucherDraft:
    def __init__(
        self,
        voucher_type: str,
        company_name: str,
        date_str: str,
        supplier_name: str,
        invoice_number: str,
        narration: str,
        items: List[Dict[str, Any]],
        is_interstate: bool = False,
        other_charges: float = 0.0,
        other_charges_ledger: str = "Freight & Cartage Inward",
        discount: float = 0.0,
        discount_ledger: str = "Discount Received",
        cgst_ledger_prefix: str = "Input CGST",
        sgst_ledger_prefix: str = "Input SGST",
        igst_ledger_prefix: str = "Input IGST"
    ):
        self.voucher_type = voucher_type or "Purchase"
        self.company_name = company_name or "Chinar Resort & Spa Pvt Ltd. ACUTAL"
        self.date_str = format_tally_date(date_str)
        self.supplier_name = supplier_name
        self.invoice_number = invoice_number or "INV-DRAFT"
        self.narration = narration
        self.items = items
        self.is_interstate = is_interstate
        self.other_charges = to_decimal(other_charges)
        self.other_charges_ledger = other_charges_ledger
        self.discount = to_decimal(discount)
        self.discount_ledger = discount_ledger
        self.cgst_prefix = cgst_ledger_prefix
        self.sgst_prefix = sgst_ledger_prefix
        self.igst_prefix = igst_ledger_prefix

    def validate_and_build(self) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Validates all calculations, matches debits and credits, and prepares preview rows.
        """
        errors: List[str] = []
        if not self.supplier_name:
            errors.append("Supplier / Party ledger name is required.")
        if not self.items:
            errors.append("At least one line item is required.")

        calc = calculate_and_validate_gst(
            items=self.items,
            is_interstate=self.is_interstate,
            other_charges=self.other_charges,
            discount=self.discount
        )

        errors.extend(calc.errors)

        # Build detailed ledger rows for Tally 7.1
        ledger_entries: List[Dict[str, Any]] = []

        # 1. Supplier / Party Ledger (Credit)
        total_payable = calc.invoice_total
        ledger_entries.append({
            "ledger_name": self.supplier_name,
            "is_deemed_positive": False,  # Credit
            "amount": float(total_payable),  # Positive amount for Credit in Tally Purchase
            "entry_type": "Credit",
            "particulars": f"Supplier invoice ref: {self.invoice_number}"
        })

        # 2. Purchase Account entries (Debit) - preserve separate lines per rate
        for line in calc.lines:
            line_amt = to_decimal(line["taxable_amount"])
            if line_amt > Decimal("0.00"):
                led_name = line.get("ledger_name") or f"Purchase - {line['description']} ({line['gst_rate']}%)"
                ledger_entries.append({
                    "ledger_name": led_name,
                    "is_deemed_positive": True,  # Debit
                    "amount": -float(line_amt),  # Negative amount for Debit in Tally
                    "entry_type": "Debit",
                    "particulars": f"{line['description']} @ {line['gst_rate']}% taxable"
                })

        # 3. Tax Ledgers (Debit)
        for rate_str, breakup in calc.tax_breakup.items():
            rate_num = rate_str.replace("%", "")
            if self.is_interstate:
                igst_amt = breakup["igst"]
                if igst_amt > Decimal("0.00"):
                    ledger_entries.append({
                        "ledger_name": f"{self.igst_prefix} {rate_str}",
                        "is_deemed_positive": True,
                        "amount": -float(igst_amt),
                        "entry_type": "Debit",
                        "particulars": f"IGST @ {rate_str} on ₹{breakup['taxable']}"
                    })
            else:
                cgst_amt = breakup["cgst"]
                sgst_amt = breakup["sgst"]
                half_rate = float(rate_num) / 2.0
                half_str = f"{half_rate:.1f}%".replace(".0%", "%")
                if cgst_amt > Decimal("0.00"):
                    ledger_entries.append({
                        "ledger_name": f"{self.cgst_prefix} {half_str}",
                        "is_deemed_positive": True,
                        "amount": -float(cgst_amt),
                        "entry_type": "Debit",
                        "particulars": f"CGST @ {half_str} on ₹{breakup['taxable']}"
                    })
                if sgst_amt > Decimal("0.00"):
                    ledger_entries.append({
                        "ledger_name": f"{self.sgst_prefix} {half_str}",
                        "is_deemed_positive": True,
                        "amount": -float(sgst_amt),
                        "entry_type": "Debit",
                        "particulars": f"SGST @ {half_str} on ₹{breakup['taxable']}"
                    })

        # 4. Other charges (Debit)
        if self.other_charges > Decimal("0.00"):
            ledger_entries.append({
                "ledger_name": self.other_charges_ledger,
                "is_deemed_positive": True,
                "amount": -float(self.other_charges),
                "entry_type": "Debit",
                "particulars": "Freight and inward transport"
            })

        # 5. Discount received (Credit)
        if self.discount > Decimal("0.00"):
            ledger_entries.append({
                "ledger_name": self.discount_ledger,
                "is_deemed_positive": False,
                "amount": float(self.discount),
                "entry_type": "Credit",
                "particulars": "Trade / prompt discount"
            })

        # 6. Round off ledger (Debit or Credit depending on sign)
        if calc.round_off != Decimal("0.00"):
            if calc.round_off > Decimal("0.00"):
                ledger_entries.append({
                    "ledger_name": "Round Off",
                    "is_deemed_positive": True,
                    "amount": -float(calc.round_off),
                    "entry_type": "Debit",
                    "particulars": "Fractional round-off adjustment"
                })
            else:
                ledger_entries.append({
                    "ledger_name": "Round Off",
                    "is_deemed_positive": False,
                    "amount": float(abs(calc.round_off)),
                    "entry_type": "Credit",
                    "particulars": "Fractional round-off adjustment"
                })

        # Verify balancing
        debit_sum = sum(abs(e["amount"]) for e in ledger_entries if e["is_deemed_positive"])
        credit_sum = sum(e["amount"] for e in ledger_entries if not e["is_deemed_positive"])
        balance_diff = round(abs(debit_sum - credit_sum), 2)

        is_balanced = (balance_diff < 0.02)
        if not is_balanced:
            errors.append(f"Voucher does not balance! Total Debits: ₹{debit_sum:.2f}, Total Credits: ₹{credit_sum:.2f}, Difference: ₹{balance_diff:.2f}")

        preview = {
            "voucher_type": self.voucher_type,
            "company_name": self.company_name,
            "date": self.date_str,
            "reference": self.invoice_number,
            "supplier_name": self.supplier_name,
            "narration": self.narration,
            "invoice_total": float(total_payable),
            "debit_sum": debit_sum,
            "credit_sum": credit_sum,
            "is_balanced": is_balanced,
            "calculation": calc.to_dict(),
            "ledger_entries": ledger_entries
        }

        return len(errors) == 0 and is_balanced, errors, preview

    def generate_tally7_xml(self) -> str:
        """
        Generates production-grade Tally 7.1 XML for voucher import.
        Preserves reference, supplier invoice, dates, and sign conventions.
        """
        is_valid, errors, preview = self.validate_and_build()
        if not is_valid:
            raise ValueError(f"Cannot generate XML for invalid/unbalanced voucher: {'; '.join(errors)}")

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
            f'          <SVCURRENTCOMPANY>{escape_xml(self.company_name)}</SVCURRENTCOMPANY>',
            '        </STATICVARIABLES>',
            '      </REQUESTDESC>',
            '      <REQUESTDATA>',
            '        <TALLYMESSAGE xmlns:UDF="TallyUDF">',
            f'          <VOUCHER VCHTYPE="{escape_xml(self.voucher_type)}" ACTION="Create">',
            f'            <DATE>{self.date_str}</DATE>',
            f'            <VOUCHERTYPENAME>{escape_xml(self.voucher_type)}</VOUCHERTYPENAME>',
            f'            <REFERENCE>{escape_xml(self.invoice_number)}</REFERENCE>',
            f'            <VOUCHERNUMBER>{escape_xml(self.invoice_number)}</VOUCHERNUMBER>',
            f'            <PARTYLEDGERNAME>{escape_xml(self.supplier_name)}</PARTYLEDGERNAME>',
            f'            <BASICBUYERNAME>{escape_xml(self.supplier_name)}</BASICBUYERNAME>',
            f'            <NARRATION>{escape_xml(self.narration or f"Purchase Inv {self.invoice_number} from {self.supplier_name}")}</NARRATION>',
            '            <ISINVOICE>Yes</ISINVOICE>'
        ]

        for entry in preview["ledger_entries"]:
            pos_str = "Yes" if entry["is_deemed_positive"] else "No"
            amt_formatted = f"{entry['amount']:.2f}"
            xml_lines.extend([
                '            <ALLLEDGERENTRIES.LIST>',
                f'              <LEDGERNAME>{escape_xml(entry["ledger_name"])}</LEDGERNAME>',
                f'              <ISDEEMEDPOSITIVE>{pos_str}</ISDEEMEDPOSITIVE>',
                f'              <AMOUNT>{amt_formatted}</AMOUNT>',
                '            </ALLLEDGERENTRIES.LIST>'
            ])

        xml_lines.extend([
            '          </VOUCHER>',
            '        </TALLYMESSAGE>',
            '      </REQUESTDATA>',
            '    </IMPORTDATA>',
            '  </BODY>',
            '</ENVELOPE>'
        ])

        return "\r\n".join(xml_lines)
