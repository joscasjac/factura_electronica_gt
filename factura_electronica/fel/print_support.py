# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""Printing and desk helpers that do not depend on INFILE.

- ``get_fel_pdf_url``: where the "Ver PDF" buttons go. INFILE (and any certifier
  whose Certificador FEL record has ``url_pdf``) uses its viewer; DIGIFACT returns the
  PDF with the certification, which is attached to the Envio FEL; otherwise (Demo,
  certifiers without a viewer) ERPNext renders the "Factura Electronica FEL" print format.
- ``fel_verification_url``: what the QR encodes, per certifier.
- ``suggest_exchange_series``: credit sale on a Factura series -> the Factura Cambiaria series.
"""

from __future__ import unicode_literals

import base64
from urllib.parse import urlencode

import frappe
from frappe.utils import flt, getdate

PRINT_FORMAT = "Factura Electronica FEL"
INFILE_VIEWER = "https://report.feel.com.gt/ingfacereport/ingfacereport_documento?uuid="
# SAT's public DTE verifier. Confirm the URL against SAT before go-live (see ROADMAP).
SAT_VERIFIER = "https://felpub.c.sat.gob.gt/verificador-web/publico/vistas/verificacionDte.jsf"
PDF_CACHE_KEY = "fel_certifier_pdf:{0}"


def _envio(uuid):
    if not uuid or not frappe.db.exists("Envio FEL", uuid):
        return None
    return frappe.db.get_value(
        "Envio FEL", uuid, ["name", "configuracion", "certificador", "serie_para_factura", "company"], as_dict=True
    )


def _certifier_viewer(envio):
    """Viewer URL prefix for the certifier that certified this document, or None."""
    if not envio or not envio.certificador:
        return None
    mode = None
    if envio.configuracion and frappe.get_meta("Configuracion Factura Electronica").has_field("modo"):
        mode = frappe.db.get_value("Configuracion Factura Electronica", envio.configuracion, "modo")
    if mode == "Demo":
        return None
    url = frappe.db.get_value("Certificador FEL", envio.certificador, "url_pdf")
    if url:
        return url
    if str(envio.certificador).upper() == "INFILE":
        return INFILE_VIEWER
    return None


def _attached_pdf(envio_name):
    return frappe.db.get_value(
        "File",
        {"attached_to_doctype": "Envio FEL", "attached_to_name": envio_name, "file_name": ["like", "%.pdf"]},
        "file_url",
    )


def print_format_pdf_url(doctype, docname):
    return "/api/method/frappe.utils.print_format.download_pdf?" + urlencode(
        {"doctype": doctype, "name": docname, "format": PRINT_FORMAT}
    )


@frappe.whitelist()
def get_fel_pdf_url(uuid, doctype="Sales Invoice", docname=None):
    if docname:
        frappe.has_permission(doctype, "read", docname, throw=True)
    envio = _envio(uuid)
    viewer = _certifier_viewer(envio)
    if viewer:
        return viewer + str(uuid)
    if envio:
        attached = _attached_pdf(envio.name)
        if attached:
            return attached
        docname = docname or envio.serie_para_factura
    return print_format_pdf_url(doctype, docname)


def fel_verification_url(authorization_number):
    """URL encoded in the printed QR."""
    envio = _envio(authorization_number)
    viewer = _certifier_viewer(envio)
    if viewer:
        return viewer + str(authorization_number)
    if not envio:
        return INFILE_VIEWER + str(authorization_number)
    invoice = frappe.db.get_value(
        "Sales Invoice",
        envio.serie_para_factura,
        ["nit_face_customer", "grand_total", "company"],
        as_dict=True,
    ) or frappe._dict()
    emisor = frappe.db.get_value("Company", envio.company, "nit_face_company") or ""
    return SAT_VERIFIER + "?" + urlencode(
        {
            "tipo": "autorizacion",
            "numero": authorization_number,
            "emisor": str(emisor).replace("-", "").upper(),
            "receptor": str(invoice.nit_face_customer or "CF").replace("-", "").replace("/", "").upper(),
            "monto": "{0:.2f}".format(flt(invoice.grand_total)),
        }
    )


def stash_certifier_pdf(uuid, pdf_base64):
    """Keep the PDF a certifier returned until the Envio FEL record exists."""
    if uuid and pdf_base64:
        frappe.cache.set_value(PDF_CACHE_KEY.format(uuid), pdf_base64, expires_in_sec=6 * 3600)


def attach_certifier_pdf(doc, method=None):
    """Envio FEL after_insert: attach the certifier's PDF (DIGIFACT) when there is one."""
    key = PDF_CACHE_KEY.format(doc.name)
    pdf_base64 = frappe.cache.get_value(key)
    if not pdf_base64:
        return
    try:
        frappe.get_doc(
            {
                "doctype": "File",
                "file_name": "{0}.pdf".format(doc.serie_para_factura or doc.name),
                "attached_to_doctype": "Envio FEL",
                "attached_to_name": doc.name,
                "is_private": 1,
                "content": base64.b64decode(pdf_base64),
            }
        ).insert(ignore_permissions=True)
        frappe.cache.delete_value(key)
    except Exception:
        frappe.log_error(title="FEL PDF del certificador")


