# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""One entry point for certifying a Sales Invoice, plus the two automations.

- ``certify(invoice)``: works out the DTE type from the invoice's FEL series and
  flags (Factura, Cambiaria, Pequeño Contribuyente, Exportación, Nota de Crédito,
  Nota de Débito, Nota de Abono) and calls the right generator. The desk has one
  "Certificar" action instead of one button per type.
- Certify on submit (``Configuracion Factura Electronica.certificar_al_validar``,
  on by default): certification runs right after the submit is committed, so the
  ledger entries are saved first and a certifier outage leaves a valid submitted
  invoice (in contingency) rather than a failed submit. Turn it off when invoices are
  reviewed, or certified in batches, after they are submitted.
- Document type (``tipo_documento_automatico``, on by default): on a new invoice with
  a Factura series, a foreign customer gets the export series, a credit sale the
  Factura Cambiaria series, and a Pequeño Contribuyente company FPEQ / FCAP.
"""

from __future__ import unicode_literals

import json
from functools import partial

import frappe
from frappe import _
from frappe.utils import getdate

RESULT_KEY = "fel_auto_result:{0}"
LABELS = {
    "FACT": _("Factura"),
    "FCAM": _("Factura Cambiaria"),
    "FPEQ": _("Factura Pequeño Contribuyente"),
    "FCAP": _("Factura Cambiaria Pequeño Contribuyente"),
    "NCRE": _("Nota de Crédito"),
    "NDEB": _("Nota de Débito"),
    "NABN": _("Nota de Abono"),
}
NOTE_TYPES = ("NCRE", "NDEB")


def _config(company):
    return frappe.db.get_value(
        "Configuracion Factura Electronica", {"company": company, "docstatus": 1}, "name"
    ) or frappe.db.get_value("Configuracion Factura Electronica", {"docstatus": 1}, "name")


def _setting(config, field, default=1):
    if not config or not frappe.get_meta("Configuracion Factura Electronica").has_field(field):
        return default
    value = frappe.db.get_value("Configuracion Factura Electronica", config, field)
    return default if value is None else int(value)


def _series_row(config, naming_series):
    if not config:
        return None
    return frappe.db.get_value(
        "Configuracion Series FEL",
        {"parent": config, "serie": naming_series},
        ["tipo_documento", "es_exportacion"],
        as_dict=True,
    )


def document_type(doc_or_name):
    """(tipo, is_export) for a Sales Invoice, or (None, False) if its series is not FEL."""
    doc = frappe.get_doc("Sales Invoice", doc_or_name) if isinstance(doc_or_name, str) else doc_or_name
    row = _series_row(_config(doc.company), doc.naming_series)
    if not row:
        return None, False
    export = bool(row.es_exportacion or doc.get("is_it_an_international_invoice"))
    return row.tipo_documento, export


def label(tipo, export=False):
    text = LABELS.get(tipo, tipo or "")
    return text + (" " + _("de Exportación") if export else "")


# --- one dispatcher ------------------------------------------------------------


def _generator(doc, tipo, export, reason):
    from factura_electronica import fel_api

    name, series = doc.name, doc.naming_series
    if tipo in ("FACT", "FPEQ"):
        if export:
            return fel_api.generate_electronic_export_invoice(name, series)
        return fel_api.generate_electronic_invoice(name, series)
    if tipo in ("FCAM", "FCAP"):
        return fel_api.generate_exchange_invoice_si(name, series)
    if tipo == "NCRE":
        return fel_api.generate_credit_note(name, series, doc.return_against, reason)
    if tipo == "NDEB":
        return fel_api.generate_sales_debit_note(name, series, doc.return_against, reason)
    if tipo == "NABN":
        return fel_api.generate_nota_abono(name, series)
    return False, _("La serie {0} no corresponde a un documento FEL de venta.").format(series)


def _plain(message):
    if isinstance(message, dict):
        details = message.get("detalles_errores") or message.get("descripcion") or message
        return str(details)
    return str(message or "")


def certify(invoice):
    """Certify a submitted Sales Invoice. Returns {ok, name, uuid, message, contingency}."""
    doc = frappe.get_doc("Sales Invoice", invoice)
    if doc.docstatus != 1:
        return {"ok": False, "name": doc.name, "message": _("Valide (Submit) la factura antes de certificarla.")}
    if doc.get("numero_autorizacion_fel"):
        return {"ok": True, "name": doc.name, "uuid": doc.numero_autorizacion_fel, "message": _("Ya estaba certificada.")}
    tipo, export = document_type(doc)
    if not tipo:
        return {"ok": False, "name": doc.name, "message": _("La serie {0} no está configurada para FEL.").format(doc.naming_series)}
    reason = doc.get("fel_motivo_ajuste") or doc.get("remarks") or _("Ajuste")
    if tipo in NOTE_TYPES and not doc.get("return_against"):
        return {"ok": False, "name": doc.name, "message": _("Indique la factura original (Return Against) de la nota.")}
    try:
        ok, payload = _generator(doc, tipo, export, reason)
    except Exception:
        ok, payload = False, frappe.get_traceback()
    renamed = frappe.db.get_value("Envio FEL", {"serie_factura_original": doc.name}, ["serie_para_factura", "uuid"], as_dict=True)
    if ok and renamed:
        return {"ok": True, "name": renamed.serie_para_factura or doc.name, "uuid": renamed.uuid,
                "message": _("{0} certificada.").format(label(tipo, export))}
    contingency = bool(frappe.db.get_value("Sales Invoice", doc.name, "fel_contingencia")) if frappe.get_meta("Sales Invoice").has_field("fel_contingencia") else False
    return {"ok": False, "name": doc.name, "message": _plain(payload), "contingency": contingency}


@frappe.whitelist()
def certify_invoice(invoice):
    """Desk "Certificar" action."""
    frappe.get_doc("Sales Invoice", invoice).check_permission("submit")
    return certify(invoice)


# --- certify on submit -----------------------------------------------------------


def applies_on_submit(doc):
    config = _config(doc.company)
    if not _setting(config, "certificar_al_validar"):
        return False
    tipo, _export = document_type(doc)
    return bool(tipo)


def from_bulk_action():
    """True inside the list's bulk Validar / Cancelar (frappe.desk...bulk_update._bulk_action),
    which bypasses the form's FEL summary and reason dialogs."""
    import sys

    frame = sys._getframe(1)
    while frame is not None:
        if frame.f_code.co_name == "_bulk_action" and frame.f_code.co_filename.endswith("bulk_update.py"):
            return True
        frame = frame.f_back
    return False


