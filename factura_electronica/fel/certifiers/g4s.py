# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# Protocol details adapted from aquih/fel_g4s (BSD-3-Clause, Copyright (c) 2020, rocketgithub)
# and G4S Documenta's published WSDL (factwsfront.asmx).
# For license information, please see license.txt
"""Adaptador G4S Documenta (NIT 60010207).

One SOAP operation, RequestTransaction(Requestor, Transaction, Country, Entity, User,
UserName, Data1, Data2, Data3), namespace http://www.fact.com.mx/schema/ws:

- certify: Transaction SYSTEM_REQUEST, Data1 POST_DOCUMENT_SAT, Data2 base64 XML,
  Data3 our identifier. Response/Result true -> ResponseData/ResponseData1 is the
  certified XML (base64) carrying <NumeroAutorizacion Serie Numero>uuid.
- PDF: Transaction GET_DOCUMENT, Data1 uuid, Data3 "PDF" -> ResponseData3 (base64).
- cancel: SYSTEM_REQUEST, Data1 VOID_DOCUMENT, Data2 base64 annulment XML, Data3 "XML".

G4S signs the document itself, so sign() hands the XML back unchanged.

Configuracion Factura Electronica fields used: llave_ws (Requestor GUID), alias
(UserName), modo (Pruebas -> pruebasfel host), url_dte (optional override). The
company NIT is the Entity. The answer is translated to the INFILE-shaped dict every
generator reads. SOAP is built by hand so the app needs no SOAP library.
"""

from __future__ import unicode_literals

import base64
import binascii
import datetime

import frappe
import requests
from lxml import etree

from factura_electronica.fel.certifiers.base import CertifierAdapter

G4S_NIT = "60010207"
G4S_NAME = "G4S"
PRODUCTION_URL = "https://fel.g4sdocumenta.com/webservicefront/factwsfront.asmx"
TEST_URL = "https://pruebasfel.g4sdocumenta.com/webservicefront/factwsfront.asmx"
WS_NS = "http://www.fact.com.mx/schema/ws"
SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/"
SOAP_ACTION = WS_NS + "/RequestTransaction"
TIMEOUT = 60
PARAMS = ("Requestor", "Transaction", "Country", "Entity", "User", "UserName", "Data1", "Data2", "Data3")


def _b64_xml(xml_dte):
    """The generators pass base64 or raw XML; G4S wants base64."""
    text = xml_dte.decode("utf-8") if isinstance(xml_dte, bytes) else str(xml_dte)
    if text.lstrip().startswith("<"):
        return base64.b64encode(text.encode("utf-8")).decode("ascii")
    try:
        base64.b64decode(text, validate=True)
        return text
    except (binascii.Error, ValueError):
        return base64.b64encode(text.encode("utf-8")).decode("ascii")


def build_envelope(values):
    envelope = etree.Element("{%s}Envelope" % SOAP_NS, nsmap={"soap": SOAP_NS})
    body = etree.SubElement(envelope, "{%s}Body" % SOAP_NS)
    request = etree.SubElement(body, "{%s}RequestTransaction" % WS_NS, nsmap={None: WS_NS})
    for name in PARAMS:
        etree.SubElement(request, "{%s}%s" % (WS_NS, name)).text = str(values.get(name) or "")
    return etree.tostring(envelope, xml_declaration=True, encoding="utf-8")


def parse_envelope(content):
    """RequestTransactionResult as {"Response": {...}, "ResponseData": {...}}."""
    root = etree.fromstring(content)

    def section(name):
        node = root.find(".//{%s}%s" % (WS_NS, name))
        if node is None:
            return {}
        return {etree.QName(child).localname: (child.text or "") for child in node}

    response = section("Response")
    response["Result"] = response.get("Result", "").strip().lower() == "true"
    return {"Response": response, "ResponseData": section("ResponseData")}


