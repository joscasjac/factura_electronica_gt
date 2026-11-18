"""Turn on certify-on-submit, automatic document type and annul-on-cancel for existing
configurations in Demo or Pruebas. They defaulted on only for new configurations, so older
sites kept the manual flow without being told. Producción is left as it is: changing how
live invoices reach SAT is the client's decision (the configuration form says what is off).
"""

import frappe

FLAGS = ("certificar_al_validar", "tipo_documento_automatico", "anular_al_cancelar")


def execute():
	meta = frappe.get_meta("Configuracion Factura Electronica")
	flags = [f for f in FLAGS if meta.has_field(f)]
	if not flags or not meta.has_field("modo"):
		return
	for name in frappe.get_all(
		"Configuracion Factura Electronica", filters={"docstatus": 1, "modo": ("in", ["Demo", "Pruebas"])}, pluck="name"
	):
		frappe.db.set_value("Configuracion Factura Electronica", name, {f: 1 for f in flags}, update_modified=False)
