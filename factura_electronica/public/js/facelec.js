console.log("Se cargo exitosamente la aplicación de Factura Electrónica");
/* 1 --------------------------------------------------------------------------------------------------------------- */
/**
 * Funcionamiento: Valida que el Nit sea C/F o un numero de nit valido permitiendo
 * activar la opcion para guardar. Si el nit es invalido desactiva la funcion
 * guardar hasta que se ingrese uno correcto, esto permite no tener errores con
 * INFILE y tener los datos correctos.
 */
export function valNit(nit, cus_supp, frm) {
  var nit_validado;
  if (nit === "C/F" || nit === "c/f") {
    frm.enable_save(); // Activa y Muestra el boton guardar de Sales Invoice
  } else {
    var nd,
      add = 0;
    if ((nd = /^(\d+)\-?([\dk])$/i.exec(nit))) {
      nd[2] = nd[2].toLowerCase() == "k" ? 10 : parseInt(nd[2]);
      for (var i = 0; i < nd[1].length; i++) {
        add += ((i - nd[1].length) * -1 + 1) * nd[1][i];
      }
      nit_validado = (11 - (add % 11)) % 11 == nd[2];
    } else {
      nit_validado = false;
    }

    if (nit_validado === false) {
      frappe.show_alert(
        {
          indicator: "orange",
          message: __(`
                NIT de <a href= '#Form/Customer/${cus_supp}'><b>${cus_supp}</b></a> no es valido en el pais de Guatemala,
                si no tiene disponible el NIT modifiquelo a C/F. Omita esta notificación si el identificador es de otro pais.
                `),
        },
        25
      );

      // frm.disable_save(); // Desactiva y Oculta el boton de guardar en Sales Invoice
    }
    // if (nit_validado === true) {
    //     frm.enable_save(); // Activa y Muestra el boton guardar de Sales Invoice
    // }
  }
}

