# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
"""SAT schema validation. Loads fel/xsd_validation.py by path so it runs without Frappe:

    python -m pytest factura_electronica/tests/test_xsd_validation.py
"""

from __future__ import unicode_literals

import importlib.util
import os
import unittest

_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fel", "xsd_validation.py")
_spec = importlib.util.spec_from_file_location("fel_xsd_validation", _PATH)
xsd_validation = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xsd_validation)

ROOM_NIGHT_FACT = """<?xml version="1.0" encoding="UTF-8"?>
<dte:GTDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.2.0" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Version="0.1">
  <dte:SAT ClaseDocumento="dte">
    <dte:DTE ID="DatosCertificados">
      <dte:DatosEmision ID="DatosEmision">
        <dte:DatosGenerales CodigoMoneda="GTQ" FechaHoraEmision="2026-11-17T10:00:00-06:00" Tipo="FACT"/>
        <dte:Emisor AfiliacionIVA="GEN" CodigoEstablecimiento="1" NITEmisor="576937K" NombreComercial="Hotel Prueba" NombreEmisor="Hotel Prueba, S.A.">
          <dte:DireccionEmisor>
            <dte:Direccion>Zona 10</dte:Direccion><dte:CodigoPostal>01010</dte:CodigoPostal>
            <dte:Municipio>Guatemala</dte:Municipio><dte:Departamento>Guatemala</dte:Departamento><dte:Pais>GT</dte:Pais>
          </dte:DireccionEmisor>
        </dte:Emisor>
        <dte:Receptor IDReceptor="CF" NombreReceptor="Consumidor Final"/>
        <dte:Frases><dte:Frase TipoFrase="1" CodigoEscenario="1"/></dte:Frases>
        <dte:Items>
          <dte:Item BienOServicio="S" NumeroLinea="1">
            <dte:Cantidad>1</dte:Cantidad><dte:UnidadMedida>UNI</dte:UnidadMedida>
            <dte:Descripcion>Habitación doble</dte:Descripcion>
            <dte:PrecioUnitario>112.00</dte:PrecioUnitario><dte:Precio>112.00</dte:Precio><dte:Descuento>0.00</dte:Descuento>
            <dte:Impuestos>
              <dte:Impuesto>
                <dte:NombreCorto>IVA</dte:NombreCorto><dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>
                <dte:MontoGravable>100.00</dte:MontoGravable><dte:MontoImpuesto>12.00</dte:MontoImpuesto>
              </dte:Impuesto>
              <dte:Impuesto>
                <dte:NombreCorto>TURISMO HOSPEDAJE</dte:NombreCorto><dte:CodigoUnidadGravable>1</dte:CodigoUnidadGravable>
                <dte:MontoGravable>100.00</dte:MontoGravable><dte:MontoImpuesto>10.00</dte:MontoImpuesto>
              </dte:Impuesto>
            </dte:Impuestos>
            <dte:Total>122.00</dte:Total>
          </dte:Item>
        </dte:Items>
        <dte:Totales>
          <dte:TotalImpuestos>
            <dte:TotalImpuesto NombreCorto="IVA" TotalMontoImpuesto="12.00"/>
            <dte:TotalImpuesto NombreCorto="TURISMO HOSPEDAJE" TotalMontoImpuesto="10.00"/>
          </dte:TotalImpuestos>
          <dte:GranTotal>122.00</dte:GranTotal>
        </dte:Totales>
      </dte:DatosEmision>
    </dte:DTE>
  </dte:SAT>
</dte:GTDocumento>"""

FCAM_COMPLEMENT = """<dte:Complementos>
          <dte:Complemento IDComplemento="1" NombreComplemento="AbonosFacturaCambiaria" URIComplemento="http://www.sat.gob.gt/dte/fel/CompCambiaria/0.1.0">
            <cfc:AbonosFacturaCambiaria xmlns:cfc="http://www.sat.gob.gt/dte/fel/CompCambiaria/0.1.0" Version="1">
              <cfc:Abono><cfc:NumeroAbono>1</cfc:NumeroAbono><cfc:FechaVencimiento>2026-12-17</cfc:FechaVencimiento><cfc:MontoAbono>122.00</cfc:MontoAbono></cfc:Abono>
            </cfc:AbonosFacturaCambiaria>
          </dte:Complemento>
        </dte:Complementos>
        """

