"""Estado FEL on Sales Invoice: one stored value per invoice, for the list column and filter.

Pendiente (submitted, not certified) · Certificada · Demo (validated in Demo mode: never sent,
no fiscal value) · Contingencia · Anulada · Por anular (cancelled in ERPNext but still valid in
SAT: someone has to annul it). "Documento SAT" keeps "serie · número" readable next to the
run-together name certification gives the invoice. Empty on drafts
and on invoices whose series is not FEL. Kept current from the invoice's own events and from
Envio FEL (certification, annulment); a patch backfills existing invoices.
"""

import frappe
from frappe import _
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELD = "fel_estado"
OPTIONS = "\nPendiente\nCertificada\nDemo\nContingencia\nAnulada\nPor anular"
DOC_FIELD = "fel_documento"


def ensure_field():
	create_custom_fields(
		{
			"Sales Invoice": [
				{
					"fieldname": FIELD,
					"fieldtype": "Select",
					"label": "FEL status",
					"options": OPTIONS,
					"insert_after": "numero_autorizacion_fel",
					"read_only": 1,
					"no_copy": 1,
					"allow_on_submit": 1,
					"in_list_view": 1,
					"in_standard_filter": 1,
					"print_hide": 1,
				},
				{
					"fieldname": DOC_FIELD,
					"fieldtype": "Data",
					"label": "SAT document",
					"insert_after": FIELD,
					"read_only": 1,
					"no_copy": 1,
					"allow_on_submit": 1,
					"in_list_view": 1,
					"print_hide": 1,
					"description": "Serie · número assigned by SAT.",
				},
			]
		},
		update=True,
	)
	# the list answers "what is this invoice in SAT": due date is a payments question
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	if frappe.get_meta("Sales Invoice").get_field("due_date").in_list_view:
		make_property_setter("Sales Invoice", "due_date", "in_list_view", "0", "Check", validate_fields_for_doctype=False)


def compute(invoice) -> str:
	from factura_electronica.fel.auto import document_type

	row = frappe.db.get_value(
		"Sales Invoice", invoice, ["name", "docstatus", "numero_autorizacion_fel", "fel_contingencia"], as_dict=True
	) if frappe.get_meta("Sales Invoice").has_field("fel_contingencia") else frappe.db.get_value(
		"Sales Invoice", invoice, ["name", "docstatus", "numero_autorizacion_fel"], as_dict=True
	)
	if not row or row.docstatus == 0:
		return ""
	if row.numero_autorizacion_fel:
		envio = frappe.db.get_value("Envio FEL", row.numero_autorizacion_fel, ["status", "configuracion"], as_dict=True) or frappe._dict()
		if envio.status == "Cancelled":
			return "Anulada"
		if row.docstatus == 2:
			return "Por anular"
		return "Demo" if _demo(envio.configuracion) else "Certificada"
	if row.docstatus == 2:
		return ""
	tipo, _export = document_type(row.name)
	if not tipo:
		return ""
	return "Contingencia" if row.get("fel_contingencia") else "Pendiente"


def _demo(config):
	return bool(config) and frappe.get_meta("Configuracion Factura Electronica").has_field("modo") and frappe.db.get_value(
		"Configuracion Factura Electronica", config, "modo"
	) == "Demo"


def document_label(invoice) -> str:
	uuid = frappe.db.get_value("Sales Invoice", invoice, "numero_autorizacion_fel")
	if not uuid:
		return ""
	envio = frappe.db.get_value("Envio FEL", uuid, ["serie", "numero"], as_dict=True)
	return f"{envio.serie} · {envio.numero}" if envio and envio.serie else ""


def refresh(invoice):
	meta = frappe.get_meta("Sales Invoice")
	if not invoice or not frappe.db.exists("Sales Invoice", invoice) or not meta.has_field(FIELD):
		return
	values = {FIELD: compute(invoice)}
	if meta.has_field(DOC_FIELD):
		values[DOC_FIELD] = document_label(invoice)
	current = frappe.db.get_value("Sales Invoice", invoice, list(values), as_dict=True)
	if any((current.get(k) or "") != (v or "") for k, v in values.items()):
		frappe.db.set_value("Sales Invoice", invoice, values, update_modified=False)


def on_invoice_event(doc, method=None):
	refresh(doc.name)
	# certification runs after the submit commits and may rename the invoice
	frappe.db.after_commit.add(lambda: _refresh_committed(doc.name))


def _refresh_committed(name):
	try:
		renamed = frappe.db.get_value("Envio FEL", {"serie_factura_original": name}, "serie_para_factura")
		refresh(renamed or name)
		frappe.db.commit()
	except Exception:
		frappe.log_error(title="FEL status refresh")


def on_envio_event(doc, method=None):
	refresh(doc.get("serie_para_factura"))
	if doc.get("serie_factura_original") and doc.get("serie_factura_original") != doc.get("serie_para_factura"):
		refresh(doc.get("serie_factura_original"))


def backfill():
	for name in frappe.get_all("Sales Invoice", filters={"docstatus": ("!=", 0)}, pluck="name", limit_page_length=0):
		refresh(name)


@frappe.whitelist(methods=["POST"])
def bulk_certify(invoices):
	"""List action: certify the selected submitted, uncertified invoices one by one."""
	from factura_electronica.fel.auto import certify

	names = frappe.parse_json(invoices) or []
	if len(names) > 100:
		frappe.throw(_("Seleccione hasta 100 facturas a la vez."))
	results = []
	for name in names:
		doc = frappe.get_doc("Sales Invoice", name)
		if not doc.has_permission("submit"):
			results.append({"name": name, "ok": False, "message": _("Sin permiso.")})
			continue
		if doc.docstatus != 1 or doc.get("numero_autorizacion_fel"):
			continue
		result = certify(name)
		refresh(result.get("name") or name)
		frappe.db.commit()
		results.append({"name": result.get("name") or name, "ok": result.get("ok"), "contingency": result.get("contingency"), "message": result.get("message")})
	return results


@frappe.whitelist()
def renamed_to(doctype, name):
	"""The current name of an invoice certified (and renamed) from `name`, if the user may read it."""
	if doctype not in ("Sales Invoice", "Purchase Invoice") or not frappe.get_meta(doctype).has_field("serie_original_del_documento"):
		return None
	current = frappe.db.get_value(doctype, {"serie_original_del_documento": name}, "name")
	if current and frappe.has_permission(doctype, "read", current):
		return current
	return None