/* ----------------------------------------------------------------------------------------------------------------- */
/** Verificacion para que exista un solo check */
frappe.ui.form.on("Item", {
  // Si se marca el check Es Combustible
  // NOTA: LAS LINEAS COMENTADAS SON CAMPOS DE DATOS QUE SE ELIMINARON
  setup: function (frm) {
    // Si cuando se carga el item (pagina) el check esta activo
    if (frm.doc.facelec_is_fuel) {
      // se muestra, la los campos para ingresas datos de impuestos sobre combustible
      // IMPORTANTE: ACTUALEMENTE SOLO CALCULAMOS EL ESCENARIO IDP
      cur_frm.toggle_display("taxable_unit_name", true);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", true);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", true);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", true);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", true);

      // Si no es combustible se ocultan sus campos relacionados
    } else {
      // Se ocultan los campos: para no confundir al usuario
      cur_frm.toggle_display("taxable_unit_name", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", false);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", false);
    }

    // Filtro para seleccionar solamente cuentas relacionadas con impuestos
    // frm.set_query('facelec_tax_rate_per_uom_purchase_account', () => {
    //   return {
    //     filters: {
    //       root_type: "Asset",
    //     }
    //   };
    // });
    // frm.set_query('facelec_tax_rate_per_uom_selling_account', () => {
    //   return {
    //     filters: {
    //       root_type: "Asset",
    //     }
    //   };
    // });
    // cur_frm.refresh_field('facelec_tax_rate_per_uom_purchase_account');
    // cur_frm.refresh_field('facelec_tax_rate_per_uom_selling_account');
  },
  facelec_is_fuel: function (frm, cdt, cdn) {
    if (frm.doc.facelec_is_fuel) {
      cur_frm.set_value("facelec_is_good", 0);
      cur_frm.set_value("facelec_is_service", 0);

      //     // Se oculta
      // cur_frm.toggle_display("frase_para_exportacion_section", false);
      // se muestra, la los campos para ingresas datos de impuestos sobre combustible
      // IMPORTANTE: ACTUALEMENTE SOLO CALCULAMOS EL ESCENARIO IDP
      cur_frm.toggle_display("taxable_unit_name", true);
      cur_frm.set_value(
        "facelec_fuel_note",
        "<b style='color: red'>IMPORTANTE: Recuerde configurar las cuentas de IDP venta e IDP compra, y cuenta de ingreso y gasto para el producto en la tabla hija de Predeterminados. De lo contrario en GL Ledger no cuadraran los montos.</b>"
      );
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", true);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", true);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", true);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", true);
    } else {
      // Se ocultan los campos: para no confundir al usuario
      cur_frm.toggle_display("taxable_unit_name", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", false);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", false);

      // Se resetean los valores de los campos de impuestos para no generar inconvenientes
      cur_frm.set_value("taxable_unit_name", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_uom_tax_included_in_price", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_selling_account", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_purchase_account", "");
    }
  },
  // Si se marca el check Es Bien
  facelec_is_good: function (frm, cdt, cdn) {
    if (frm.doc.facelec_is_good) {
      cur_frm.set_value("facelec_is_fuel", 0);
      cur_frm.set_value("facelec_is_service", 0);

      // Se ocultan los campos de impuestos para combustible: para no confundir al usuario
      cur_frm.toggle_display("taxable_unit_name", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", false);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", false);

      // Se resetean los valores de los campos de impuestos para no generar inconvenientes
      cur_frm.set_value("taxable_unit_name", "");
      cur_frm.set_value("tax_name", "");
      cur_frm.set_value("taxable_unit_code", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_uom_tax_included_in_price", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_selling_account", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_purchase_account", "");
    }
  },
  // Si se marca el check Es Servicio
  facelec_is_service: function (frm, cdt, cdn) {
    if (frm.doc.facelec_is_service) {
      cur_frm.set_value("facelec_is_fuel", 0);
      cur_frm.set_value("facelec_is_good", 0);

      // Se ocultan los campos de impuestos para combustible: para no confundir al usuario
      cur_frm.toggle_display("taxable_unit_name", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom", false);
      // cur_frm.toggle_display("facelec_uom_tax_included_in_price", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_selling_account", false);
      // cur_frm.toggle_display("facelec_tax_rate_per_uom_purchase_account", false);

      // Se resetean los valores de los campos de impuestos para no generar inconvenientes
      cur_frm.set_value("taxable_unit_name", "");
      cur_frm.set_value("tax_name", "");
      cur_frm.set_value("taxable_unit_code", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_uom_tax_included_in_price", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_selling_account", "");
      // cur_frm.set_value("facelec_tax_rate_per_uom_purchase_account", "");
    }
  },
});

// Tax ID is the one NIT input on Customer and Supplier; the FEL copy (nit_face_customer /
// facelec_nit_proveedor) follows it and stays hidden. Copying only when the copy differs
// keeps a freshly opened form from showing "Not Saved".
function fel_sync_nit(frm, copy_field) {
  const value = frm.doc.tax_id || "";
  if ((frm.doc[copy_field] || "") !== value) frm.set_value(copy_field, value);
}

function fel_party_setup(frm, copy_field) {
  frm.set_df_property("tax_id", "reqd", 1);
  frm.set_df_property(copy_field, "reqd", 0);
  frm.set_df_property(copy_field, "hidden", 1);
  if (!frm.doc.tax_id && frm.doc[copy_field]) {
    frm.doc.tax_id = frm.doc[copy_field]; // older records: adopt without dirtying
  }
}

/** Offer the name SAT has for the NIT / CUI (INFILE receiver service; not in Demo mode). */
function fel_sat_name_hint(frm, name_field) {
  const tax_id = (frm.doc.tax_id || "").trim();
  if (!tax_id || ["CF", "C/F"].includes(tax_id.toUpperCase())) return;
  frappe
    .call({
      method: "factura_electronica.buscar_nit.lookup_receiver",
      args: { tax_id: tax_id },
    })
    .then(({ message }) => {
      if (!message || !message.name || message.name === frm.doc[name_field]) return;
      const esc = frappe.utils.escape_html;
      frm.dashboard.set_headline_alert(
        __("Nombre registrado en SAT para {0}: {1}", [esc(tax_id), "<b>" + esc(message.name) + "</b>"]) +
          ` <a href="#" role="button" class="fel-use-sat-name">${__("Usar este nombre")}</a>`,
        "blue"
      );
      $(".fel-use-sat-name")
        .off("click")
        .on("click", (event) => {
          event.preventDefault();
          frm.set_value(name_field, message.name);
          frm.dashboard.clear_headline();
        });
    });
}

