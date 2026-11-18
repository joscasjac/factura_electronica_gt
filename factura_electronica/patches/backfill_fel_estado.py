"""Fill Estado FEL on existing invoices."""


def execute():
    from factura_electronica.fel.status import backfill, ensure_field

    ensure_field()
    backfill()
