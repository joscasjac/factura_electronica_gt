// Certification renames a Sales Invoice to its SAT serie+numero. An old link or bookmark
// with the internal number (FACT-2026-00124) would show "not found": open the renamed one.
(function () {
  const original = frappe.show_not_found;
  frappe.show_not_found = function (...args) {
    const route = frappe.get_route() || [];
    if (route[0] === "Form" && ["Sales Invoice", "Purchase Invoice"].includes(route[1]) && route[2]) {
      frappe
        .call({ method: "factura_electronica.fel.status.renamed_to", args: { doctype: route[1], name: route[2] } })
        .then(({ message }) => {
          if (message) {
            frappe.show_alert({ message: __("{0} ahora se llama {1} (serie y número de SAT).", [route[2], message]), indicator: "blue" });
            frappe.set_route("Form", route[1], message);
          } else {
            original.apply(this, args);
          }
        });
      return;
    }
    return original.apply(this, args);
  };
})();
