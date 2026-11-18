# Copyright (c) 2013, Frappe and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import json

import frappe
from frappe import _, _dict, scrub
from frappe.utils import cstr, flt, get_site_name, nowdate


def execute(filters=None):
    """
    Funcion principal del reporte

    Args:
        filters (dict, optional): Filtros front end. Defaults to None.

    Returns:
        tuple: columnas y datos
    """

    columns = get_columns()
    data = get_data(filters)

    return columns, data


def get_columns():
    """
    Asigna las propiedades para cada columna que va en el reporte

    Args:
        filters (dict): Filtros front end

    Returns:
        list: Lista de diccionarios
    """

    columns = [
        {
            "label": _("Retention Date"),
            "fieldname": "retention_date",
            "fieldtype": "Date",
            "width": 110
        },
        {
            "label": _("Retention Type"),
            "fieldname": "retention_type",
            "fieldtype": "Data",
            "width": 120
        },
        {
            "label": _("Invoice Number"),
            "fieldname": "invoice_number",
            "fieldtype": "Data",
            "width": 170
        },
        {
            "label": _("Tax ID"),
            "fieldname": "tax_id",
            "fieldtype": "Data",
            "width": 110
        },
        {
            "label": _("Entity"),
            "fieldname": "entity",
            "fieldtype": "Data",
            "width": 220
        },
        {
            "label": _("Invoice Date"),
            "fieldname": "invoice_date",
            "fieldtype": "Date",
            "width": 110
        },
        {
            "label": _("Invoice Total"),
            "fieldname": "invoice_total",
            "fieldtype": "Currency",
            "width": 130
        },
        {
            "label": _("Retention Amount"),
            "fieldname": "retention_amount",
            "fieldtype": "Currency",
            "width": 140
        },
        {
            "label": _("Purchase Ledger Number"),
            "fieldname": "purchase_ledger_number",
            "fieldtype": "Data",
            "width": 150
        },
        {
            "label": _("Journal Entry"),
            "fieldname": "journal_entry",
            "fieldtype": "Data",
            "width": 170
        },
        {
            "label": _("Retention Confirmation Number"),
            "fieldname": "retention_confirmation_number",
            "fieldtype": "Data",
            "width": 190
        },
    ]

    return columns


def get_data(filters):
    """Retentions registered in Tax Retention Guatemala (sales JEs and Facturas Especiales).

    tipo_de_factura "Customer": retentions customers made on our sales (ISR/IVA to
    compensate). "Supplier": retentions we made (Factura Especial). Empty: both.
    """
    filters = frappe._dict(filters or {})
    conditions = {
        "company": filters.company,
        "date": ["between", [filters.from_date, filters.to_date]],
    }
    if filters.tipo_de_factura:
        conditions["party_type"] = filters.tipo_de_factura
    rows = frappe.get_all(
        "Tax Retention Guatemala",
        filters=conditions,
        fields=["date", "retention_type", "party_type", "party", "tax_id", "sales_invoice",
                "purchase_invoice", "invoice_date", "grand_total", "retention_amount",
                "journal_entry", "retention_confirmation"],
        order_by="date asc, name asc",
    )
    data = []
    for row in rows:
        data.append({
            "retention_date": row.date,
            "retention_type": row.retention_type,
            "invoice_number": row.sales_invoice or row.purchase_invoice,
            "tax_id": row.tax_id,
            "entity": row.party,
            "invoice_date": row.invoice_date,
            "invoice_total": row.grand_total,
            "retention_amount": row.retention_amount,
            "purchase_ledger_number": row.purchase_invoice or "",
            "journal_entry": row.journal_entry,
            "retention_confirmation_number": row.retention_confirmation,
        })
    return data
