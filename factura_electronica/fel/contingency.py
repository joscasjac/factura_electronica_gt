# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""FEL contingency: keep invoicing when the certifier cannot be reached.

When signing or certifying fails because the certifier is unreachable (connection
error, timeout, HTTP 5xx), the Sales Invoice is not lost:

1. it gets a NumeroAcceso (same 100000000-999999999 sequence as Factura Cambiaria),
   ``fel_contingencia`` = 1 and ``fel_contingencia_desde`` = now, so it can be printed
   and handed to the customer as a contingency document;
2. ``retry_pending`` (hourly) sends it again with that NumeroAcceso until the certifier
   answers; on success the flag is cleared;
3. invoices still pending after ``ALERT_AFTER_DAYS`` are reported in the Error Log and
   as a comment on the invoice, before SAT's deadline (``DEADLINE_DAYS``).

Rejections by SAT or the certifier (validation errors) are not contingencies: they are
returned to the user as before.
"""

from __future__ import unicode_literals

import re

import frappe
from frappe import _
from frappe.utils import add_days, now_datetime

from factura_electronica.utils.access_number import fel_access_number

# SAT: documents issued in contingency must be certified within 5 days.
# Confirm the current term with the client's accountant / certifier.
DEADLINE_DAYS = 5
ALERT_AFTER_DAYS = 3

UNAVAILABLE_PATTERNS = re.compile(
    r"ConnectionError|ConnectTimeout|ReadTimeout|Timeout|timed out|Max retries exceeded|"
    r"Name or service not known|nodename nor servname|Connection refused|"
    r"Connection aborted|RemoteDisconnected|\b50[234]\b|Service Unavailable|Bad Gateway",
    re.IGNORECASE,
)

FIELDS = ("fel_contingencia", "fel_contingencia_desde")


def enabled():
    return frappe.get_meta("Sales Invoice").has_field("fel_contingencia")


def certifier_unavailable(message):
    """True when a sign/certify failure means the certifier was unreachable."""
    return bool(UNAVAILABLE_PATTERNS.search(str(message or "")))


def access_number(invoice_name):
    """NumeroAcceso of an invoice, creating its Access Number FCAM record if needed."""
    current = frappe.db.get_value("Sales Invoice", invoice_name, "access_number_fel")
    if not current:
        record = frappe.new_doc("Access Number FCAM")
        record.reference = invoice_name
        record.type = "Sales Invoice"
        record.insert(ignore_permissions=True)
        current = record.name
        frappe.db.set_value("Sales Invoice", invoice_name, "access_number_fel", current, update_modified=False)
    return fel_access_number(current)


def enter_contingency(invoice_name, failure_message):
    """Flag the invoice as issued in contingency. Returns the (False, message) tuple
    the FEL buttons expect, explaining what happens next."""
    if not enabled():
        return False, failure_message
    numero = access_number(invoice_name)
    if not frappe.db.get_value("Sales Invoice", invoice_name, "fel_contingencia"):
        frappe.db.set_value(
            "Sales Invoice",
            invoice_name,
            {"fel_contingencia": 1, "fel_contingencia_desde": now_datetime()},
            update_modified=False,
        )
    from factura_electronica.fel.status import refresh

    refresh(invoice_name)
    frappe.db.commit()  # nosemgrep: the generators commit; keep the flag even if the request rolls back
    return False, _(
        "El certificador no responde. La factura {0} quedó en contingencia con número de acceso {1}: "
        "puede imprimirla y entregarla; se enviará automáticamente a certificar cada hora "
        "(plazo SAT: {2} días). Detalle: {3}"
    ).format(invoice_name, numero, DEADLINE_DAYS, str(failure_message)[:300])


def with_access_number(datos_generales, invoice_name):
    """Add @NumeroAcceso to DatosGenerales for an invoice issued in contingency."""
    if datos_generales.get("@NumeroAcceso") or not enabled():
        return datos_generales
    row = frappe.db.get_value(
        "Sales Invoice", invoice_name, ["fel_contingencia", "access_number_fel"], as_dict=True
    )
    if row and row.fel_contingencia and row.access_number_fel:
        datos_generales["@NumeroAcceso"] = fel_access_number(row.access_number_fel)
    return datos_generales


def handle_failure(invoice_name, result):
    """Pass a generator failure through, turning unreachable-certifier errors into contingency."""
    if result and result[0] is False and certifier_unavailable(result[1]):
        return enter_contingency(invoice_name, result[1])
    return result


def clear(invoice_name):
    frappe.db.set_value(
        "Sales Invoice", invoice_name, {"fel_contingencia": 0}, update_modified=False
    )
    from factura_electronica.fel.status import refresh

    refresh(invoice_name)


def _generator_for(invoice):
    from factura_electronica import fel_api

    tipo = frappe.db.get_value(
        "Configuracion Series FEL",
        {"serie": invoice.naming_series, "parenttype": "Configuracion Factura Electronica"},
        ["tipo_documento", "es_exportacion"],
        as_dict=True,
    ) or frappe._dict()
    if tipo.es_exportacion:
        return fel_api.generate_electronic_export_invoice
    if tipo.tipo_documento in ("FCAM", "FCAP"):
        return fel_api.generate_exchange_invoice_si
    if tipo.tipo_documento in ("FACT", "FPEQ"):
        return fel_api.generate_electronic_invoice
    return None


def pending():
    if not enabled():
        return []
    return frappe.get_all(
        "Sales Invoice",
        filters={"fel_contingencia": 1, "docstatus": 1},
        fields=["name", "naming_series", "fel_contingencia_desde", "numero_autorizacion_fel"],
        order_by="fel_contingencia_desde asc",
    )


def retry_pending():
    """Scheduler (hourly): certify contingency invoices; alert when the deadline nears."""
    results = {}
    for invoice in pending():
        if invoice.numero_autorizacion_fel:
            clear(invoice.name)
            continue
        generator = _generator_for(invoice)
        if not generator:
            continue
        try:
            ok, message = generator(invoice.name, invoice.naming_series)
        except Exception:
            ok, message = False, frappe.get_traceback()
        results[invoice.name] = ok
        if ok:
            renamed = frappe.db.get_value(
                "Sales Invoice", {"serie_original_del_documento": invoice.name}, "name"
            ) or invoice.name
            clear(renamed)
            frappe.db.commit()  # nosemgrep
            continue
        since = invoice.fel_contingencia_desde
        if since and now_datetime() >= add_days(since, ALERT_AFTER_DAYS):
            text = _("Factura {0} en contingencia desde {1} sin certificar (plazo SAT {2} días): {3}").format(
                invoice.name, since, DEADLINE_DAYS, str(message)[:500]
            )
            frappe.log_error(title=_("FEL contingencia por vencer"), message=text)
            frappe.get_doc("Sales Invoice", invoice.name).add_comment("Comment", text)
        frappe.db.commit()  # nosemgrep
    return results
