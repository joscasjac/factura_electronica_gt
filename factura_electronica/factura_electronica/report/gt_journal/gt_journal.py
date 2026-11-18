# Copyright (c) 2013, Frappe and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _, _dict
from datetime import datetime


def execute(filters=None):
    if not filters:
        return [], []

    columns = get_columns()
    data = get_all_data(filters)

    return columns, data


def get_columns():
    """
    Assigns the properties for each column to be displayed in the report

    Args:
        filters (dict): Front end filters

    Returns:
        list: List of dictionaries
    """
    columns = [
        {
            "label": _("Fecha"),
            "fieldname": "fecha",
            "fieldtype": "Data",
            "width": 100
        },
        {
            "label": _("Cuenta"),
            "fieldname": "poliza",
            "fieldtype": "Data",
            "width": 260
        },
        {
            "label": _("Explicación"),
            "fieldname": "explicacion",
            "fieldtype": "Data",
            "width": 310
        },
        {
            "label": _("Débitos"),
            "fieldname": "debito",
            "fieldtype": "Currency",
            "options": "currency",
            "width": 130
        },
        {
            "label": _("Créditos"),
            "fieldname": "credito",
            "fieldtype": "Currency",
            "options": "currency",
            "width": 130
        },
        {
            "label": _("Currency"),
            "fieldname": "currency",
            "fieldtype": "Link",
            "options": "Currency",
            # "width": 250,
            "hidden": 1
        }
    ]

    return columns


def get_all_data(filters):
    """Libro Diario (Código de Comercio art. 368): every posted voucher in date order.

    Built from GL Entry so invoices, payments, payroll and journal entries all appear,
    not only Journal Entries (upstream also listed drafts and cancelled entries).
    Each voucher prints a heading row, its accounts, and a sub-total row.
    """
    filters = frappe._dict(filters)
    currency = filters.company_currency or frappe.get_cached_value("Company", filters.company, "default_currency")
    entries = frappe.get_all(
        "GL Entry",
        filters={
            "company": filters.company,
            "posting_date": ["between", [filters.from_date, filters.to_date]],
            "is_cancelled": 0,
        },
        fields=["posting_date", "voucher_type", "voucher_no", "account", "debit", "credit", "remarks"],
        order_by="posting_date asc, creation asc, voucher_no asc, debit desc",
    )
    data = []
    current = None
    debit = credit = 0
    numero = 0

    def close():
        data.append({"explicacion": "<b>Sub-Total</b>", "debito": debit, "credito": credit, "currency": currency})
        data.append({})

    for entry in entries:
        key = (entry.voucher_type, entry.voucher_no)
        if key != current:
            if current:
                close()
            numero += 1
            current = key
            debit = credit = 0
            data.append({
                "fecha": datetime.strftime(entry.posting_date, "%d/%m/%Y"),
                "poliza": "<b>Partida {0}</b>".format(numero),
                "explicacion": "{0} {1}{2}".format(
                    _(entry.voucher_type), entry.voucher_no,
                    (": " + entry.remarks[:120]) if entry.remarks and entry.remarks != "No Remarks" else ""),
                "voucher_type": entry.voucher_type,
                "voucher_no": entry.voucher_no,
            })
        data.append({"poliza": entry.account, "debito": entry.debit, "credito": entry.credit, "currency": currency})
        debit += entry.debit
        credit += entry.credit
    if current:
        close()
    return data
