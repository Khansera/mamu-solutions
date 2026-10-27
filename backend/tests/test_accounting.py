"""
Comprehensive accounting test suite for Tally 7.1 + Gemini integration.
Tests deterministic GST calculations, debit/credit balancing, XML generation, and ledger safety.
Works with both pytest and python -m unittest.
"""
import unittest
from decimal import Decimal
import xml.etree.ElementTree as ET
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.gst_calculator import calculate_and_validate_gst, to_decimal
from backend.xml_generator import VoucherDraft, format_tally_date, escape_xml
from backend.ledger_matcher import match_ledger
from backend.tally_client import Tally7Client


class TestGSTCalculations(unittest.TestCase):
    def test_intra_state_single_rate(self):
        """Intra-state 18% on ₹1,000 should split to ₹90 CGST and ₹90 SGST, total ₹1,180."""
        items = [{"description": "Spa Oil", "taxable_amount": 1000.00, "gst_rate": 18}]
        res = calculate_and_validate_gst(items=items, is_interstate=False)
        self.assertEqual(res.total_taxable, Decimal("1000.00"))
        self.assertEqual(res.cgst_total, Decimal("90.00"))
        self.assertEqual(res.sgst_total, Decimal("90.00"))
        self.assertEqual(res.igst_total, Decimal("0.00"))
        self.assertEqual(res.invoice_total, Decimal("1180.00"))
        self.assertTrue(res.is_balanced)

    def test_inter_state_igst(self):
        """Inter-state 12% on ₹5,000 should compute ₹600 IGST, ₹0 CGST/SGST."""
        items = [{"description": "Delhi Botanical Essence", "taxable_amount": 5000.00, "gst_rate": 12}]
        res = calculate_and_validate_gst(items=items, is_interstate=True)
        self.assertEqual(res.cgst_total, Decimal("0.00"))
        self.assertEqual(res.sgst_total, Decimal("0.00"))
        self.assertEqual(res.igst_total, Decimal("600.00"))
        self.assertEqual(res.invoice_total, Decimal("5600.00"))

    def test_multi_slab_invoice(self):
        """Multi-slab invoice: 0% + 5% + 18% items must preserve separate calculations."""
        items = [
            {"description": "Organic Veggies", "taxable_amount": 1000.00, "gst_rate": 0},
            {"description": "Dairy Paneer", "taxable_amount": 2000.00, "gst_rate": 5},
            {"description": "Fine Pastry Flavors", "taxable_amount": 1000.00, "gst_rate": 18}
        ]
        res = calculate_and_validate_gst(items=items, is_interstate=False, other_charges=50.00, discount=20.00)
        # Taxable: 1000 + 2000 + 1000 = 4000
        self.assertEqual(res.total_taxable, Decimal("4000.00"))
        # 5% on 2000 = 100 (50 CGST + 50 SGST)
        # 18% on 1000 = 180 (90 CGST + 90 SGST)
        # Total CGST = 140, Total SGST = 140
        self.assertEqual(res.cgst_total, Decimal("140.00"))
        self.assertEqual(res.sgst_total, Decimal("140.00"))
        # Total before round off: 4000 + 140 + 140 + 50 - 20 = 4310
        self.assertEqual(res.invoice_total, Decimal("4310.00"))

    def test_paisa_rounding_precision(self):
        """Decimal half-up rounding test on odd paisa tax amounts."""
        items = [{"description": "Item", "taxable_amount": 333.33, "gst_rate": 5}]
        res = calculate_and_validate_gst(items=items, is_interstate=False)
        # 333.33 * 2.5% = 8.33325 -> 8.33
        self.assertEqual(res.cgst_total + res.sgst_total, Decimal("16.67"))