def on_submit(doc, method=None):
    """Sales Invoice on_submit: certify once the submit is committed."""
    if frappe.flags.in_import or frappe.flags.in_migrate or doc.get("numero_autorizacion_fel"):
        return
    if not applies_on_submit(doc):
        return
    if from_bulk_action():
        # validated without anyone seeing the FEL summary: it stays Pendiente, to be certified
        # from the list with "Certificar en SAT" (which asks first)
        return
    _special_tax_entries(doc)
    frappe.db.after_commit.add(partial(_certify_after_commit, doc.name))


def _special_tax_entries(doc):
    """IDP and other per-unit taxes: post their GL correction now, under the invoice's
    current name (the desk did this after submit, which breaks once FEL renames it)."""
    accounts = {row.account_head: row.total for row in doc.get("shs_otros_impuestos") or [] if row.account_head}
    if not accounts:
        return
    from factura_electronica.utils.special_tax import add_gl_entry_other_special_tax

    add_gl_entry_other_special_tax(doc.name, json.dumps(accounts, default=str), "Sales Invoice", doc.is_return or 0)


def _certify_after_commit(invoice):
    try:
        result = certify(invoice)
    except Exception:
        result = {"ok": False, "name": invoice, "message": frappe.get_traceback()}
    frappe.cache.set_value(RESULT_KEY.format(invoice), result, expires_in_sec=600)
    if not result.get("ok"):
        try:
            frappe.get_doc("Sales Invoice", invoice).add_comment(
                "Comment", _("No se pudo certificar al validar: {0}").format(result.get("message", "")[:500])
            )
        except Exception:
            frappe.log_error(title="FEL certificar al validar")
    frappe.db.commit()  # nosemgrep: runs after the request's own commit


@frappe.whitelist()
def submit_result(invoice):
    """What happened to an invoice certified on submit: {ok, name, message} or None."""
    result = frappe.cache.get_value(RESULT_KEY.format(invoice))
    if result:
        return result
    renamed = frappe.db.get_value("Sales Invoice", {"serie_original_del_documento": invoice}, "name")
    if renamed:
        return {"ok": True, "name": renamed}
    return None


# --- document type ---------------------------------------------------------------


def _customer_country(doc):
    address = doc.get("customer_address") or frappe.db.get_value(
        "Dynamic Link",
        {"link_doctype": "Customer", "link_name": doc.customer, "parenttype": "Address"},
        "parent",
    )
    return frappe.db.get_value("Address", address, "country") if address else None


