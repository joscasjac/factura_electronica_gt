// Sales Invoice list: Estado FEL column (coloured) and a bulk "Certificar en SAT" action.
// Extends ERPNext's own list settings, loaded before this file.
(function () {
  const settings = (frappe.listview_settings["Sales Invoice"] = frappe.listview_settings["Sales Invoice"] || {});
  settings.add_fields = [...(settings.add_fields || []), "fel_estado"];
  // colours chosen apart from ERPNext's own status pills (orange "No pagado", red "Cancelado")
  const colors = { Pendiente: "purple", Certificada: "green", Demo: "yellow", Contingencia: "orange", Anulada: "gray", "Por anular": "red" };
  settings.formatters = Object.assign({}, settings.formatters, {
    fel_estado(value) {
      if (!value) return `<span class="text-muted">—</span>`;
      return `<span class="indicator-pill ${colors[value] || "gray"} filterable ellipsis" data-filter="fel_estado,=,${frappe.utils.escape_html(value)}"><span class="ellipsis">${__(value)}</span></span>`;
    },
  });
  const base_onload = settings.onload;
  settings.onload = function (listview) {
    if (base_onload) base_onload(listview);
    // the clerk's queue: what still has to reach SAT
    listview.page.add_inner_button(__("Pendientes en SAT"), () => {
      listview.filter_area.clear(false).then(() => listview.filter_area.add([["Sales Invoice", "fel_estado", "in", ["Pendiente", "Contingencia", "Por anular"]]]));
    });
    if (!frappe.model.can_submit("Sales Invoice")) return;
    const certify = () => {
      const names = listview.get_checked_items().filter((d) => d.docstatus === 1 && ["Pendiente", "Contingencia"].includes(d.fel_estado)).map((d) => d.name);
      if (!names.length) {
        frappe.msgprint(__("Seleccione facturas validadas pendientes o en contingencia."));
        return;
      }
      frappe.confirm(__("¿Certificar {0} factura(s) en SAT?", [names.length]), () =>
        frappe
          .call({
            method: "factura_electronica.fel.status.bulk_certify",
            args: { invoices: names },
            freeze: true,
            freeze_message: __("Certificando en SAT…"),
          })
          .then(({ message: results }) => {
            const esc = frappe.utils.escape_html;
            const ok = results.filter((r) => r.ok).length;
            const failed = results.filter((r) => !r.ok);
            let html = `<p>${__("{0} certificada(s).", [ok])}</p>`;
            if (failed.length) {
              html += `<ul>${failed.map((r) => `<li><a href="/app/sales-invoice/${encodeURIComponent(r.name)}">${esc(r.name)}</a>: ${r.contingency ? __("en contingencia, se reintenta cada hora") : esc(r.message || "")}</li>`).join("")}</ul>`;
            }
            frappe.msgprint({ title: __("Certificar en SAT"), message: html, indicator: failed.length ? "orange" : "green" });
            listview.refresh();
          })
      );
    };
    listview.page.add_action_item(__("Certificar en SAT"), certify);
    // also as a visible primary button while the selection holds invoices to certify
    const button = listview.page.add_inner_button(__("Certificar seleccionadas"), certify);
    button.addClass("btn-primary").hide();
    const toggle = () => {
      const any = listview.get_checked_items().some((d) => d.docstatus === 1 && ["Pendiente", "Contingencia"].includes(d.fel_estado));
      button.toggle(any);
    };
    listview.$result.on("change", "input.list-row-checkbox, input.list-check-all", () => setTimeout(toggle, 0));
  };
})();