class TestVoucherBalancingAndXML(unittest.TestCase):
    def test_voucher_draft_balancing(self):
        """Voucher debits must exactly equal credits."""
        items = [
            {"description": "Room Linen", "taxable_amount": 10000.00, "gst_rate": 5, "ledger_name": "Purchase - Housekeeping Linens 5%"}
        ]
        draft = VoucherDraft(
            voucher_type="Purchase",
            company_name="Chinar Resort & Spa Pvt Ltd. ACUTAL",
            date_str="2026-10-27",
            supplier_name="Himalayan Clean & Care Linens",
            invoice_number="INV-TEST-001",
            narration="Test Purchase Voucher",
            items=items,
            is_interstate=False
        )
        is_valid, errors, preview = draft.validate_and_build()
        self.assertTrue(is_valid)
        self.assertEqual(len(errors), 0)
        self.assertEqual(preview["debit_sum"], preview["credit_sum"])
        self.assertEqual(preview["invoice_total"], 10500.00)

    def test_tally7_xml_generation(self):
        """XML must contain Tally 7.1 envelope, YYYYMMDD date, supplier reference, and ledger entries."""
        items = [
            {"description": "Organic Produce", "taxable_amount": 2000.00, "gst_rate": 0, "ledger_name": "Purchase - Groceries 0%"}
        ]
        draft = VoucherDraft(
            voucher_type="Purchase",
            company_name="Chinar Resort & Spa Pvt Ltd. ACUTAL",
            date_str="2026-10-25",
            supplier_name="Kashmir Agro Food Suppliers",
            invoice_number="KAF/2026/01",
            narration="Fresh pantry supply",
            items=items,
            is_interstate=False
        )
        xml_str = draft.generate_tally7_xml()

        # Validate that XML is well-formed
        root = ET.fromstring(xml_str)
        self.assertEqual(root.tag, "ENVELOPE")
        self.assertIsNotNone(root.find(".//VOUCHER"))
        self.assertEqual(root.find(".//DATE").text, "20261025")
        self.assertEqual(root.find(".//REFERENCE").text, "KAF/2026/01")
        self.assertEqual(root.find(".//PARTYLEDGERNAME").text, "Kashmir Agro Food Suppliers")

    def test_date_formatting(self):
        self.assertEqual(format_tally_date("2026-10-27"), "20261027")
        self.assertEqual(format_tally_date("27/10/2026"), "20261027")


class TestLedgerMatching(unittest.TestCase):
    def setUp(self):
        self.mock_ledgers = [
            {"name": "Kashmir Agro Food Suppliers", "parent": "Sundry Creditors"},
            {"name": "Purchase - Groceries 18%", "parent": "Purchase Accounts"},
            {"name": "Input CGST 9%", "parent": "Duties & Taxes"}
        ]

    def test_exact_match(self):
        res = match_ledger("Kashmir Agro Food Suppliers", self.mock_ledgers)
        self.assertEqual(res["status"], "EXACT")
        self.assertFalse(res["requires_confirmation"])

    def test_fuzzy_candidate_match(self):
        res = match_ledger("Kashmir Agro Foods", self.mock_ledgers)
        self.assertEqual(res["status"], "AMBIGUOUS")
        self.assertTrue(res["requires_confirmation"])
        self.assertGreater(len(res["possible_matches"]), 0)

    def test_not_found(self):
        res = match_ledger("Unregistered New Supplier XYZ", self.mock_ledgers)
        self.assertEqual(res["status"], "NOT_FOUND")
        self.assertTrue(res["requires_confirmation"])


class TestBulkRecommendations(unittest.TestCase):
    def test_bank_statement_recommendations(self):
        from backend.ai_service import recommend_bulk_ledgers
        mock_ledgers = [
            {"name": "Electricity Charges - Resort Complex", "parent": "Direct Expenses"},
            {"name": "MakeMyTrip India Pvt Ltd", "parent": "Sundry Debtors"},
            {"name": "Diesel for Boiler & Heating", "parent": "Direct Expenses"}
        ]
        txs = [
            {"narration": "NEFT OUT: KASHMIR POWER CORP ELECTRICITY", "amount": 45000, "type": "Withdrawal"},
            {"narration": "RTGS INW: MAKEMYTRIP INDIA PVT LTD PAYOUT", "amount": 120000, "type": "Deposit"},
        ]
        recs = recommend_bulk_ledgers(txs, mock_ledgers, batch_type="bank")
        self.assertEqual(len(recs), 2)
        self.assertEqual(recs[0]["suggested_ledger"], "Electricity Charges - Resort Complex")
        self.assertGreaterEqual(recs[0]["confidence"], 90)
        self.assertEqual(recs[1]["suggested_ledger"], "MakeMyTrip India Pvt Ltd")
        self.assertGreaterEqual(recs[1]["confidence"], 90)


if __name__ == "__main__":
    unittest.main()

