"""Libro de Ventas follows SAT validity; Estado FEL "Por anular"; bulk Validar/Cancelar guards.
Needs l10n_guatemala's FEL demo fixtures (bench --site <site> run-tests --module ...)."""

from unittest import mock

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, nowdate


def fixtures():
	try:
		from l10n_guatemala.tests import fel_fixtures as fx
	except ImportError:
		raise __import__("unittest").SkipTest("needs l10n_guatemala test fixtures") from None
	return fx


class TestSatValidity(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.fx = fixtures()
		cls.config = cls.fx.setup_fel_demo()
		frappe.db.commit()  # nosemgrep
		cls.item = cls.fx.ensure_item("_Test GT FEL Service")

	def certified(self):
		from factura_electronica.fel_api import generate_electronic_invoice

		invoice = self.fx.make_sales_invoice([(self.item, 112)])
		ok, result = generate_electronic_invoice(invoice.name, invoice.naming_series)
		self.assertTrue(ok, result)
		return self.fx.envio_for(invoice.name)

	def ledger(self):
		from factura_electronica.factura_electronica.report.gt_sales_ledger.gt_sales_ledger import execute

		company = frappe.db.get_value("Sales Invoice", self.certified().serie_para_factura, "company")
		start = getdate(nowdate()).replace(day=1)
		return execute(frappe._dict(company=company, from_date=str(start), to_date=str(add_days(start, 40)), options="No Subtotal", language="es"))

	def test_book_counts_only_documents_valid_in_sat(self):
		valid = self.certified()
		annulled = self.certified()
		frappe.db.set_value("Envio FEL", annulled.name, "status", "Cancelled")
		cancelled_but_valid = self.certified()
		frappe.db.set_value("Sales Invoice", cancelled_but_valid.serie_para_factura, "docstatus", 2)
		pending = self.fx.make_sales_invoice([(self.item, 112)])

		columns, data, message = self.ledger()
		names = {row.get("num_doc") for row in data}
		self.assertIn(valid.serie_para_factura, names)
		self.assertIn(cancelled_but_valid.serie_para_factura, names)
		self.assertNotIn(annulled.serie_para_factura, names)
		self.assertNotIn(pending.name, names)
		self.assertIn("sin certificar", message)
		self.assertIn("anulada", message)
		self.assertIn("fuel_iva", [c["fieldname"] for c in columns])

	def test_estado_por_anular(self):
		from factura_electronica.fel.status import compute

		envio = self.certified()
		self.assertEqual(compute(envio.serie_para_factura), "Demo")  # Demo mode: never sent to SAT
		frappe.db.set_value("Sales Invoice", envio.serie_para_factura, "docstatus", 2)
		self.assertEqual(compute(envio.serie_para_factura), "Por anular")
		frappe.db.set_value("Envio FEL", envio.name, "status", "Cancelled")
		self.assertEqual(compute(envio.serie_para_factura), "Anulada")

	def test_bulk_cancel_refuses_a_certified_invoice(self):
		from factura_electronica.fel import auto

		envio = self.certified()
		doc = frappe.get_doc("Sales Invoice", envio.serie_para_factura)
		with mock.patch.object(auto, "from_bulk_action", return_value=True):
			with self.assertRaises(frappe.ValidationError):
				auto.before_cancel(doc)
		with mock.patch.object(auto, "from_bulk_action", return_value=False):
			auto.before_cancel(doc)  # from the form: allowed (the form asked the reason)

	def test_bulk_submit_does_not_certify(self):
		from factura_electronica.fel import auto

		for f in ("certificar_al_validar", "tipo_documento_automatico"):
			frappe.db.set_value("Configuracion Factura Electronica", self.config, f, 1)
		try:
			draft = self.fx.make_sales_invoice([(self.item, 112)], submit=False)
			with mock.patch.object(auto, "from_bulk_action", return_value=True), mock.patch.object(auto, "_certify_after_commit") as certify:
				draft.submit()
				frappe.db.commit()  # nosemgrep: after_commit callbacks run here
			certify.assert_not_called()
		finally:
			self.fx.manual_flow(self.config)

	def test_from_bulk_action_detects_the_bulk_loop(self):
		from factura_electronica.fel.auto import from_bulk_action

		self.assertFalse(from_bulk_action())

		def _bulk_action():
			return from_bulk_action()

		_bulk_action.__code__ = _bulk_action.__code__.replace(co_filename="/x/frappe/desk/doctype/bulk_update/bulk_update.py")
		self.assertTrue(_bulk_action())
