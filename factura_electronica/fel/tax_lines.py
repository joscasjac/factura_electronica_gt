# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""Per-line FEL taxes from ERPNext v16's Item Wise Tax Detail.

The generators used to recompute every line's IVA as net_amount x taxes[0].rate
and the totals from facelec_sales_tax_for_this_row (amount / 1.12). That breaks
as soon as a line has a second tax or none:

- A hotel room (IVA 12% + INGUAT 10%, prices tax-included) got a total IVA of
  13.07 on Q122 instead of 12.00, so the lines did not add up to TotalImpuestos.
- Exempt lines (item tax template at 0%) were still sent with 12% IVA.

Here each line's taxes come from the amounts ERPNext actually posted, tagged
with the SAT tax name and unit code on the invoice's tax rows (taxable_unit_name).
Totals are summed from the same line values, so they always reconcile.
"""

from __future__ import unicode_literals

from collections import OrderedDict

import frappe
from frappe.utils import flt

IVA = "IVA"
IVA_EXEMPT_UNIT_CODE = 2  # SAT catalog: IVA, unidad gravable 2 = exento / tasa 0


def item_taxes(invoice_name, parenttype="Sales Invoice"):
    """{item_row_name: [{"tax_name", "code", "taxable", "amount"}, ...]} in tax-row order.

    Returns {} when the site has no Item Wise Tax Detail (pre-v16) so callers can
    fall back to the old calculation.
    """
    if not frappe.db.table_exists("Item Wise Tax Detail"):
        return {}
    tax_child = "Sales Taxes and Charges" if parenttype == "Sales Invoice" else "Purchase Taxes and Charges"
    name_field, code_field = (
        ("tax_name", "taxable_unit_code")
        if tax_child == "Sales Taxes and Charges"
        else ("facelec_tax_name", "facelec_taxable_unit_code")
    )
    tax_rows = {
        row.name: row
        for row in frappe.get_all(
            tax_child,
            {"parent": invoice_name, "parenttype": parenttype},
            ["name", "idx", name_field + " as tax_name", code_field + " as code"],
        )
    }
    details = frappe.get_all(
        "Item Wise Tax Detail",
        {"parent": invoice_name, "parenttype": parenttype},
        ["item_row", "tax_row", "amount", "taxable_amount"],
    )
    result = {}
    for detail in sorted(details, key=lambda d: tax_rows.get(d.tax_row, frappe._dict(idx=0)).idx or 0):
        row = tax_rows.get(detail.tax_row)
        if not row or not row.tax_name:
            continue
        result.setdefault(detail.item_row, []).append(
            {
                "tax_name": row.tax_name,
                "code": row.code,
                "taxable": flt(detail.taxable_amount),
                "amount": flt(detail.amount),
            }
        )
    return result


def line_impuestos(taxes, precision=2):
    """dte:Impuesto entries for one line.

    IVA is always present (exempt lines use unidad gravable 2 with MontoImpuesto 0);
    other taxes (TURISMO HOSPEDAJE, ...) only when the line actually paid them.
    """
    impuestos = []
    for tax in taxes:
        amount = abs(flt(tax["amount"], precision))
        taxable = abs(flt(tax["taxable"], precision))
        if tax["tax_name"] == IVA:
            exempt = amount == 0
            impuestos.append(
                OrderedDict(
                    [
                        ("dte:NombreCorto", IVA),
                        ("dte:CodigoUnidadGravable", IVA_EXEMPT_UNIT_CODE if exempt else tax["code"]),
                        ("dte:MontoGravable", taxable),
                        ("dte:MontoImpuesto", 0.0 if exempt else amount),
                    ]
                )
            )
        elif amount:
            impuestos.append(
                OrderedDict(
                    [
                        ("dte:NombreCorto", tax["tax_name"]),
                        ("dte:CodigoUnidadGravable", tax["code"]),
                        ("dte:MontoGravable", taxable),
                        ("dte:MontoImpuesto", amount),
                    ]
                )
            )
    return impuestos


def has_exempt_line(items_by_row):
    return any(
        tax["tax_name"] == IVA and not flt(tax["amount"]) for taxes in items_by_row.values() for tax in taxes
    )


def total_impuestos(items, precision=2):
    """dte:TotalImpuesto list summed from the built dte:Item entries, by NombreCorto."""
    totals = OrderedDict()
    for item in items:
        impuestos = (item.get("dte:Impuestos") or {}).get("dte:Impuesto") or []
        if isinstance(impuestos, dict):
            impuestos = [impuestos]
        for impuesto in impuestos:
            name = impuesto["dte:NombreCorto"]
            totals[name] = totals.get(name, 0) + flt(impuesto.get("dte:MontoImpuesto"), precision)
    return [
        OrderedDict([("@NombreCorto", name), ("@TotalMontoImpuesto", abs(flt(amount, precision)))])
        for name, amount in totals.items()
    ]


EXEMPT_PHRASE_TYPE = "4"
EXPORT_EXEMPT_SCENARIO = 1  # SAT CatalogoFrases: tipo 4, escenario 1 = Exportaciones


def items_have_exempt_iva(items):
    """True when any built dte:Item carries IVA with MontoImpuesto 0."""
    for item in items:
        impuestos = (item.get("dte:Impuestos") or {}).get("dte:Impuesto") or []
        if isinstance(impuestos, dict):
            impuestos = [impuestos]
        for impuesto in impuestos:
            if impuesto.get("dte:NombreCorto") == IVA and not flt(impuesto.get("dte:MontoImpuesto")):
                return True
    return False


def with_exempt_phrase(frases, escenario):
    """Return dte:Frases with a TipoFrase 4 entry added when it is missing.

    SAT requires the legal basis (frase 4) on any DTE with exempt lines.
    """
    entries = (frases or {}).get("dte:Frase") or []
    if isinstance(entries, dict):
        entries = [entries]
    if any(str(e.get("@TipoFrase"))[:1] == EXEMPT_PHRASE_TYPE for e in entries):
        return frases
    entries = list(entries) + [
        OrderedDict([("@CodigoEscenario", int(escenario or EXPORT_EXEMPT_SCENARIO)), ("@TipoFrase", EXEMPT_PHRASE_TYPE)])
    ]
    return {"dte:Frase": entries}


# Pequeño contribuyente documents carry no IVA breakdown (Factura / Cambiaria Pequeño Contribuyente).
NO_TAX_TYPES = ("FPEQ", "FCAP")


def strip_taxes_for_type(tipo, items, totales):
    """For FPEQ/FCAP remove each line's dte:Impuestos and the dte:TotalImpuestos block."""
    if tipo not in NO_TAX_TYPES:
        return items, totales
    for item in items:
        item.pop("dte:Impuestos", None)
    totales = OrderedDict((k, v) for k, v in (totales or {}).items() if k != "dte:TotalImpuestos")
    return items, totales


def sumable_tax_amount(taxes, precision=2):
    """Taxes other than IVA on a line: SAT adds them on top of Precio - Descuento."""
    return flt(sum(abs(flt(t["amount"], precision)) for t in taxes if t["tax_name"] != IVA), precision)


def exclude_sumable_taxes(obj_item, taxes, precision=2):
    """Take non-IVA taxes (TURISMO HOSPEDAJE, ...) out of Precio / PrecioUnitario.

    ERPNext prices include every tax; SAT wants Precio with IVA only and adds the other
    taxes in Total (Total = Precio - Descuento + sumable MontoImpuesto). Total, which is
    the ERPNext line amount, does not change.
    """
    extra = sumable_tax_amount(taxes, precision)
    if not extra:
        return obj_item
    qty = flt(obj_item.get("dte:Cantidad")) or 1
    precio = flt(flt(obj_item.get("dte:Precio")) - extra, precision)
    obj_item["dte:Precio"] = precio
    obj_item["dte:PrecioUnitario"] = flt(precio / qty, 6)
    return obj_item
