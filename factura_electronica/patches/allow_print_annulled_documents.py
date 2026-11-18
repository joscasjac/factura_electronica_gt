# Copyright (c) 2026, QuestFlows and contributors
"""Annulled DTEs must still be reprintable (they print with the ANULADO banner), and
Frappe refuses to print cancelled documents unless this Print Setting is on. Runs once;
an administrator can switch it off again afterwards."""

import frappe


def execute():
    if not frappe.db.get_single_value("Print Settings", "allow_print_for_cancelled"):
        frappe.db.set_single_value("Print Settings", "allow_print_for_cancelled", 1)
