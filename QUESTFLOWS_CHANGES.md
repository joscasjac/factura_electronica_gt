# QuestFlows changes on top of `production-v16`

Branch `questflows-v16`, forked from `sihaysistema/factura_electronica_gt@production-v16`
(785bfd0). Each item below is self-contained and can be offered upstream as its own PR.
Verified on Frappe 16.34 / ERPNext 16.35 / HRMS 16.19 with the integration tests in
`l10n_guatemala/tests/test_fel_demo.py` and `test_sat_books.py`.

## New
- **Demo mode** (`fel/certifiers/demo.py`, `Configuracion Factura Electronica.modo`:
  Demo / Pruebas / Producción, default Demo). Demo validates every DTE against SAT's
  schemas and arithmetic rules and answers like INFILE, with no credentials or network.
- **SAT schema validation** (`fel/xsd_validation.py`, `fel/xsd/`): SAT's official XSDs
  (github.com/notificacioneselectfel/Catalogo-FEL, GPL-3.0) with a wrapper that loads every
  complement. Works around two SAT schema defects: `^`/`$` anchors that strict XSD treats
  as literals, and two complements (MediosdePago, TurismoPasaje) that do not compile.
  `validate_totals()` checks Total = Precio − Descuento, line taxes = TotalImpuesto, and
  GranTotal = sum of lines.
- **DIGIFACT certifier** (`fel/certifiers/digifact.py`), protocol adapted from
  aquih/fel_digifact (BSD-3). TLS verification on.
- **G4S certifier** (`fel/certifiers/g4s.py`): SOAP RequestTransaction built by hand from
  G4S's published WSDL (no SOAP library), protocol adapted from aquih/fel_g4s (BSD-3).
  Certify, cancel and the certified PDF (GET_DOCUMENT).
- **Contingency mode** (`fel/contingency.py`): when the certifier is unreachable
  (connection error, timeout, HTTP 5xx) the Sales Invoice gets a NumeroAcceso,
  `fel_contingencia` and `fel_contingencia_desde`; an hourly job re-sends it with that
  NumeroAcceso and alerts (Error Log + comment) after 3 days. SAT rejections are not
  contingencies. INFILE and DIGIFACT calls now have a 60 s timeout.
- **Sales-side Nota de Débito**: `fel_api.generate_sales_debit_note` (Sales Invoice with
  `is_debit_note`, references the original UUID), with a "NOTA DE DÉBITO FEL" button.
- **Certifier-neutral printing** (`fel/print_support.py`, print format *Factura Electronica
  FEL*): authorization, serie/número, frases from the certified XML, contingency and
  "not certified" banners, QR. "Ver PDF" opens INFILE's viewer, the certifier's PDF
  attached to the Envio FEL (DIGIFACT, G4S) or this print format (Demo). The QR encodes
  the certifier's viewer or SAT's verifier URL.
- **Factura Cambiaria suggestion**: a credit sale (due date after posting date) on a FACT
  / FPEQ series shows a banner offering the FCAM / FCAP series.
- **Retention report rewritten** to read Tax Retention Guatemala (it queried misspelled
  columns and returned nothing for sales); FESP now registers its ISR and IVA retentions.
- **Per-line taxes from ERPNext v16** (`fel/tax_lines.py`) used by FACT, FCAM, NCRE and FESP:
  - TURISMO HOSPEDAJE (INGUAT 10%) emitted on lodging lines (the placeholder was empty);
  - exempt lines sent as IVA unidad gravable 2 with MontoImpuesto 0 (were sent at 12%);
  - totals summed from the same lines (they used `amount / 1.12`, wrong as soon as a line
    had INGUAT or no IVA);
  - frase 4 (base legal del exento) added automatically when a line is exempt (export:
    escenario 1; otherwise the configuration's `codigo_escenario`);
  - FPEQ / FCAP sent without an IVA breakdown.

## Desk redesign (from a full UI critique, 2026-11-18)
- `fel/auto.py`: one dispatcher (`certify`) for every sales DTE type, plus three settings in
  Configuracion Factura Electronica, all on by default:
  - `certificar_al_validar`: Submit certifies (after the commit, so ledger entries are saved
    first and an outage leaves a valid invoice in contingency). Off for review/batch flows.
  - `tipo_documento_automatico`: the FEL series is chosen at insert (credit → FCAM, abroad →
    export, Pequeño Contribuyente → FPEQ/FCAP, returns → NCRE, debit notes → NDEB).
  - `anular_al_cancelar`: Cancel on a certified invoice asks the reason and annuls in SAT.
- Sales Invoice form (`public/js/sales_invoice.js`): the 13 one-off ALL-CAPS buttons are
  replaced by a status line (certificada / pendiente / contingencia / anulada, Demo warning),
  one primary action and a "FEL" menu (PDF, nota de débito, cobro con retención,
  anular); credit notes use ERPNext's own Crear › Devolución / Nota de crédito. One summary dialog replaces "Permanently submit/cancel?" when FEL acts.
- FEL fields on Sales Invoice show only when they hold a value or apply; the second NIT,
  legacy GFACE CAE fields and the duplicate VAT total are hidden; DPI/passport flags are set
  from the customer's ID type (l10n_guatemala). List view drops the three yes/no columns.
- Customer / Supplier / Company: Tax ID is the single NIT input (the FEL copy follows it and
  is hidden); forms no longer open as "Not Saved"; SAT name hint when the NIT is typed
  (`buscar_nit.lookup_receiver`, not in Demo mode).
- Configuracion Factura Electronica: Spanish labels with accents, sentence case, a
  "Modo y automatización" section. Purchase Invoice FEL actions grouped under "FEL".
- Cancellation stores `motivo_anulacion` / `fecha_anulacion` on Envio FEL.
- Print format: ANULADO banner, readable certification date, establishment, currency and
  exchange rate, Factura Cambiaria installments, QR caption, no QR on Demo or annulled
  documents, darker table header, address without repetition. Patch
  `allow_print_annulled_documents` turns on Print Settings › Allow Print for Cancelled once,
  so annulled DTEs can be reprinted.
- SAT books default to the previous month; 130+ Spanish translations added.
- The IDP special-tax GL correction runs on the server at submit (it ran in the browser
  after submit, under a name certification had already changed).

## Fixes
- After-save FEL calculation ran on submitted invoices too (HTTP 417 after every submit).
- **Line totals follow SAT's rule** (GT_Documento-0.2.1.xsd: Total = Precio − Descuento +
  MontoImpuesto of taxes other than IVA). Lines with INGUAT or IDP now send Precio with IVA
  only; the validator checks this and that IVA = 12% of MontoGravable.