def to_infile_shape(answer):
    response = answer["Response"]
    if not response.get("Result"):
        message = response.get("Description") or response.get("Hint") or "G4S rechazó el documento"
        return {
            "resultado": False,
            "cantidad_errores": 1,
            "descripcion_errores": [{"mensaje_error": message, "fuente": "G4S"}],
            "descripcion": message,
        }
    certified_b64 = answer["ResponseData"].get("ResponseData1") or ""
    root = etree.fromstring(base64.b64decode(certified_b64))
    authorization = root.xpath("//*[local-name() = 'NumeroAutorizacion']")[0]
    fecha = root.xpath("string(//*[local-name() = 'FechaHoraCertificacion'])") or datetime.datetime.now().isoformat()
    return {
        "resultado": True,
        "fecha": fecha,
        "origen": "G4S",
        "descripcion": response.get("Description") or "Documento certificado por G4S",
        "alertas_infile": False,
        "descripcion_alertas_infile": [],
        "alertas_sat": False,
        "descripcion_alertas_sat": [],
        "cantidad_errores": 0,
        "descripcion_errores": [],
        "uuid": (authorization.text or "").strip(),
        "serie": authorization.get("Serie"),
        "numero": authorization.get("Numero"),
        "xml_certificado": certified_b64,
    }


class G4SAdapter(CertifierAdapter):
    keys = (G4S_NAME, G4S_NIT)

    def _config(self, config_name):
        return frappe.db.get_value(
            "Configuracion Factura Electronica",
            config_name,
            ["alias", "llave_ws", "modo", "url_dte"],
            as_dict=True,
        ) or frappe._dict()

    def _url(self, config):
        if config.get("url_dte") and "g4sdocumenta" in config.get("url_dte"):
            return config.get("url_dte")
        return TEST_URL if config.get("modo") == "Pruebas" else PRODUCTION_URL

    def _call(self, config, nit_emisor, transaction, data1, data2, data3):
        envelope = build_envelope(
            {
                "Requestor": config.get("llave_ws"),
                "Transaction": transaction,
                "Country": "GT",
                "Entity": str(nit_emisor or "").replace("-", "").upper(),
                "User": config.get("llave_ws"),
                "UserName": config.get("alias"),
                "Data1": data1,
                "Data2": data2,
                "Data3": data3,
            }
        )
        response = requests.post(
            self._url(config),
            data=envelope,
            headers={"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"%s"' % SOAP_ACTION},
            timeout=TIMEOUT,
        )
        if response.status_code >= 500 and b"Fault" not in (response.content or b""):
            raise requests.ConnectionError("G4S HTTP {0} Service Unavailable".format(response.status_code))
        return parse_envelope(response.content)

    def sign(self, config_name, encoded_xml, es_anulacion=None):
        # G4S firma al certificar.
        return True, encoded_xml

    def certify(self, config_name, nit_emisor, xml_dte, identificador):
        try:
            config = self._config(config_name)
            answer = self._call(config, nit_emisor, "SYSTEM_REQUEST", "POST_DOCUMENT_SAT", _b64_xml(xml_dte), identificador)
            result = to_infile_shape(answer)
            if result.get("resultado"):
                self._fetch_pdf(config, nit_emisor, result["uuid"])
            return True, result
        except Exception:
            return False, "Error al certificar con G4S: " + str(frappe.get_traceback())

    def _fetch_pdf(self, config, nit_emisor, uuid):
        try:
            answer = self._call(config, nit_emisor, "GET_DOCUMENT", uuid, "", "PDF")
            pdf = answer["ResponseData"].get("ResponseData3")
            if pdf:
                from factura_electronica.fel.print_support import stash_certifier_pdf

                stash_certifier_pdf(uuid, pdf)
        except Exception:
            frappe.log_error(title="G4S PDF")

    def cancel(self, config_name, nit_emisor, xml_dte, identificador):
        try:
            config = self._config(config_name)
            answer = self._call(config, nit_emisor, "SYSTEM_REQUEST", "VOID_DOCUMENT", _b64_xml(xml_dte), "XML")
            response = answer["Response"]
            if not response.get("Result"):
                return True, {
                    "resultado": False,
                    "cantidad_errores": 1,
                    "descripcion_errores": [{"mensaje_error": response.get("Description"), "fuente": "G4S"}],
                    "descripcion": response.get("Description"),
                }
            certified = answer["ResponseData"].get("ResponseData1") or ""
            return True, {
                "resultado": True,
                "fecha": datetime.datetime.now().isoformat(),
                "origen": "G4S",
                "descripcion": response.get("Description") or "Documento anulado por G4S",
                "alertas_infile": False,
                "descripcion_alertas_infile": [],
                "alertas_sat": False,
                "descripcion_alertas_sat": [],
                "cantidad_errores": 0,
                "descripcion_errores": [],
                "uuid": identificador,
                "xml_certificado": certified,
            }
        except Exception:
            return False, "Error al anular con G4S: " + str(frappe.get_traceback())

    def post_json(self, url, payload, headers):
        return requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