def _is_credit(doc):
    if doc.get("due_date") and doc.get("posting_date") and getdate(doc.due_date) > getdate(doc.posting_date):
        return True
    template = doc.get("payment_terms_template") or frappe.db.get_value("Customer", doc.customer, "payment_terms")
    if template:
        return bool(frappe.db.exists("Payment Terms Template Detail", {"parent": template, "credit_days": [">", 0]}))
    return False


def _series_for(config, tipo, export=0):
    return frappe.db.get_value(
        "Configuracion Series FEL",
        {"parent": config, "tipo_documento": tipo, "es_exportacion": 1 if export else 0},
        "serie",
        order_by="idx asc",
    )


def suggested_series(doc):
    """(series, reason) the invoice should use, or (None, None) to keep its own."""
    if not doc.get("customer"):
        return None, None
    config = _config(doc.company)
    if doc.get("is_return") or doc.get("is_debit_note"):
        tipo = "NDEB" if doc.get("is_debit_note") else "NCRE"
        current = _series_row(config, doc.naming_series)
        if current and current.tipo_documento == tipo:
            return None, None
        series = _series_for(config, tipo)
        return (series, LABELS[tipo].lower()) if series else (None, None)
    row = _series_row(config, doc.naming_series)
    if not row or row.tipo_documento not in ("FACT", "FPEQ", "FCAM", "FCAP"):
        return None, None
    country = _customer_country(doc)
    if (country and country != "Guatemala") or doc.get("is_it_an_international_invoice"):
        series = _series_for(config, "FACT", export=1)
        return (series, _("cliente del exterior")) if series and series != doc.naming_series else (None, None)
    small = frappe.db.get_value("Configuracion Factura Electronica", config, "afiliacion_iva") == "PEQ"
    credit = _is_credit(doc)
    tipo = ("FCAP" if credit else "FPEQ") if small else ("FCAM" if credit else "FACT")
    series = _series_for(config, tipo)
    if not series or series == doc.naming_series:
        return None, None
    reason = _("venta al crédito") if credit else _("empresa Pequeño Contribuyente")
    return series, reason


def choose_document_type(doc, method=None):
    """Sales Invoice before_insert: set the FEL series for the kind of sale."""
    config = _config(doc.company)
    if not _setting(config, "tipo_documento_automatico"):
        return
    series, reason = suggested_series(doc)
    if not series:
        return
    row = _series_row(config, series)
    doc.naming_series = series
    if row and row.es_exportacion:
        doc.is_it_an_international_invoice = 1
    frappe.msgprint(
        _("Serie {0} elegida automáticamente ({1}).").format(series, reason), indicator="blue", alert=True
    )


# --- desk context ----------------------------------------------------------------


@frappe.whitelist()
def form_context(invoice):
    """Everything the Sales Invoice form needs to show FEL status and actions."""
    if not frappe.db.exists("Sales Invoice", invoice):
        # Renamed by certification while the form still had the old name.
        return {"fel": False, "renamed_to": frappe.db.get_value("Sales Invoice", {"serie_original_del_documento": invoice}, "name")}
    doc = frappe.get_doc("Sales Invoice", invoice)
    doc.check_permission("read")
    config = _config(doc.company)
    tipo, export = document_type(doc)
    mode = frappe.db.get_value("Configuracion Factura Electronica", config, "modo") if config and frappe.get_meta("Configuracion Factura Electronica").has_field("modo") else None
    envio = None
    if doc.get("numero_autorizacion_fel"):
        fields = ["fecha", "status", "serie", "numero"]
        if frappe.get_meta("Envio FEL").has_field("motivo_anulacion"):
            fields += ["motivo_anulacion", "fecha_anulacion"]
        envio = frappe.db.get_value("Envio FEL", doc.numero_autorizacion_fel, fields, as_dict=True)
    cancelled = bool(doc.docstatus == 2 and doc.get("numero_autorizacion_fel"))
    anulada = bool(doc.get("numero_autorizacion_fel") and envio and envio.status == "Cancelled")
    return {
        "fel": bool(tipo),
        "tipo": tipo,
        "label": label(tipo, export) if tipo else None,
        "export": export,
        "mode": mode,
        "certify_on_submit": bool(_setting(config, "certificar_al_validar")) if tipo else False,
        "annul_on_cancel": bool(_setting(config, "anular_al_cancelar")) if tipo else False,
        "auto_type": bool(_setting(config, "tipo_documento_automatico")) if tipo else False,
        "needs_reason": tipo in NOTE_TYPES,
        "certified": bool(doc.get("numero_autorizacion_fel")),
        "uuid": doc.get("numero_autorizacion_fel"),
        "serie": envio.serie if envio else None,
        "numero": envio.numero if envio else None,
        "fecha": str(envio.fecha) if envio and envio.fecha else None,
        "original": doc.get("serie_original_del_documento"),
        "contingency": bool(doc.get("fel_contingencia")),
        "cancelled": cancelled,
        "anulada": anulada,
        "motivo_anulacion": envio.get("motivo_anulacion") if envio else None,
        "fecha_anulacion": str(envio.get("fecha_anulacion")) if envio and envio.get("fecha_anulacion") else None,
        "receptor": doc.get("nombre_segun_sat") or doc.customer_name,
        "nit": "CF" if (doc.get("nit_face_customer") or "CF").replace("/", "").upper() == "CF" else doc.nit_face_customer,
        "total": doc.grand_total,
        "currency": doc.currency,
    }