- **Amounts rounded to whole quetzales** when System Settings › Currency Precision is blank
  (Frappe's default): `get_currency_precision()` returned 0. Now 2.
- **ISR retention above Q30,000** was 30,000 × 7 (no /100) + 7% of the excess; now
  bracketed: 5% of the first Q30,000 + 7% of the excess (`utils/formulas.apply_formula_isr`).
- **Sales retention Journal Entry rewritten** (`controllers/journal_entry.py`): retained ISR
  and IVA go to the receivable retention accounts (they are an asset for the seller), the
  IVA retention uses the agent's rate (default 15%, chosen in the dialog) instead of 100%,
  no goal-seek rounding rows, and each retention is registered with its amount (it was
  saved without amount and with a misspelled party key).
- FESP Journal Entry: retained IVA goes to `vat_retention_payable` (owed to SAT).
- IDP fuel lines: fuel flag checked before the service flag (Item marks "service" by
  default, which hid PETROLEO); totals summed from the built lines.
- Libro Diario rewritten from GL Entry: every posted voucher, numbered partidas; it only
  listed Journal Entries, including drafts and cancelled ones. Libro Mayor excluded
  cancelled GL entries (`is_cancelled`).
- Fresh v16 site: `Sales Invoice.nombre_segun_sat` was read by every generator but never
  created (now created in `install.ensure_core_custom_fields`).
- ERPNext's setup wizard crashed: UOM code, Company NIT/trade name and Supplier NIT were
  mandatory at database level. Now optional; FEL still needs them at certification.
- `save_answers` failures were swallowed in all 8 generators (`status_saved == False` is
  never true for a tuple); `upgrade_records` returned `None` instead of an error.
- FCAM `NumeroAcceso` was `000000001`, below SAT's minimum 100000000
  (`utils/access_number.py`); omitted when absent (FCAP).
- Export complement: missing required `PaisConsignatario`, and SAT expects the Spanish
  country name, not the ISO code (`utils/sat_countries.py`, `data/sat_export_countries.json`).
  `IDComplemento`/`URIComplemento` had placeholder values.
- Cancellation ignored the user's reason (`MotivoAnulacion` hard-coded) and sent
  `IDReceptor="NONE"` for consumidor final.
- FESP: the seller's CUI can come from the Supplier's Tax ID (`utils/supplier_cui.py`).
- Asistelibros report queried a non-existent `ip_prefix` column (`id_prefix`).
- FCAM access-number hook wrote `error-camb.txt` into the sites folder; now `frappe.log_error`.

## Tests touched
- `tests/test_certificadores.py`: DIGIFACT and G4S resolve to their adapters; MEGAPRINT is
  the "not implemented" example.
- `tests/test_optional_fixtures.py`, `tests/test_uom_fel_codes.py`, the item-ranking and
  price-card report tests: stubs of `frappe.db` / `frappe.get_installed_apps` are now
  scoped and restored. Under bench they replaced the real objects and broke every suite
  that ran after them (that was most of the "known failures" below). Invalid-filter tests
  accept Frappe's ValidationError as well as the stub's ValueError.
- `test_gt_monthly_sales_history`: the message test patches the daily query too.
- `test_gt_monthly_sales_history_frappe` (builds a v13 site) is skipped on other versions.
- `tests/test_fel_config.py`: configurations set `modo = Pruebas` (Demo is the default and
  never calls INFILE); its fake response has a status code; tearDown removes the HRMS
  Expense Claim Account rows of deleted test companies (they broke the next company insert).
- `tests/test_fel_config.py`: test companies use NITs that pass the SAT mod-11 check.
- New `tests/test_xsd_validation.py` (runs without Frappe: `python tests/test_xsd_validation.py`).

## Test status
`bench --site <site> run-tests --app factura_electronica`: 178 tests, all pass on a fresh site (2 skipped:
v13-only checks). The ones that failed before were caused by the stub leaks above.
