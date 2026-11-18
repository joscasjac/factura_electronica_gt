# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""Demo certifier: the full FEL flow with no credentials and no network.

Used when a Configuracion Factura Electronica has modo = "Demo". It validates
the DTE against SAT's schemas (fel/xsd) and, when valid, answers in the same
shape INFILE does, so every generator, Envio FEL record, rename and print
format runs exactly as in production. Nothing reaches SAT, and the
authorization is marked as demo.

Like SAT, the serie is the first 8 hex digits of the UUID and the número is
the next 8 hex digits read as a decimal number.
"""

from __future__ import unicode_literals

import base64
import binascii
import datetime
import uuid as uuid_lib

from factura_electronica.fel.certifiers.base import CertifierAdapter
from factura_electronica.fel import xsd_validation

DEMO_KEY = "DEMO"


def serie_numero_from_uuid(uuid_text):
    hex_digits = uuid_text.replace("-", "").upper()
    return hex_digits[:8], str(int(hex_digits[8:16], 16))


def _decode(xml_dte):
    """Generators pass base64 (INFILE convention); accept plain XML too."""
    text = xml_dte.decode("utf-8") if isinstance(xml_dte, bytes) else str(xml_dte)
    if text.lstrip().startswith("<"):
        return text
    try:
        return base64.b64decode(text).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return text


def _now_guatemala():
    """Certification timestamp in INFILE's format (ISO 8601, Guatemala is UTC-6)."""
    tz = datetime.timezone(datetime.timedelta(hours=-6))
    return datetime.datetime.now(tz).replace(microsecond=0).isoformat()


def _failure(errors):
    return {
        "resultado": False,
        "cantidad_errores": len(errors),
        "descripcion_errores": [{"mensaje_error": e, "fuente": "DEMO-XSD"} for e in errors],
        "descripcion": "; ".join(errors),
    }


class DemoAdapter(CertifierAdapter):
    keys = (DEMO_KEY,)

    def sign(self, config_name, encoded_xml, es_anulacion=None):
        # No signature in demo; hand the XML back unchanged (still base64).
        return True, encoded_xml

    def certify(self, config_name, nit_emisor, xml_dte, identificador):
        return self._process(xml_dte, anulacion=False)

    def cancel(self, config_name, nit_emisor, xml_dte, identificador):
        return self._process(xml_dte, anulacion=True)

    def _process(self, xml_dte, anulacion):
        xml_text = _decode(xml_dte)
        errors = xsd_validation.validate(xml_text, anulacion=anulacion)
        if not errors and not anulacion:
            errors = xsd_validation.validate_totals(xml_text)
        if errors:
            return True, _failure(errors)
        new_uuid = str(uuid_lib.uuid4()).upper()
        serie, numero = serie_numero_from_uuid(new_uuid)
        # Same keys INFILE returns; every generator's save_answers reads all of them.
        return True, {
            "resultado": True,
            "fecha": _now_guatemala(),
            "origen": "Modo Demo",
            "descripcion": "MODO DEMO: documento validado contra el esquema SAT; no fue enviado a la SAT.",
            "control_emision": {"Saldo": 0, "Creditos": 0},
            "alertas_infile": False,
            "descripcion_alertas_infile": [],
            "alertas_sat": False,
            "descripcion_alertas_sat": [],
            "cantidad_errores": 0,
            "descripcion_errores": [],
            "informacion_adicional": "MODO DEMO",
            "uuid": new_uuid,
            "serie": serie,
            "numero": numero,
            "xml_certificado": base64.b64encode(xml_text.encode("utf-8")).decode("ascii"),
            "modo_demo": True,
        }

    def post_json(self, url, payload, headers):
        raise RuntimeError("El modo Demo no realiza llamadas de red.")
