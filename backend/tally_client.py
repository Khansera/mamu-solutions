"""
Tally 7.1 XML HTTP Client.
Directly communicates with Tally 7.1 server on http://localhost:9000 via XML POST requests.
Includes full error diagnostics, XML parsing with ElementTree, entity safety, and connection tests.
"""
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional, Tuple
import html
import re


class TallyClientError(Exception):
    def __init__(self, message: str, raw_response: Optional[str] = None, status_code: Optional[int] = None):
        super().__init__(message)
        self.raw_response = raw_response
        self.status_code = status_code


class Tally7Client:
    def __init__(self, base_url: str = "http://localhost:9000", timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def send_xml_request(self, xml_payload: str) -> str:
        """
        Sends an XML POST request to the Tally 7.1 server.
        Handles connection refused, timeouts, and HTTP errors with clear diagnostics.
        """
        headers = {
            "Content-Type": "text/xml; charset=utf-8",
            "Accept": "text/xml"
        }
        data = xml_payload.encode("utf-8")
        req = urllib.request.Request(self.base_url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                status = resp.status
                body = resp.read()
                # Tally 7.1 might return UTF-16, UTF-8 or CP1252
                try:
                    decoded = body.decode("utf-8")
                except UnicodeDecodeError:
                    try:
                        decoded = body.decode("utf-16")
                    except UnicodeDecodeError:
                        decoded = body.decode("latin-1", errors="replace")

                if status != 200:
                    raise TallyClientError(
                        f"Tally responded with HTTP {status}",
                        raw_response=decoded,
                        status_code=status
                    )
                return decoded

        except urllib.error.HTTPError as e:
            raw = ""
            try:
                raw = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            raise TallyClientError(
                f"Tally HTTP Error {e.code}: {e.reason}",
                raw_response=raw,
                status_code=e.code
            )
        except urllib.error.URLError as e:
            reason = str(e.reason)
            hint = ""
            if "10061" in reason or "Connection refused" in reason:
                hint = (
                    " — Ensure Tally 7.1 is running on Windows 10, open F12 > Advanced Configuration, "
                    "verify 'Tally is acting as: Server' or 'Both', and Port is set to 9000."
                )
            raise TallyClientError(
                f"Cannot connect to Tally at {self.base_url}: {reason}{hint}"
            )
        except TimeoutError:
            raise TallyClientError(
                f"Connection to Tally at {self.base_url} timed out after {self.timeout}s."
            )
        except Exception as e:
            raise TallyClientError(f"Unexpected error communicating with Tally: {str(e)}")

    def test_connection(self) -> Dict[str, Any]:
        """
        Tests connectivity to Tally 7.1 by requesting current company info.
        """
        envelope = (
            "<ENVELOPE>\r\n"
            "  <HEADER>\r\n"
            "    <TALLYREQUEST>Export Data</TALLYREQUEST>\r\n"
            "  </HEADER>\r\n"
            "  <BODY>\r\n"
            "    <EXPORTDATA>\r\n"
            "      <REQUESTDESC>\r\n"
            "        <REPORTNAME>List of Accounts</REPORTNAME>\r\n"
            "        <STATICVARIABLES>\r\n"
            "          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\r\n"
            "          <ACCOUNTTYPE>All</ACCOUNTTYPE>\r\n"
            "        </STATICVARIABLES>\r\n"
            "      </REQUESTDESC>\r\n"
            "    </EXPORTDATA>\r\n"
            "  </BODY>\r\n"
            "</ENVELOPE>"
        )
        try:
            raw = self.send_xml_request(envelope)
            # Parse XML response
            root = ET.fromstring(raw)
            company_name = self._extract_company_name(root)
            return {
                "connected": True,
                "url": self.base_url,
                "active_company": company_name or "Unknown (Company Loaded)",
                "raw_preview": raw[:300]
            }
        except TallyClientError as e:
            return {
                "connected": False,
                "url": self.base_url,
                "error": str(e),
                "raw_response": e.raw_response
            }
        except ET.ParseError as e:
            return {
                "connected": False,
                "url": self.base_url,
                "error": f"Invalid XML response from Tally: {str(e)}"
            }

    def get_ledgers(self) -> List[Dict[str, Any]]:
        """
        Retrieves all ledgers, their parent groups, opening balances, and GST rates from Tally 7.1.
        """
        envelope = (
            "<ENVELOPE>\r\n"
            "  <HEADER>\r\n"
            "    <TALLYREQUEST>Export Data</TALLYREQUEST>\r\n"
            "  </HEADER>\r\n"
            "  <BODY>\r\n"
            "    <EXPORTDATA>\r\n"
            "      <REQUESTDESC>\r\n"
            "        <REPORTNAME>List of Accounts</REPORTNAME>\r\n"
            "        <STATICVARIABLES>\r\n"
            "          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\r\n"
            "          <ACCOUNTTYPE>Ledgers</ACCOUNTTYPE>\r\n"
            "        </STATICVARIABLES>\r\n"
            "      </REQUESTDESC>\r\n"
            "    </EXPORTDATA>\r\n"
            "  </BODY>\r\n"
            "</ENVELOPE>"
        )
        raw = self.send_xml_request(envelope)
        root = ET.fromstring(raw)
        return self._parse_ledgers_xml(root)

    def get_vouchers(self, from_date: str = "20260401", to_date: str = "20261027") -> List[Dict[str, Any]]:
        """
        Retrieves vouchers within the given date range (YYYYMMDD format).
        """
        envelope = (
            f"<ENVELOPE>\r\n"
            f"  <HEADER>\r\n"
            f"    <TALLYREQUEST>Export Data</TALLYREQUEST>\r\n"
            f"  </HEADER>\r\n"
            f"  <BODY>\r\n"
            f"    <EXPORTDATA>\r\n"
            f"      <REQUESTDESC>\r\n"
            f"        <REPORTNAME>Voucher Register</REPORTNAME>\r\n"
            f"        <STATICVARIABLES>\r\n"
            f"          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\r\n"
            f"          <SVFROMDATE>{from_date}</SVFROMDATE>\r\n"
            f"          <SVTODATE>{to_date}</SVTODATE>\r\n"
            f"        </STATICVARIABLES>\r\n"
            f"      </REQUESTDESC>\r\n"
            f"    </EXPORTDATA>\r\n"
            f"  </BODY>\r\n"
            f"</ENVELOPE>"
        )
        raw = self.send_xml_request(envelope)
        root = ET.fromstring(raw)
        return self._parse_vouchers_xml(root)

    def import_voucher_xml(self, voucher_xml: str) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Sends voucher XML to Tally for import.
        Never fabricates success: strictly inspects Tally's response for <LINEERROR>,
        <STATUS>0</STATUS>, or <ERRORS> tags.
        """
        raw = self.send_xml_request(voucher_xml)
        try:
            root = ET.fromstring(raw)
            # Check for error elements
            errors: List[str] = []
            for err_elem in root.findall(".//LINEERROR"):
                if err_elem.text:
                    errors.append(err_elem.text.strip())

            status_elem = root.find(".//STATUS")
            if status_elem is not None and status_elem.text == "0":
                errors.append("Tally import returned Status 0 (Failed).")

            created_elem = root.find(".//CREATED")
            created_count = int(created_elem.text) if (created_elem is not None and created_elem.text and created_elem.text.isdigit()) else 0
            altered_elem = root.find(".//ALTERED")
            altered_count = int(altered_elem.text) if (altered_elem is not None and altered_elem.text and altered_elem.text.isdigit()) else 0
            errors_elem = root.find(".//ERRORS")
            error_count = int(errors_elem.text) if (errors_elem is not None and errors_elem.text and errors_elem.text.isdigit()) else len(errors)

            if error_count > 0 or len(errors) > 0 or (created_count == 0 and altered_count == 0):
                msg = "; ".join(errors) if errors else "Tally rejected the import without specific error message."
                return False, msg, {"created": created_count, "altered": altered_count, "errors": error_count, "raw": raw[:500]}

            return True, f"Successfully imported voucher into Tally. Created: {created_count}, Altered: {altered_count}", {
                "created": created_count,
                "altered": altered_count,
                "errors": error_count
            }

        except ET.ParseError as e:
            return False, f"Failed to parse Tally response XML: {str(e)}", {"raw": raw[:500]}

    def _extract_company_name(self, root: ET.Element) -> Optional[str]:
        # Tally 7.1 often puts active company in <SVCURRENTCOMPANY> or in header
        curr_comp = root.find(".//SVCURRENTCOMPANY")
        if curr_comp is not None and curr_comp.text:
            return curr_comp.text.strip()
        comp_elem = root.find(".//COMPANY")
        if comp_elem is not None and comp_elem.text:
            return comp_elem.text.strip()
        return None

    def _parse_ledgers_xml(self, root: ET.Element) -> List[Dict[str, Any]]:
        ledgers = []
        for ledger_elem in root.findall(".//LEDGER"):
            name = ledger_elem.get("NAME") or ""
            if not name:
                name_elem = ledger_elem.find("NAME")
                if name_elem is not None and name_elem.text:
                    name = name_elem.text.strip()

            if not name:
                continue

            parent_elem = ledger_elem.find("PARENT")
            parent = parent_elem.text.strip() if parent_elem is not None and parent_elem.text else "Primary"

            op_bal_elem = ledger_elem.find("OPENINGBALANCE")
            op_bal = op_bal_elem.text.strip() if op_bal_elem is not None and op_bal_elem.text else "0.00"

            tax_type_elem = ledger_elem.find("TAXTYPE")
            tax_type = tax_type_elem.text.strip() if tax_type_elem is not None and tax_type_elem.text else None

            rate_elem = ledger_elem.find("RATEOFTAXCALCULATION")
            rate = float(rate_elem.text.strip()) if rate_elem is not None and rate_elem.text else None

            # Infer GST rate and type from ledger name if not explicitly present
            inferred_rate, inferred_type = self._infer_gst_from_name(name, parent)

            ledgers.append({
                "name": name,
                "parent": parent,
                "opening_balance": op_bal,
                "tax_type": tax_type or inferred_type,
                "gst_rate": rate if rate is not None else inferred_rate,
                "is_revenue": parent in ("Purchase Accounts", "Sales Accounts", "Direct Expenses", "Indirect Expenses", "Direct Incomes", "Indirect Incomes"),
                "is_party": parent in ("Sundry Creditors", "Sundry Debtors", "Bank Accounts", "Cash-in-Hand")
            })

        return ledgers

    def _infer_gst_from_name(self, name: str, parent: str) -> Tuple[Optional[float], Optional[str]]:
        upper = name.upper()
        # Look for CGST/SGST/IGST
        tax_type = None
        if "CGST" in upper or "CENTRAL GST" in upper:
            tax_type = "CGST"
        elif "SGST" in upper or "STATE GST" in upper:
            tax_type = "SGST"
        elif "IGST" in upper or "INTEGRATED GST" in upper:
            tax_type = "IGST"
        elif "Duties & Taxes" in parent:
            tax_type = "GST"

        # Match rate pattern like 2.5%, 5%, 6%, 9%, 12%, 14%, 18%, 28%
        match = re.search(r"(\d+(\.\d+)?)%", upper)
        rate = float(match.group(1)) if match else None
        return rate, tax_type

    def _parse_vouchers_xml(self, root: ET.Element) -> List[Dict[str, Any]]:
        vouchers = []
        for vch_elem in root.findall(".//VOUCHER"):
            vch_type = vch_elem.get("VCHTYPE") or ""
            if not vch_type:
                type_elem = vch_elem.find("VOUCHERTYPENAME")
                vch_type = type_elem.text.strip() if type_elem is not None and type_elem.text else "Journal"

            date_elem = vch_elem.find("DATE")
            date_str = date_elem.text.strip() if date_elem is not None and date_elem.text else ""

            vch_no_elem = vch_elem.find("VOUCHERNUMBER")
            vch_no = vch_no_elem.text.strip() if vch_no_elem is not None and vch_no_elem.text else ""

            ref_elem = vch_elem.find("REFERENCE")
            ref_no = ref_elem.text.strip() if ref_elem is not None and ref_elem.text else ""

            narration_elem = vch_elem.find("NARRATION")
            narration = narration_elem.text.strip() if narration_elem is not None and narration_elem.text else ""

            entries = []
            party_name = ""
            total_amount = 0.0

            for entry in vch_elem.findall(".//ALLLEDGERENTRIES.LIST"):
                led_elem = entry.find("LEDGERNAME")
                led_name = led_elem.text.strip() if led_elem is not None and led_elem.text else ""

                amt_elem = entry.find("AMOUNT")
                amt_str = amt_elem.text.strip() if amt_elem is not None and amt_elem.text else "0.00"
                try:
                    amt = float(amt_str)
                except ValueError:
                    amt = 0.0

                pos_elem = entry.find("ISDEEMEDPOSITIVE")
                is_positive = (pos_elem.text.strip().lower() == "yes") if pos_elem is not None and pos_elem.text else False

                entries.append({
                    "ledger_name": led_name,
                    "amount": amt,
                    "is_deemed_positive": is_positive
                })

                if not party_name and (("Sundry" in led_name) or ("Bank" in led_name) or (not is_positive and vch_type == "Purchase")):
                    party_name = led_name
                if abs(amt) > total_amount:
                    total_amount = abs(amt)

            vouchers.append({
                "voucher_type": vch_type,
                "date": date_str,
                "voucher_number": vch_no,
                "reference": ref_no,
                "party_name": party_name,
                "amount": total_amount,
                "narration": narration,
                "entries": entries
            })

        return vouchers
