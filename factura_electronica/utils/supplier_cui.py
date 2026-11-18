# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
"""CUI (DPI) of a Factura Especial seller taken from the Supplier's Tax ID.

FESP identifies the seller by CUI. The app looked only in the supplier contact's
Contact Identification rows; this lets a 13-digit CUI stored as the supplier's
Tax ID be used too.
"""

from __future__ import unicode_literals

import re

import frappe


def supplier_cui_from_tax_id(supplier):
    if not supplier:
        return None
    tax_id = re.sub(r"\D", "", frappe.db.get_value("Supplier", supplier, "tax_id") or "")
    return tax_id if len(tax_id) == 13 else None
