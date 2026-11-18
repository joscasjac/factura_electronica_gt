# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
# For license information, please see license.txt
"""Validate DTE and anulación XML against SAT's official FEL schemas.

The schemas in fel/xsd/ come unchanged from SAT's repository. GT_Documento
declares <Complemento> content as a strict <xs:any/>, so a document only
validates when every complement's schema is loaded too. We build one wrapper
schema importing the main document schema plus every complement, and resolve
the remote xmldsig import to the bundled copy (no network access).

No Frappe imports: usable from unit tests and from the Demo certifier.


Two adjustments keep strict (libxml2) validation faithful to SAT's own checks:

- Several SAT patterns use ``^``/``$`` as anchors, e.g. ``^\\S(.*\\S)?$``. In XSD
  regular expressions those are literal characters (XSD patterns are always
  anchored), so libxml2 would reject every value. We strip anchors that start or
  end a pattern or an alternative, keeping ``[^...]`` negations.
- The signature is added by the certifier, so unsigned XML (what we build) is
  validated with the "missing ds:Signature" error ignored.

GT_Complemento_MediosdePago and GT_Complemento_TurismoPasaje are not loaded:
both reference an undeclared ``ctup:`` prefix and do not compile.
"""

from __future__ import unicode_literals

import functools
import os
import re

from lxml import etree

XSD_DIR = os.path.join(os.path.dirname(__file__), "xsd")
XMLDSIG_NS = "http://www.w3.org/2000/09/xmldsig#"

# One schema per namespace (lxml honours only the first import of a namespace).
DTE_SCHEMAS = (
    "GT_Documento-0.2.1.xsd",
    "GT_Complemento_Cambiaria-0.1.0.xsd",
    "GT_Complemento_Exportaciones-0.1.0.xsd",
    "GT_Complemento_Fac_Especial-0.1.0.xsd",
    "GT_Complemento_Referencia_Nota-0.1.0.xsd",
    "GT_Complemento_ReferenciaDTE-0.1.0.xsd",
    "GT_Complemento_ReferenciaConstancia-0.1.0.xsd",
    "GT_Complemento_CobroXCuentaAjena-0.1.0.xsd",
    "GT_Complemento_RetencionesFacturaEspecifica.xsd",
    "GT_ComplementoDetalleProductos-0.1.0.xsd",
    "GT_ComplementoAlItem.xsd",
)
ANULACION_SCHEMA = "GT_AnulacionDocumento-0.1.0.xsd"


_PATTERN_ATTR = re.compile(r'(<xs:pattern\s+value=")([^"]*)(")')
_LEADING_ANCHOR = re.compile(r"(^|(?<=[(|]))\^")
_TRAILING_ANCHOR = re.compile(r"(?<!\\)\$(?=$|[)|])")


def normalize_pattern(value):
    """Drop regex anchors that XSD would treat as literal characters."""
    return _TRAILING_ANCHOR.sub("", _LEADING_ANCHOR.sub("", value))


@functools.lru_cache(maxsize=None)
def _patched_schema_text(filename):
    with open(os.path.join(XSD_DIR, filename), encoding="utf-8") as handle:
        text = handle.read()
    return _PATTERN_ATTR.sub(lambda m: m.group(1) + normalize_pattern(m.group(2)) + m.group(3), text)


class _LocalResolver(etree.Resolver):
    """Serve bundled, pattern-normalized schemas; never touch the network."""

    def resolve(self, url, public_id, context):
        if not url:
            return None
        filename = os.path.basename(url)
        if filename == "xmldsig-core-schema.xsd" or os.path.exists(os.path.join(XSD_DIR, filename)):
            return self.resolve_string(_patched_schema_text(filename), context, base_url=os.path.join(XSD_DIR, filename))
        return None


def _parser():
    parser = etree.XMLParser(no_network=True, resolve_entities=False)
    parser.resolvers.add(_LocalResolver())
    return parser


def _target_namespace(filename):
    root = etree.fromstring(_patched_schema_text(filename).encode("utf-8"), _parser())
    return root.get("targetNamespace")


@functools.lru_cache(maxsize=None)
def _schema(*filenames):
    xs = "http://www.w3.org/2001/XMLSchema"
    wrapper = etree.Element("{%s}schema" % xs, nsmap={"xs": xs})
    for filename in filenames:
        etree.SubElement(
            wrapper,
            "{%s}import" % xs,
            namespace=_target_namespace(filename),
            schemaLocation=os.path.join(XSD_DIR, filename),
        )
    doc = etree.ElementTree(etree.fromstring(etree.tostring(wrapper), _parser()))
    doc.docinfo.URL = os.path.join(XSD_DIR, "_wrapper.xsd")
    return etree.XMLSchema(doc)