@frappe.whitelist()
def suggest_exchange_series(company, naming_series, posting_date=None, due_date=None):
    """FCAM (or FCAP) series to suggest for a credit sale on a FACT (FPEQ) series."""
    if not (posting_date and due_date) or getdate(due_date) <= getdate(posting_date):
        return None
    config = frappe.db.get_value("Configuracion Factura Electronica", {"company": company, "docstatus": 1})
    if not config:
        return None
    current = frappe.db.get_value(
        "Configuracion Series FEL", {"parent": config, "serie": naming_series}, ["tipo_documento", "es_exportacion"], as_dict=True
    )
    if not current or current.es_exportacion or current.tipo_documento not in ("FACT", "FPEQ"):
        return None
    target = "FCAP" if current.tipo_documento == "FPEQ" else "FCAM"
    return frappe.db.get_value(
        "Configuracion Series FEL", {"parent": config, "tipo_documento": target, "es_exportacion": 0}, "serie", order_by="idx asc"
    )


DOCUMENT_LABELS = {
    "FACT": "Factura",
    "FCAM": "Factura Cambiaria",
    "FPEQ": "Factura Pequeño Contribuyente",
    "FCAP": "Factura Cambiaria Pequeño Contribuyente",
    "FESP": "Factura Especial",
    "NABN": "Nota de Abono",
    "NCRE": "Nota de Crédito",
    "NDEB": "Nota de Débito",
}
DTE = "{http://www.sat.gob.gt/dte/fel/0.2.0}"


def _frase_text(tipo, escenario):
    text = frappe.db.get_value(
        "Frases FEL",
        {"parenttype": "FEL Catalogo Frases", "parent": ["like", "{0} %".format(tipo)], "codigo_escenario": escenario},
        "texto_a_colocar",
    )
    return text or "Frase {0}, escenario {1}".format(tipo, escenario)