frappe.ui.form.on("Customer", {
  setup: function (frm) {
    fel_party_setup(frm, "nit_face_customer");
  },
  tax_id: function (frm) {
    fel_sync_nit(frm, "nit_face_customer");
    fel_sat_name_hint(frm, "customer_name");
  },
  refresh: function (frm) {
    frm.set_df_property(
      "customer_name",
      "description",
      __("Nombre legal, como está registrado en SAT.")
    );
  },
});

frappe.ui.form.on("Supplier", {
  setup: function (frm) {
    fel_party_setup(frm, "facelec_nit_proveedor");
  },
  tax_id: function (frm) {
    fel_sync_nit(frm, "facelec_nit_proveedor");
    fel_sat_name_hint(frm, "supplier_name");
  },
  refresh: function (frm) {
    frm.set_df_property(
      "supplier_name",
      "description",
      __("Nombre legal, como está registrado en SAT.")
    );
  },
});

frappe.ui.form.on("Company", {
  tax_id: function (frm) {
    fel_sync_nit(frm, "nit_face_company");
  },
  setup: function (frm) {
    frm.set_df_property("nit_face_company", "hidden", 1);
    frm.set_query("isr_account_payable", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("isr_account_receivable", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("iva_account_payable", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("vat_account_receivable", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("vat_retention_to_compensate", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("vat_retention_payable", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    frm.set_query("income_tax_retention_payable_account", "tax_witholding_ranges", () => {
      return {
        filters: {
          company: frm.doc.name,
          is_group: 0,
        },
      };
    });

    cur_frm.refresh_field("report_list");
  },
});
/* en-US: INDIVIDUAL SOURCE CODE FROM .js FILES IN THIS DIRECTORY WILL BE ADDED WHEN DOING A BENCH BUILD
   es-GT: CODIGO FUENTE INDIVIDUAL DE ARCHIVOS .js EN ESTE DIRECTORIO SE AGREGARAN ABAJO AL HACER BENCH BUILD */

// ================================================================================================================ //

// en: Address field descriptions in spanish
// es-GT: descripciones campos de direcciones en español
frappe.ui.form.on("Address", {
  refresh: function (frm) {
    frm.set_df_property("address_line1", "description", __("<b>* FEL: Direccion Comercial 1</b>"));
    frm.set_df_property("city", "description", __("<b>FEL: Ciudad</b>  p. ej.: Antigua Guatemala"));
    frm.set_df_property("state", "description", __("<b>FEL: Departamento</b>  p. ej.: Sacatepéquez"));
    frm.set_df_property("county", "description", __("<b>FEL: Municipio</b>  p. ej.: Antigua Guatemala"));
    frm.set_df_property("county", "reqd", 1);
    frm.set_df_property("country", "description", __("<b>FEL: Pais</b>  p. ej: Guatemala"));
    frm.set_df_property("email_id", "description", __("<b>FEL: Correo Electronico</b>  p. ej: micorreo@hola.com"));
    frm.set_df_property("email_id", "reqd", 1);
    frm.set_df_property("phone", "description", __("<b>Teléfono:</b>  p. ej: +502 2333-2516"));
    frm.set_df_property("pincode", "description", __("<b>FEL: Código Postal</b>  p. ej.: 03001"));
    frm.set_df_property("is_primary_address", "description", __("<b>FEL: Dirección para facturar</b>"));
  },
});

frappe.ui.form.on("Expense Claim Detail", {
  reference: function (frm, cdt, cdn) {
    /** Al campo amount le asigna el valor de grand total obtenido de la factura seleccionada */
    let row = frappe.get_doc(cdt, cdn);
    if (row.reference) {
      row.amount = row.grand_total;
      frm.refresh();
    } else {
      row.amount = "";
      frm.refresh();
    }
  },
});

// ================================================================================================================ //
// Personalizador de quick entry en customer, para crear Dirección de una forma mas accesible
frappe.provide("frappe.ui.form");
