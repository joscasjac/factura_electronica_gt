# Copyright (c) 2020, Si Hay Sistema and contributors
# Rewritten 2026 by QuestFlows: correct retention accounts, IVA retention rate and
# ISR brackets; no goal-seek rounding rows.
# For license information, please see license.txt
"""Journal Entry that collects a Sales Invoice when the customer withholds ISR and/or IVA.

When a customer is a retention agent it pays the invoice minus the retained taxes and
hands over a constancia de retención. The retained amounts are an asset for us (taxes
already paid on our behalf), so they are debited to the receivable retention accounts
configured in Company > Tax Witholding Ranges:

    Dr Bank                          grand total - ISR - IVA retained
    Dr ISR retenido por compensar    ISR retained
    Dr IVA retenido por compensar    IVA x retention rate
        Cr Receivable (customer)     grand total
"""

from __future__ import unicode_literals

from datetime import date

import frappe
from frappe import _
from frappe.utils import flt

from factura_electronica.utils.formulas import apply_formula_isr, retention_brackets

DEFAULT_IVA_RETENTION_RATE = 15


class JournalEntrySaleInvoice:
    def __init__(self, data_invoice, is_isr_ret, is_iva_ret, debit_in_acc_currency,
                 is_multicurrency=0, cost_center='', descr='', iva_retention_rate=None):
        self.invoice = data_invoice
        self.company = data_invoice.get("company")
        self.posting_date = data_invoice.get("posting_date")
        self.grand_total = flt(data_invoice.get("grand_total"))
        self.base_grand_total = flt(data_invoice.get("base_grand_total"))
        self.debit_to = data_invoice.get("debit_to")
        self.currency = data_invoice.get("currency")
        self.conversion_rate = flt(data_invoice.get("conversion_rate")) or 1
        self.customer = data_invoice.get("customer")
        self.name_inv = data_invoice.get("name")
        self.bank_account = debit_in_acc_currency
        self.cost_center = cost_center or ''
        self.is_multicurrency = int(is_multicurrency or 0)
        self.is_isr_retention = int(is_isr_ret or 0)
        self.is_iva_retention = int(is_iva_ret or 0)
        self.iva_retention_rate = flt(iva_retention_rate) if iva_retention_rate else DEFAULT_IVA_RETENTION_RATE
        self.remarks = descr
        self.ISR_PAYABLE_GTQ = 0
        self.IVA_OPE = 0
        self.rows_journal_entry = []

    # -- amounts in company currency (GTQ) ------------------------------------------
    def vat_rate(self):
        brackets = retention_brackets(self.company)
        rate = flt(brackets[0].get("iva_percentage_rate")) if brackets else 12
        return (rate or 12) / 100

    def invoice_iva(self):
        """IVA on the invoice in GTQ: the taxes rows when present, else grand total / 1.12."""
        iva = sum(
            flt(row.base_tax_amount_after_discount_amount or row.base_tax_amount)
            for row in self.invoice.get("taxes") or []
            if (row.get("tax_name") or "").upper().startswith("IVA")
            or "IVA" in (row.get("account_head") or "").upper()
        )
        if iva:
            return flt(iva, 2)
        return flt(self.base_grand_total - self.base_grand_total / (1 + self.vat_rate()), 2)

    def compute(self):
        if self.is_isr_retention:
            net = self.base_grand_total - self.invoice_iva()
            self.ISR_PAYABLE_GTQ = flt(apply_formula_isr(net, self.company), 2)
        if self.is_iva_retention:
            self.IVA_OPE = flt(self.invoice_iva() * self.iva_retention_rate / 100, 2)

    # -- rows -----------------------------------------------------------------------
    def _account_currency(self, account):
        return frappe.db.get_value("Account", account, "account_currency")

    def _row(self, account, debit_gtq=0, credit_gtq=0, **extra):
        currency = self._account_currency(account)
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
        rate = 1 if currency == company_currency else self.conversion_rate
        row = {
            "account": account,
            "cost_center": self.cost_center,
            "account_currency": currency,
            "exchange_rate": rate,
            "debit_in_account_currency": flt(debit_gtq / rate, 2),
            "credit_in_account_currency": flt(credit_gtq / rate, 2),
            "debit": flt(debit_gtq, 2),
            "credit": flt(credit_gtq, 2),
        }
        row.update(extra)
        return row

    def _retention_account(self, receivable_field, fallback_field):
        for bracket in retention_brackets(self.company):
            account = bracket.get(receivable_field) or bracket.get(fallback_field)
            if account:
                return account
        return None

    def build_rows(self):
        receivable = self._row(
            self.debit_to,
            credit_gtq=self.base_grand_total,
            party_type="Customer",
            party=self.customer,
            reference_type="Sales Invoice",
            reference_name=self.name_inv,
        )
        if receivable["account_currency"] == self.currency:
            receivable["credit_in_account_currency"] = self.grand_total
        rows = [receivable]

        if self.ISR_PAYABLE_GTQ:
            account = self._retention_account("isr_account_receivable", "isr_account_payable")
            if not account:
                return False, _("Configure the ISR retention account in Company > Tax Witholding Ranges")
            rows.append(self._row(account, debit_gtq=self.ISR_PAYABLE_GTQ))
        if self.IVA_OPE:
            account = self._retention_account("vat_retention_to_compensate", "vat_account_receivable")
            if not account:
                return False, _("Configure the IVA retention account in Company > Tax Witholding Ranges")
            rows.append(self._row(account, debit_gtq=self.IVA_OPE))

        bank_gtq = flt(self.base_grand_total - self.ISR_PAYABLE_GTQ - self.IVA_OPE, 2)
        rows.append(self._row(self.bank_account, debit_gtq=bank_gtq))

        # Rounding difference from converting the bank row to its currency.
        difference = flt(sum(r["credit"] for r in rows) - sum(r["debit"] for r in rows), 2)
        if difference:
            round_off = frappe.get_cached_value("Company", self.company, "round_off_account")
            rows.append(self._row(round_off, debit_gtq=max(difference, 0), credit_gtq=max(-difference, 0)))
        self.rows_journal_entry = rows
        return True, "OK"

    def create(self):
        """Create the draft Journal Entry. Returns (True, name) or (False, message)."""
        try:
            if not self.cost_center:
                self.cost_center = frappe.get_cached_value("Company", self.company, "cost_center")
            if (self.is_isr_retention or self.is_iva_retention) and not retention_brackets(self.company):
                return False, _("No retention ranges are configured in Company > Tax Witholding Ranges")
            self.compute()
            status = self.build_rows()
            if not status[0]:
                return status
            journal = frappe.get_doc({
                "doctype": "Journal Entry",
                "voucher_type": "Journal Entry",
                "company": self.company,
                "posting_date": self.posting_date,
                "user_remark": self.remarks,
                "accounts": self.rows_journal_entry,
                "multi_currency": 1 if self.is_multicurrency or self._needs_multicurrency() else 0,
            })
            journal.insert(ignore_permissions=True)
        except Exception:
            return False, _("Could not create the Journal Entry: {0}").format(frappe.get_traceback())

        tax_id = frappe.db.get_value("Customer", self.customer, "tax_id") or ""
        for kind, amount in (("ISR", self.ISR_PAYABLE_GTQ), ("IVA", self.IVA_OPE)):
            if amount:
                register_withholding({
                    "retention_type": kind,
                    "party_type": "Customer",
                    "party": self.customer,
                    "company": self.company,
                    "tax_id": tax_id,
                    "sales_invoice": self.name_inv,
                    "journal_entry": journal.name,
                    "invoice_date": self.posting_date,
                    "grand_total": self.grand_total,
                    "currency": self.currency,
                    "retention_amount": amount,
                })
        return True, journal.name

    def _needs_multicurrency(self):
        company_currency = frappe.get_cached_value("Company", self.company, "default_currency")
        return any(r["account_currency"] != company_currency for r in self.rows_journal_entry)


def register_withholding(data_ret):
    """Record a retention (one row per ISR / IVA) so its constancia can be tracked."""
    try:
        record = frappe.new_doc("Tax Retention Guatemala")
        record.date = data_ret.get("date") or str(date.today())
        for field in ("retention_type", "party_type", "party", "company", "tax_id", "sales_invoice",
                      "purchase_invoice", "journal_entry", "invoice_date", "grand_total", "currency",
                      "retention_amount", "retention_confirmation"):
            if data_ret.get(field) is not None:
                record.set(field, data_ret.get(field))
        record.insert(ignore_permissions=True)
    except Exception:
        frappe.log_error(title="Tax Retention Guatemala", message=frappe.get_traceback())
        return False, _("Could not register the retention")
    return True, record.name