def fel_print_context(doc):
    """Data for the "Factura Electronica FEL" print format (Jinja: fel_print_context(doc))."""
    from lxml import etree

    from factura_electronica.fel.qrcode import fel_qr_markup

    context = frappe._dict(
        title="Documento Tributario Electrónico",
        certified=bool(doc.get("numero_autorizacion_fel")),
        contingency=bool(doc.get("fel_contingencia")),
        access_number=None,
        frases=[],
        qr=None,
        envio=None,
        certifier=None,
        exportacion=False,
        demo=False,
        anulado=None,
        abonos=[],
        fecha_certificacion=None,
        establecimiento=None,
        tipo_cambio=None,
    )
    context.establecimiento = _establishment(doc)
    company_currency = frappe.get_cached_value("Company", doc.company, "default_currency")
    if doc.get("currency") and doc.currency != company_currency:
        context.tipo_cambio = "{0} 1 = {1} {2:.5f}".format(doc.currency, company_currency, flt(doc.conversion_rate))
    if doc.get("access_number_fel"):
        from factura_electronica.utils.access_number import fel_access_number

        context.access_number = fel_access_number(doc.access_number_fel)
    envio = _envio(doc.get("numero_autorizacion_fel"))
    if not envio:
        return context
    fields = ["uuid", "serie", "numero", "fecha", "xml_certificado", "status"]
    if frappe.get_meta("Envio FEL").has_field("motivo_anulacion"):
        fields += ["motivo_anulacion", "fecha_anulacion"]
    context.envio = frappe.db.get_value("Envio FEL", envio.name, fields, as_dict=True)
    context.fecha_certificacion = _readable_datetime(context.envio.fecha)
    if context.envio.status == "Cancelled":
        context.anulado = frappe._dict(
            fecha=_readable_datetime(context.envio.get("fecha_anulacion")),
            motivo=context.envio.get("motivo_anulacion"),
        )
    if envio.configuracion and frappe.get_meta("Configuracion Factura Electronica").has_field("modo"):
        context.demo = frappe.db.get_value("Configuracion Factura Electronica", envio.configuracion, "modo") == "Demo"
    context.certifier = frappe.db.get_value(
        "Certificador FEL", envio.certificador, ["razon_social", "nit"], as_dict=True
    ) if envio.certificador else None
    context.qr = fel_qr_markup(doc.numero_autorizacion_fel)
    try:
        root = etree.fromstring((context.envio.xml_certificado or "").encode("utf-8"))
        generales = root.find(".//" + DTE + "DatosGenerales")
        tipo = generales.get("Tipo") if generales is not None else None
        context.exportacion = generales is not None and generales.get("Exp") == "SI"
        context.title = DOCUMENT_LABELS.get(tipo, context.title) + (" de Exportación" if context.exportacion else "")
        if generales is not None and generales.get("NumeroAcceso"):
            context.access_number = generales.get("NumeroAcceso")
        context.frases = [
            _frase_text(f.get("TipoFrase"), f.get("CodigoEscenario")) for f in root.iter(DTE + "Frase")
        ]
        # Factura Cambiaria: installments from the Abonos complement
        for abono in root.xpath("//*[local-name()='Abono']"):
            value = lambda tag: abono.xpath("string(*[local-name()='{0}'])".format(tag))
            context.abonos.append(
                frappe._dict(numero=value("NumeroAbono"), vencimiento=_readable_date(value("FechaVencimiento")),
                             monto=flt(value("MontoAbono")))
            )
    except Exception:
        frappe.log_error(title="FEL print: XML certificado")
    return context


@frappe.whitelist()
def use_exchange_series(invoice, series):
    """Switch a saved draft Sales Invoice to the suggested FCAM / FCAP series.

    naming_series is set-only-once in the form, and a copy would lose the due date and
    prices, so the draft keeps its name (FEL renames it to the SAT serie/número when it
    is certified) and only the series that decides the document type changes.
    """
    doc = frappe.get_doc("Sales Invoice", invoice)
    doc.check_permission("write")
    if doc.docstatus != 0:
        frappe.throw(frappe._("Only a draft can change its series."))
    expected = suggest_exchange_series(doc.company, doc.naming_series, doc.posting_date, doc.due_date)
    if series != expected:
        frappe.throw(frappe._("{0} is not the Factura Cambiaria series for this invoice.").format(series))
    frappe.db.set_value("Sales Invoice", invoice, "naming_series", series)
    return series


def _readable_datetime(value):
    """'2026-11-18T08:21:55-06:00' -> '18-11-2026 08:21' in the system date format."""
    if not value:
        return None
    text = str(value).replace("T", " ")[:16]
    try:
        return frappe.utils.format_datetime(text, frappe.utils.get_user_date_format() + " HH:mm")
    except Exception:
        return text


def _readable_date(value):
    if not value:
        return ""
    try:
        return frappe.utils.formatdate(str(value)[:10])
    except Exception:
        return str(value)


def _establishment(doc):
    """(code, name) of the issuing establishment from the company address used by FEL."""
    address = doc.get("company_address") or frappe.db.get_value(
        "Dynamic Link", {"link_doctype": "Company", "link_name": doc.company, "parenttype": "Address"}, "parent"
    )
    if not address:
        return None
    row = frappe.db.get_value("Address", address, ["address_title", "facelec_establishment"], as_dict=True) if frappe.get_meta("Address").has_field("facelec_establishment") else None
    if not row or not row.facelec_establishment:
        return None
    return frappe._dict(codigo=row.facelec_establishment, nombre=row.address_title)