ANULACION = """<?xml version="1.0" encoding="UTF-8"?>
<dte:GTAnulacionDocumento xmlns:dte="http://www.sat.gob.gt/dte/fel/0.1.0" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Version="0.1">
  <dte:SAT>
    <dte:AnulacionDTE ID="DatosCertificados">
      <dte:DatosGenerales ID="DatosAnulacion" NumeroDocumentoAAnular="11111111-2222-3333-4444-555555555555"
        NITEmisor="576937K" IDReceptor="CF" FechaEmisionDocumentoAnular="2026-11-17T10:00:00-06:00"
        FechaHoraAnulacion="2026-11-17T12:00:00-06:00" MotivoAnulacion="Error en datos"/>
    </dte:AnulacionDTE>
  </dte:SAT>
</dte:GTAnulacionDocumento>"""


class TestXsdValidation(unittest.TestCase):
    def test_room_night_with_inguat_is_valid(self):
        self.assertEqual(xsd_validation.validate(ROOM_NIGHT_FACT), [])

    def test_missing_required_element_is_reported(self):
        broken = ROOM_NIGHT_FACT.replace("<dte:GranTotal>122.00</dte:GranTotal>", "")
        errors = xsd_validation.validate(broken)
        self.assertTrue(errors)
        self.assertIn("GranTotal", " ".join(errors))

    def test_bad_enumeration_is_reported(self):
        errors = xsd_validation.validate(ROOM_NIGHT_FACT.replace('Tipo="FACT"', 'Tipo="XXXX"'))
        self.assertTrue(errors)

    def test_cambiaria_complement_is_validated_against_its_schema(self):
        fcam = ROOM_NIGHT_FACT.replace('Tipo="FACT"', 'Tipo="FCAM"').replace(
            "</dte:Totales>", "</dte:Totales>\n        " + FCAM_COMPLEMENT
        )
        self.assertEqual(xsd_validation.validate(fcam), [])
        bad = fcam.replace("<cfc:MontoAbono>122.00</cfc:MontoAbono>", "")
        self.assertTrue(xsd_validation.validate(bad))

    def test_anulacion_is_detected_and_valid(self):
        self.assertEqual(xsd_validation.validate(ANULACION), [])

    def test_pattern_anchors_are_normalized_but_negations_kept(self):
        normalize = xsd_validation.normalize_pattern
        self.assertEqual(normalize(r"^\S(.*\S)?$"), r"\S(.*\S)?")
        self.assertEqual(normalize("((CF)|^([A-Z]{3,18}))$"), "((CF)|([A-Z]{3,18}))")
        self.assertEqual(normalize(r"[^\s]*"), r"[^\s]*")
        self.assertEqual(normalize(r"a\$"), r"a\$")

    def test_signature_required_once_signed(self):
        errors = xsd_validation.validate(ROOM_NIGHT_FACT, signed=True)
        self.assertTrue(any("Signature" in e for e in errors))

    def test_totals_reconcile_for_room_night(self):
        self.assertEqual(xsd_validation.validate_totals(ROOM_NIGHT_FACT), [])

    def test_totals_mismatch_is_reported(self):
        bad = ROOM_NIGHT_FACT.replace('NombreCorto="IVA" TotalMontoImpuesto="12.00"', 'NombreCorto="IVA" TotalMontoImpuesto="13.07"')
        errors = xsd_validation.validate_totals(bad)
        self.assertEqual(len(errors), 1)
        self.assertIn("IVA", errors[0])
        bad_total = ROOM_NIGHT_FACT.replace("<dte:GranTotal>122.00</dte:GranTotal>", "<dte:GranTotal>130.00</dte:GranTotal>")
        self.assertTrue(any("GranTotal" in e for e in xsd_validation.validate_totals(bad_total)))

    def test_price_must_exclude_taxes_other_than_iva(self):
        """SAT: Total = Precio - Descuento + non-IVA taxes, so INGUAT stays out of Precio."""
        inguat_in_price = ROOM_NIGHT_FACT.replace(
            "<dte:PrecioUnitario>112.00</dte:PrecioUnitario><dte:Precio>112.00</dte:Precio>",
            "<dte:PrecioUnitario>122.00</dte:PrecioUnitario><dte:Precio>122.00</dte:Precio>",
        )
        errors = xsd_validation.validate_totals(inguat_in_price)
        self.assertTrue(any("otros impuestos" in e for e in errors), errors)

    def test_malformed_xml(self):
        self.assertTrue(xsd_validation.validate("<dte:GTDocumento>"))


if __name__ == "__main__":
    unittest.main()