def dte_schema():
    return _schema(*DTE_SCHEMAS)


def anulacion_schema():
    return _schema(ANULACION_SCHEMA)


def _to_bytes(xml):
    if isinstance(xml, bytes):
        return xml
    return str(xml).encode("utf-8")


DTE_NS = "http://www.sat.gob.gt/dte/fel/0.2.0"
TOLERANCE = 0.01


def _num(element, tag):
    found = element.find("{%s}%s" % (DTE_NS, tag))
    return float(found.text) if found is not None and found.text else 0.0


def validate_totals(xml):
    """SAT arithmetic rules the schema cannot express (FEL rejects mismatches):

    - each Item: Total = Precio - Descuento + MontoImpuesto of every tax other than IVA
      (GT_Documento-0.2.1.xsd: "Precio menos Descuento más la sumatoria de las casillas
      MontoImpuesto de los impuestos que sean sumables"; IVA is already inside the price)
    - IVA at 12%: MontoImpuesto = 12% of MontoGravable, and MontoGravable + IVA = Precio - Descuento
    - per tax: sum of the lines' MontoImpuesto = TotalImpuesto/@TotalMontoImpuesto
    - GranTotal = sum of the lines' Total
    """
    try:
        root = etree.fromstring(_to_bytes(xml), _parser())
    except etree.XMLSyntaxError as exc:
        return ["XML mal formado: {0}".format(exc)]
    errors = []
    items = root.findall(".//{%s}Item" % DTE_NS)
    if not items:
        return errors
    line_taxes = {}
    total_lines = 0.0
    for item in items:
        line = item.get("NumeroLinea")
        total = _num(item, "Total")
        net_price = _num(item, "Precio") - _num(item, "Descuento")
        sumable = 0.0
        for impuesto in item.findall(".//{%s}Impuesto" % DTE_NS):
            name = impuesto.findtext("{%s}NombreCorto" % DTE_NS)
            amount = _num(impuesto, "MontoImpuesto")
            line_taxes[name] = line_taxes.get(name, 0.0) + amount
            if name != "IVA":
                sumable += amount
            elif impuesto.findtext("{%s}CodigoUnidadGravable" % DTE_NS) == "1":
                base = _num(impuesto, "MontoGravable")
                if abs(base * 0.12 - amount) > TOLERANCE:
                    errors.append("Línea {0}: IVA {1:.2f} != 12% de {2:.2f}".format(line, amount, base))
                if abs(base + amount - net_price) > TOLERANCE:
                    errors.append(
                        "Línea {0}: MontoGravable + IVA {1:.2f} != Precio - Descuento {2:.2f}".format(
                            line, base + amount, net_price
                        )
                    )
        expected = net_price + sumable
        if abs(total - expected) > TOLERANCE:
            errors.append(
                "Línea {0}: Total {1:.2f} != Precio - Descuento + otros impuestos {2:.2f}".format(
                    line, total, expected
                )
            )
        total_lines += total
    declared = {
        t.get("NombreCorto"): float(t.get("TotalMontoImpuesto") or 0)
        for t in root.findall(".//{%s}TotalImpuesto" % DTE_NS)
    }
    for name in sorted(set(line_taxes) | set(declared)):
        if abs(line_taxes.get(name, 0.0) - declared.get(name, 0.0)) > TOLERANCE:
            errors.append(
                "Impuesto {0}: líneas suman {1:.2f}, TotalImpuesto declara {2:.2f}".format(
                    name, line_taxes.get(name, 0.0), declared.get(name, 0.0)
                )
            )
    gran_total = root.find(".//{%s}GranTotal" % DTE_NS)
    if gran_total is not None and abs(float(gran_total.text) - total_lines) > TOLERANCE:
        errors.append("GranTotal {0} != suma de líneas {1:.2f}".format(gran_total.text, total_lines))
    return errors


def _is_missing_signature(message):
    return "Missing child element" in message and XMLDSIG_NS + "}Signature" in message


def validate(xml, anulacion=None, signed=False):
    """Return a list of human-readable schema errors ([] when valid).

    `anulacion` picks the schema; when None it is detected from the root element.
    With `signed=False` (XML we built, before the certifier signs it) a missing
    ds:Signature is not reported.
    """
    try:
        root = etree.fromstring(_to_bytes(xml), _parser())
    except etree.XMLSyntaxError as exc:
        return ["XML mal formado: {0}".format(exc)]
    if anulacion is None:
        anulacion = etree.QName(root).localname == "GTAnulacionDocumento"
    schema = anulacion_schema() if anulacion else dte_schema()
    if schema.validate(root):
        return []
    return [
        "Línea {0}: {1}".format(error.line, error.message)
        for error in schema.error_log
        if signed or not _is_missing_signature(error.message)
    ]
