# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# Protocol details adapted from aquih/fel_digifact (BSD-3-Clause, Copyright (c) aquíH).
# For license information, please see license.txt
"""Adaptador DIGIFACT (NIT 77454820).

Digifact signs and certifies in a single call, so sign() hands the XML back and
certify()/cancel() do the work:

1. POST {Username, Password} to /login/get_token -> {"Token": ...}
2. POST the raw XML to /FelRequestV2?NIT=<12-digit NIT>&USERNAME=<user>&TIPO=...
   with header Authorization: <token>. Codigo == 1 means success; ResponseDATA1
   is the certified XML (base64) carrying <NumeroAutorizacion Serie Numero>uuid.

Configuracion Factura Electronica fields used: alias (Digifact username, e.g.
GT.000044653948.USUARIO), llave_ws (password), modo (Pruebas -> test host,
Producción -> production host) and, optionally, url_dte to override the base URL.
The response is translated to the INFILE-shaped dict every generator reads.
TLS certificates are verified (the Odoo module disabled verification).
"""

from __future__ import unicode_literals

import base64
import binascii
import datetime

import frappe
import requests
from lxml import etree

from factura_electronica.fel.certifiers.base import CertifierAdapter

DIGIFACT_NIT = "77454820"
DIGIFACT_NAME = "DIGIFACT"
PRODUCTION_BASE = "https://felgtaws.digifact.com.gt/gt.com.fel.api.v3/api"
TEST_BASE = "https://felgttestaws.digifact.com.gt/gt.com.fel.api.v3/api"
TIMEOUT = 60
TIPO_CERTIFY = "CERTIFICATE_DTE_XML_TOSIGN"
TIPO_CANCEL = "ANULAR_FEL_TOSIGN"


def _raw_xml(xml_dte):
    text = xml_dte.decode("utf-8") if isinstance(xml_dte, bytes) else str(xml_dte)
    if text.lstrip().startswith("<"):
        return text
    try:
        return base64.b64decode(text).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return text


def parse_certified(response_json):
    """Map a FelRequestV2 JSON answer to the INFILE-shaped response."""
    if response_json.get("Codigo") != 1:
        message = response_json.get("ResponseDATA1") or response_json.get("Mensaje") or str(response_json)
        return {
            "resultado": False,
            "cantidad_errores": 1,
            "descripcion_errores": [{"mensaje_error": message, "fuente": "DIGIFACT"}],
            "descripcion": message,
        }
    certified_b64 = response_json.get("ResponseDATA1") or ""
    root = etree.fromstring(base64.b64decode(certified_b64))
    authorization = root.xpath("//*[local-name() = 'NumeroAutorizacion']")[0]
    fecha = root.xpath("string(//*[local-name() = 'FechaHoraCertificacion'])") or datetime.datetime.now().isoformat()
    return {
        "resultado": True,
        "fecha": fecha,
        "origen": "DIGIFACT",
        "descripcion": response_json.get("Mensaje") or "Documento certificado por DIGIFACT",
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
        "pdf_base64": response_json.get("ResponseDATA3"),
    }


class DigifactAdapter(CertifierAdapter):
    keys = (DIGIFACT_NAME, DIGIFACT_NIT)

    def _config(self, config_name):
        return frappe.db.get_value(
            "Configuracion Factura Electronica",
            config_name,
            ["alias", "llave_ws", "modo", "url_dte"],
            as_dict=True,
        ) or frappe._dict()

    def _base_url(self, config):
        if config.get("url_dte") and "digifact" in config.get("url_dte"):
            return config.get("url_dte").rstrip("/")
        return TEST_BASE if config.get("modo") == "Pruebas" else PRODUCTION_BASE

    def _token(self, config):
        response = requests.post(
            self._base_url(config) + "/login/get_token",
            json={"Username": config.get("alias"), "Password": config.get("llave_ws")},
            headers={"Content-Type": "application/json"},
            timeout=TIMEOUT,
        )
        token = (response.json() or {}).get("Token")
        if not token:
            raise ValueError("DIGIFACT no devolvió token: revise usuario y clave en la configuración FEL.")
        return token

    def sign(self, config_name, encoded_xml, es_anulacion=None):
        # Digifact firma al certificar.
        return True, encoded_xml

    def certify(self, config_name, nit_emisor, xml_dte, identificador):
        return self._request(config_name, nit_emisor, xml_dte, TIPO_CERTIFY, "XML PDF")

    def cancel(self, config_name, nit_emisor, xml_dte, identificador):
        return self._request(config_name, nit_emisor, xml_dte, TIPO_CANCEL, "XML")

    def _request(self, config_name, nit_emisor, xml_dte, tipo, formato):
        try:
            config = self._config(config_name)
            username = str(config.get("alias") or "")
            response = requests.post(
                self._base_url(config) + "/FelRequestV2",
                params={
                    "NIT": str(nit_emisor or "").replace("-", "").zfill(12),
                    "USERNAME": username.split(".")[-1],
                    "TIPO": tipo,
                    "FORMAT": formato,
                },
                data=_raw_xml(xml_dte).encode("utf-8"),
                headers={"Content-Type": "application/xml", "Authorization": self._token(config)},
                timeout=TIMEOUT,
            )
            if response.status_code >= 500:
                raise requests.ConnectionError("DIGIFACT HTTP {0} Service Unavailable".format(response.status_code))
            answer = parse_certified(response.json())
            if answer.get("resultado") and answer.get("pdf_base64"):
                from factura_electronica.fel.print_support import stash_certifier_pdf

                stash_certifier_pdf(answer.get("uuid"), answer.get("pdf_base64"))
            return True, answer
        except Exception:
            return False, "Error al certificar con DIGIFACT: " + str(frappe.get_traceback())

    def post_json(self, url, payload, headers):
        return requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