# --- annulment ---------------------------------------------------------------------

CANCEL_REASON_KEY = "fel_cancel_reason:{0}"


def annul(invoice, reason):
    """Annul a certified Sales Invoice in SAT. Returns {ok, message}."""
    from factura_electronica.fel.canceller import CancelDocument
    from factura_electronica.fel_api import configuration_for_original_document

    doc = frappe.get_doc("Sales Invoice", invoice)
    if not doc.get("numero_autorizacion_fel"):
        return {"ok": False, "message": _("La factura no está certificada en SAT.")}
    if frappe.db.get_value("Envio FEL", doc.numero_autorizacion_fel, "status") == "Cancelled":
        return {"ok": True, "message": _("Ya estaba anulada en SAT.")}
    reason = (str(reason or "").strip() or _("Anulación"))[:255]
    ok, config = configuration_for_original_document("Sales Invoice", invoice)
    if not ok:
        return {"ok": False, "message": _plain(config)}
    canceller = CancelDocument(invoice, config, reason, "Sales Invoice")
    for step in ("validate_requirements", "build_request", "sign_invoice", "request_cancel", "response_validator"):
        status = getattr(canceller, step)()
        if not status[0]:
            return {"ok": False, "message": _plain(status[1])}
    return {"ok": True, "message": _("Anulada en SAT.")}


@frappe.whitelist()
def annul_invoice(invoice, reason):
    """Desk "Anular en SAT" action (for invoices cancelled with annul-on-cancel off)."""
    frappe.get_doc("Sales Invoice", invoice).check_permission("cancel")
    return annul(invoice, reason)


@frappe.whitelist()
def set_cancel_reason(invoice, reason):
    """Remember the annulment reason the user typed before cancelling."""
    frappe.get_doc("Sales Invoice", invoice).check_permission("cancel")
    frappe.cache.set_value(CANCEL_REASON_KEY.format(invoice), str(reason or "")[:255], expires_in_sec=600)
    return True


def before_cancel(doc, method=None):
    """A certified invoice still valid in SAT is cancelled from its form, which asks the
    reason SAT records. The list's bulk Cancelar would annul it with no reason."""
    if not doc.get("numero_autorizacion_fel") or frappe.flags.in_migrate or not from_bulk_action():
        return
    if frappe.db.get_value("Envio FEL", doc.numero_autorizacion_fel, "status") == "Cancelled":
        return
    frappe.throw(
        _("{0} está certificada en SAT. Cancélela desde la factura: se pide el motivo de la anulación que se envía a SAT.").format(doc.name),
        title=_("Anulación en SAT"),
    )


def on_cancel(doc, method=None):
    """Sales Invoice on_cancel: annul in SAT once the cancel is committed."""
    if not doc.get("numero_autorizacion_fel") or frappe.flags.in_migrate:
        return
    if not _setting(_config(doc.company), "anular_al_cancelar"):
        return
    reason = frappe.cache.get_value(CANCEL_REASON_KEY.format(doc.name)) or _("Anulación")
    frappe.db.after_commit.add(partial(_annul_after_commit, doc.name, reason))


def _annul_after_commit(invoice, reason):
    try:
        result = annul(invoice, reason)
    except Exception:
        result = {"ok": False, "message": frappe.get_traceback()}
    frappe.cache.set_value(RESULT_KEY.format(invoice), result, expires_in_sec=600)
    if not result.get("ok"):
        frappe.get_doc("Sales Invoice", invoice).add_comment(
            "Comment", _("Cancelada en ERPNext pero no anulada en SAT: {0}").format(result.get("message", "")[:500])
        )
    frappe.db.commit()  # nosemgrep: runs after the request's own commit
