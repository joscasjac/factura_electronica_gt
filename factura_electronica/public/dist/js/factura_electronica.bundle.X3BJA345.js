(() => {
  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/facelec.js
  console.log("Se cargo exitosamente la aplicaci\xF3n de Factura Electr\xF3nica");
  function valNit(nit, cus_supp, frm) {
    var nit_validado;
    if (nit === "C/F" || nit === "c/f") {
      frm.enable_save();
    } else {
      var nd, add = 0;
      if (nd = /^(\d+)\-?([\dk])$/i.exec(nit)) {
        nd[2] = nd[2].toLowerCase() == "k" ? 10 : parseInt(nd[2]);
        for (var i = 0; i < nd[1].length; i++) {
          add += ((i - nd[1].length) * -1 + 1) * nd[1][i];
        }
        nit_validado = (11 - add % 11) % 11 == nd[2];
      } else {
        nit_validado = false;
      }
      if (nit_validado === false) {
        frappe.show_alert(
          {
            indicator: "orange",
            message: __(`
                NIT de <a href= '#Form/Customer/${cus_supp}'><b>${cus_supp}</b></a> no es valido en el pais de Guatemala,
                si no tiene disponible el NIT modifiquelo a C/F. Omita esta notificaci\xF3n si el identificador es de otro pais.
                `)
          },
          25
        );
      }
    }
  }
  frappe.ui.form.on("Item", {
    setup: function(frm) {
      if (frm.doc.facelec_is_fuel) {
        cur_frm.toggle_display("taxable_unit_name", true);
      } else {
        cur_frm.toggle_display("taxable_unit_name", false);
      }
    },
    facelec_is_fuel: function(frm, cdt, cdn) {
      if (frm.doc.facelec_is_fuel) {
        cur_frm.set_value("facelec_is_good", 0);
        cur_frm.set_value("facelec_is_service", 0);
        cur_frm.toggle_display("taxable_unit_name", true);
        cur_frm.set_value(
          "facelec_fuel_note",
          "<b style='color: red'>IMPORTANTE: Recuerde configurar las cuentas de IDP venta e IDP compra, y cuenta de ingreso y gasto para el producto en la tabla hija de Predeterminados. De lo contrario en GL Ledger no cuadraran los montos.</b>"
        );
      } else {
        cur_frm.toggle_display("taxable_unit_name", false);
        cur_frm.set_value("taxable_unit_name", "");
      }
    },
    facelec_is_good: function(frm, cdt, cdn) {
      if (frm.doc.facelec_is_good) {
        cur_frm.set_value("facelec_is_fuel", 0);
        cur_frm.set_value("facelec_is_service", 0);
        cur_frm.toggle_display("taxable_unit_name", false);
        cur_frm.set_value("taxable_unit_name", "");
        cur_frm.set_value("tax_name", "");
        cur_frm.set_value("taxable_unit_code", "");
      }
    },
    facelec_is_service: function(frm, cdt, cdn) {
      if (frm.doc.facelec_is_service) {
        cur_frm.set_value("facelec_is_fuel", 0);
        cur_frm.set_value("facelec_is_good", 0);
        cur_frm.toggle_display("taxable_unit_name", false);
        cur_frm.set_value("taxable_unit_name", "");
        cur_frm.set_value("tax_name", "");
        cur_frm.set_value("taxable_unit_code", "");
      }
    }
  });
  function fel_sync_nit(frm, copy_field) {
    const value = frm.doc.tax_id || "";
    if ((frm.doc[copy_field] || "") !== value)
      frm.set_value(copy_field, value);
  }
  function fel_party_setup(frm, copy_field) {
    frm.set_df_property("tax_id", "reqd", 1);
    frm.set_df_property(copy_field, "reqd", 0);
    frm.set_df_property(copy_field, "hidden", 1);
    if (!frm.doc.tax_id && frm.doc[copy_field]) {
      frm.doc.tax_id = frm.doc[copy_field];
    }
  }
  function fel_sat_name_hint(frm, name_field) {
    const tax_id = (frm.doc.tax_id || "").trim();
    if (!tax_id || ["CF", "C/F"].includes(tax_id.toUpperCase()))
      return;
    frappe.call({
      method: "factura_electronica.buscar_nit.lookup_receiver",
      args: { tax_id }
    }).then(({ message }) => {
      if (!message || !message.name || message.name === frm.doc[name_field])
        return;
      const esc = frappe.utils.escape_html;
      frm.dashboard.set_headline_alert(
        __("Nombre registrado en SAT para {0}: {1}", [esc(tax_id), "<b>" + esc(message.name) + "</b>"]) + ` <a href="#" role="button" class="fel-use-sat-name">${__("Usar este nombre")}</a>`,
        "blue"
      );
      $(".fel-use-sat-name").off("click").on("click", (event) => {
        event.preventDefault();
        frm.set_value(name_field, message.name);
        frm.dashboard.clear_headline();
      });
    });
  }
  frappe.ui.form.on("Customer", {
    setup: function(frm) {
      fel_party_setup(frm, "nit_face_customer");
    },
    tax_id: function(frm) {
      fel_sync_nit(frm, "nit_face_customer");
      fel_sat_name_hint(frm, "customer_name");
    },
    refresh: function(frm) {
      frm.set_df_property(
        "customer_name",
        "description",
        __("Nombre legal, como est\xE1 registrado en SAT.")
      );
    }
  });
  frappe.ui.form.on("Supplier", {
    setup: function(frm) {
      fel_party_setup(frm, "facelec_nit_proveedor");
    },
    tax_id: function(frm) {
      fel_sync_nit(frm, "facelec_nit_proveedor");
      fel_sat_name_hint(frm, "supplier_name");
    },
    refresh: function(frm) {
      frm.set_df_property(
        "supplier_name",
        "description",
        __("Nombre legal, como est\xE1 registrado en SAT.")
      );
    }
  });
  frappe.ui.form.on("Company", {
    tax_id: function(frm) {
      fel_sync_nit(frm, "nit_face_company");
    },
    setup: function(frm) {
      frm.set_df_property("nit_face_company", "hidden", 1);
      frm.set_query("isr_account_payable", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("isr_account_receivable", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("iva_account_payable", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("vat_account_receivable", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("vat_retention_to_compensate", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("vat_retention_payable", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      frm.set_query("income_tax_retention_payable_account", "tax_witholding_ranges", () => {
        return {
          filters: {
            company: frm.doc.name,
            is_group: 0
          }
        };
      });
      cur_frm.refresh_field("report_list");
    }
  });
  frappe.ui.form.on("Address", {
    refresh: function(frm) {
      frm.set_df_property("address_line1", "description", __("<b>* FEL: Direccion Comercial 1</b>"));
      frm.set_df_property("city", "description", __("<b>FEL: Ciudad</b>  p. ej.: Antigua Guatemala"));
      frm.set_df_property("state", "description", __("<b>FEL: Departamento</b>  p. ej.: Sacatep\xE9quez"));
      frm.set_df_property("county", "description", __("<b>FEL: Municipio</b>  p. ej.: Antigua Guatemala"));
      frm.set_df_property("county", "reqd", 1);
      frm.set_df_property("country", "description", __("<b>FEL: Pais</b>  p. ej: Guatemala"));
      frm.set_df_property("email_id", "description", __("<b>FEL: Correo Electronico</b>  p. ej: micorreo@hola.com"));
      frm.set_df_property("email_id", "reqd", 1);
      frm.set_df_property("phone", "description", __("<b>Tel\xE9fono:</b>  p. ej: +502 2333-2516"));
      frm.set_df_property("pincode", "description", __("<b>FEL: C\xF3digo Postal</b>  p. ej.: 03001"));
      frm.set_df_property("is_primary_address", "description", __("<b>FEL: Direcci\xF3n para facturar</b>"));
    }
  });
  frappe.ui.form.on("Expense Claim Detail", {
    reference: function(frm, cdt, cdn) {
      let row = frappe.get_doc(cdt, cdn);
      if (row.reference) {
        row.amount = row.grand_total;
        frm.refresh();
      } else {
        row.amount = "";
        frm.refresh();
      }
    }
  });
  frappe.provide("frappe.ui.form");

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/goalSeek.js
  function goalSeek(oParams) {
    var g, Y, Y1, OldTarget;
    oParams.Tol = oParams.Tol || 1e-3 * oParams.Goal || 0.1;
    oParams.maxIter = oParams.maxIter || 1e3;
    if (oParams.oFuncArgTarget.propStr) {
      if (!oParams.aFuncParams[oParams.oFuncArgTarget.Position][oParams.oFuncArgTarget.propStr]) {
        for (var i = 0; i < 100; i++) {
          var iGuess = Math.random();
          setObjVal(oParams.aFuncParams[oParams.oFuncArgTarget.Position], oParams.oFuncArgTarget.propStr, iGuess);
          if (oParams.Func.apply(oParams.This, oParams.aFuncParams)) {
            break;
          }
          if (i === 99) {
            return null;
          }
        }
      }
      for (var i = 0; i < oParams.maxIter; i++) {
        Y = oParams.Func.apply(oParams.This, oParams.aFuncParams) - oParams.Goal;
        if (Math.abs(Y) <= oParams.Tol) {
          return getObjVal(oParams.aFuncParams[oParams.oFuncArgTarget.Position], oParams.oFuncArgTarget.propStr);
        } else {
          OldTarget = getObjVal(oParams.aFuncParams[oParams.oFuncArgTarget.Position], oParams.oFuncArgTarget.propStr);
          setObjVal(oParams.aFuncParams[oParams.oFuncArgTarget.Position], oParams.oFuncArgTarget.propStr, OldTarget + Y);
          Y1 = oParams.Func.apply(oParams.This, oParams.aFuncParams) - oParams.Goal;
          g = (Y1 - Y) / Y;
          if (g === 0) {
            g = 1e-4;
          }
          setObjVal(oParams.aFuncParams[oParams.oFuncArgTarget.Position], oParams.oFuncArgTarget.propStr, OldTarget - Y / g);
        }
      }
      if (Math.abs(Y) > oParams.Tol) {
        return null;
      }
    } else {
      if (!oParams.aFuncParams[oParams.oFuncArgTarget.Position]) {
        for (var i = 0; i < 100; i++) {
          var iGuess = Math.random();
          oParams.aFuncParams[oParams.oFuncArgTarget.Position] = iGuess;
          if (oParams.Func.apply(oParams.This, oParams.aFuncParams)) {
            break;
          }
          if (i === 99) {
            return null;
          }
        }
      }
      for (var i = 0; i < oParams.maxIter; i++) {
        Y = oParams.Func.apply(oParams.This, oParams.aFuncParams) - oParams.Goal;
        if (Math.abs(Y) <= oParams.Tol) {
          return oParams.aFuncParams[oParams.oFuncArgTarget.Position];
        } else {
          OldTarget = oParams.aFuncParams[oParams.oFuncArgTarget.Position];
          oParams.aFuncParams[oParams.oFuncArgTarget.Position] = OldTarget + Y;
          Y1 = oParams.Func.apply(oParams.This, oParams.aFuncParams) - oParams.Goal;
          g = (Y1 - Y) / Y;
          if (g === 0) {
            g = 1e-4;
          }
          oParams.aFuncParams[oParams.oFuncArgTarget.Position] = OldTarget - Y / g;
        }
      }
      if (Math.abs(Y) > oParams.Tol) {
        return null;
      }
    }
  }
  function setObjVal(Obj, propStr, Value) {
    var Schema = Obj;
    var pList = propStr.split(".");
    var Len = pList.length;
    for (var i = 0; i < Len - 1; i++) {
      var Elem = pList[i];
      if (!Schema[Elem])
        Schema[Elem] = {};
      Schema = Schema[Elem];
    }
    Schema[pList[Len - 1]] = Value;
  }
  function getObjVal(Obj, propStr) {
    var Parts = propStr.split(".");
    var Cur = Obj;
    for (var i = 0; i < Parts.length; i++) {
      Cur = Cur[Parts[i]];
    }
    return Cur;
  }

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/sales_invoice.js
  function generar_tabla_html(frm) {
    if (frm.doc.items.length > 0) {
      const mi_array = frm.doc.items;
      const mi_array_dos = Array.from(mi_array);
      frappe.call({
        method: "factura_electronica.api.generar_tabla_html",
        args: {
          tabla: JSON.stringify(mi_array_dos),
          currency: frm.doc.currency
        },
        callback: function(data) {
          frm.set_value("other_tax_facelec", data.message);
          frm.refresh_field("other_tax_facelec");
        }
      });
    }
  }
  function sales_invoice_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.sales_invoice_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      callback: () => frm.reload_doc()
    });
  }
  function special_tax(frm) {
    let cuentas_registradas = {};
    let otrosimpuestos = frm.doc.shs_otros_impuestos || [];
    otrosimpuestos.forEach((tax_row, index) => {
      if (tax_row.account_head) {
        cuentas_registradas[tax_row.account_head] = tax_row.total;
      }
    });
    if (Object.keys(cuentas_registradas).length > 0) {
      frappe.call({
        method: "factura_electronica.utils.special_tax.add_gl_entry_other_special_tax",
        args: {
          invoice_name: frm.doc.name,
          accounts: cuentas_registradas,
          invoice_type: "Sales Invoice",
          is_return: frm.doc.is_return
        },
        callback: function() {
          frm.reload_doc();
        }
      });
    }
    frm.refresh_field("access_number_fel");
    frm.reload_doc();
  }
  function btn_journal_entry_retention_dialog(frm) {
    {
      let d = new frappe.ui.Dialog({
        title: __("Cobro con retenci\xF3n ISR / IVA"),
        fields: [
          {
            label: __("Centro de costo"),
            fieldname: "cost_center",
            fieldtype: "Link",
            options: "Cost Center",
            get_query: function() {
              return {
                filters: {
                  company: frm.doc.company
                }
              };
            },
            default: ""
          },
          {
            label: __("Cuenta de cobro (banco o caja)"),
            fieldname: "debit_in_acc_currency",
            fieldtype: "Link",
            options: "Account",
            reqd: 1,
            get_query: function() {
              return {
                filters: {
                  company: frm.doc.company
                }
              };
            }
          },
          {
            fieldname: "col_br_asdffg",
            fieldtype: "Column Break"
          },
          {
            label: __("Multimoneda"),
            fieldname: "is_multicurrency",
            fieldtype: "Check"
          },
          {
            label: __("El cliente retiene IVA"),
            fieldname: "is_iva_withholding",
            fieldtype: "Check"
          },
          {
            label: __("Porcentaje de IVA retenido"),
            fieldname: "iva_retention_rate",
            fieldtype: "Percent",
            default: 15,
            depends_on: "eval:doc.is_iva_withholding"
          },
          {
            label: __("El cliente retiene ISR"),
            fieldname: "is_isr_withholding",
            fieldtype: "Check"
          },
          {
            label: __("Nota"),
            fieldname: "note",
            fieldtype: "Data",
            read_only: 1,
            default: __("Usa los rangos de retenci\xF3n de la empresa; el IVA debe venir incluido en la factura.")
          },
          {
            label: __("Descripci\xF3n"),
            fieldname: "section_asdads",
            fieldtype: "Section Break",
            collapsible: 1
          },
          {
            label: __("Descripci\xF3n"),
            fieldname: "description",
            fieldtype: "Long Text"
          }
        ],
        primary_action_label: __("Crear partida"),
        primary_action(values) {
          frappe.call({
            method: "factura_electronica.api_erp.journal_entry_isr",
            args: {
              invoice_name: frm.doc.name,
              debit_in_acc_currency: values.debit_in_acc_currency,
              cost_center: values.cost_center,
              is_isr_ret: parseInt(values.is_isr_withholding),
              is_iva_ret: parseInt(values.is_iva_withholding),
              is_multicurrency: parseInt(values.is_multicurrency),
              description: values.description,
              iva_retention_rate: values.iva_retention_rate
            },
            callback: function(r) {
              d.hide();
              frm.refresh();
            }
          });
        }
      });
      d.show();
    }
  }
  function open_fel_pdf(uuid, frm) {
    frappe.call("factura_electronica.fel.print_support.get_fel_pdf_url", {
      uuid,
      doctype: frm.doc.doctype,
      docname: frm.doc.name
    }).then((r) => {
      if (r.message)
        window.open(r.message);
    });
  }
  function sat_access_number(record_name) {
    if (!record_name)
      return "";
    const sequence = parseInt(String(record_name).split("-").pop(), 10);
    if (isNaN(sequence))
      return record_name;
    return String(sequence >= 1e8 ? sequence : 1e8 + sequence);
  }
  function suggest_exchange_invoice(frm) {
    if (frm.doc.docstatus !== 0 || !frm.doc.company || !frm.doc.naming_series)
      return;
    frappe.call("factura_electronica.fel.print_support.suggest_exchange_series", {
      company: frm.doc.company,
      naming_series: frm.doc.naming_series,
      posting_date: frm.doc.posting_date,
      due_date: frm.doc.due_date
    }).then((r) => {
      if (!r.message)
        return;
      frm.dashboard.clear_headline();
      frm.dashboard.set_headline_alert(
        __("Venta al cr\xE9dito: puede emitirla como Factura Cambiaria (serie {0}).", [r.message]) + ` <a href="#" role="button" class="fel-use-fcam" data-series="${frappe.utils.escape_html(r.message)}">${__("Usar serie {0}", [
          r.message
        ])}</a>`,
        "blue"
      );
    });
  }
  $(document).on("click", ".fel-use-fcam", function(event) {
    event.preventDefault();
    const frm = cur_frm;
    const series = $(this).attr("data-series");
    if (!frm || !series)
      return;
    frm.dashboard.clear_headline();
    if (frm.is_new()) {
      frm.set_value("naming_series", series);
      return;
    }
    frappe.call("factura_electronica.fel.print_support.use_exchange_series", { invoice: frm.doc.name, series }).then(() => {
      frm.reload_doc();
      frappe.show_alert({ message: __("Serie cambiada a {0}.", [series]), indicator: "green" });
    });
  });
  function dependency_validator(frm) {
    let taxes = frm.doc.taxes || [];
    if (!taxes.length > 0) {
      frappe.show_alert(
        {
          message: __("Falta la plantilla de impuestos: agr\xE9guela para que el IVA se calcule bien."),
          indicator: "orange"
        },
        8
      );
    }
  }
  frappe.ui.form.on("Sales Invoice", {
    setup(frm) {
      if (frm.doc.docstatus == 0) {
        frappe.call("factura_electronica.utils.utilities_facelec.get_rounding_config").then(({ message }) => {
          frm.set_value("disable_rounded_total", message);
          frm.refresh_field("disable_rounded_total");
        });
      }
    },
    onload_post_render: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      if (frm.doc.docstatus === 0)
        sales_invoice_calc(frm);
    },
    refresh: function(frm, cdt, cdn) {
      fel_refresh(frm);
      if (frm.doc.docstatus === 0)
        suggest_exchange_invoice(frm);
    },
    due_date: function(frm) {
      suggest_exchange_invoice(frm);
    },
    payment_terms_template: function(frm) {
      suggest_exchange_invoice(frm);
    },
    validate: function(frm, cdt, cdn) {
      dependency_validator(frm);
      generar_tabla_html(frm);
    },
    discount_amount: function(frm, cdt, cdn) {
    },
    before_save: function(frm, cdt, cdn) {
    },
    on_submit: function(frm, cdt, cdn) {
      if (frm.__fel && frm.__fel.certify_on_submit) {
        fel_after_server_step(frm);
      } else {
        special_tax(frm);
      }
    },
    after_cancel: function(frm) {
      if (frm.__fel && frm.__fel.annul_on_cancel)
        fel_after_server_step(frm);
    },
    naming_series: function(frm, cdt, cdn) {
      if (frm.doc.naming_series) {
        frappe.call({
          method: "factura_electronica.api.obtener_numero_resolucion",
          args: {
            nombre_serie: frm.doc.naming_series
          },
          callback: function(numero_resolucion) {
            if (numero_resolucion.message === void 0) {
            } else {
              cur_frm.set_value("shs_numero_resolucion", numero_resolucion.message);
            }
          }
        });
      }
    }
  });
  function funct_eval(a, b) {
    return a * b;
  }
  frappe.ui.form.on("Sales Invoice Item", {
    shs_amount_for_back_calc: function(frm, cdt, cdn) {
      let row = frappe.get_doc(cdt, cdn);
      let a = row.rate;
      let b = row.qty;
      let c = row.amount;
      let calcu = goalSeek({
        Func: funct_eval,
        aFuncParams: [b, a],
        oFuncArgTarget: {
          Position: 0
        },
        Goal: row.shs_amount_for_back_calc,
        Tol: 1e-3,
        maxIter: 1e4
      });
      row.qty = calcu;
      row.stock_qty = calcu;
      row.amount = calcu * a;
      frm.refresh_field("items");
    }
  });
  var FEL_GROUP = __("FEL");
  function fel_call(method, args) {
    return frappe.call({ method: "factura_electronica.fel.auto." + method, args }).then((r) => r.message);
  }
  function fel_money(ctx) {
    return format_currency(ctx.total, ctx.currency);
  }
  function fel_datetime(value) {
    if (!value)
      return "";
    const text = String(value).replace("T", " ").slice(0, 16);
    return frappe.datetime.str_to_user(text);
  }
  function fel_headline(frm, ctx) {
    frm.dashboard.clear_headline();
    if (!ctx || !ctx.fel)
      return;
    const esc = frappe.utils.escape_html;
    const demo = ctx.mode === "Demo";
    let text, color;
    if (ctx.anulada) {
      text = __("{0} anulada en SAT.", [esc(ctx.label)]);
      color = "gray";
    } else if (ctx.cancelled) {
      text = __("Cancelada en ERPNext pero vigente en SAT: an\xFAlela con FEL \u203A Anular en SAT.");
      color = "red";
    } else if (ctx.certified) {
      text = __("{0} certificada \xB7 Serie {1} N\xFAmero {2} \xB7 {3}", [
        esc(ctx.label),
        esc(ctx.serie || ""),
        esc(ctx.numero || ""),
        esc(fel_datetime(ctx.fecha))
      ]);
      if (ctx.original)
        text += " \xB7 " + __("n\xFAmero interno {0}", [esc(ctx.original)]);
      color = "green";
    } else if (ctx.contingency) {
      text = __("Emitida en contingencia (n\xFAmero de acceso {0}). Se reintenta certificar cada hora.", [
        esc(sat_access_number(frm.doc.access_number_fel))
      ]);
      color = "orange";
    } else if (frm.doc.docstatus === 1) {
      text = __("{0} pendiente de certificar en SAT.", [esc(ctx.label)]);
      color = "orange";
    } else {
      return;
    }
    if (demo && !ctx.anulada) {
      text += " " + __("Modo Demo: no se envi\xF3 a SAT y no tiene validez fiscal.");
      color = color === "green" ? "orange" : color;
    }
    frm.dashboard.set_headline_alert(text, color);
  }
  function fel_actions(frm, ctx) {
    if (!ctx || !ctx.fel)
      return;
    const certified = ctx.certified && !ctx.anulada;
    if (frm.doc.docstatus === 1 && !ctx.certified) {
      const label = ctx.contingency ? __("Reintentar certificaci\xF3n") : __("Certificar en SAT");
      frm.add_custom_button(label, () => fel_certify(frm)).addClass("btn-primary");
    }
    if (ctx.certified) {
      frm.add_custom_button(__("PDF del documento"), () => open_fel_pdf(ctx.uuid, frm), FEL_GROUP);
    }
    if (frm.doc.docstatus === 1 && certified && !frm.doc.is_return && !frm.doc.is_debit_note) {
      frm.add_custom_button(__("Nota de d\xE9bito"), () => fel_make_note(frm, "debit"), FEL_GROUP);
      if (frm.doc.outstanding_amount > 0) {
        frm.add_custom_button(__("Cobro con retenci\xF3n ISR / IVA"), () => btn_journal_entry_retention_dialog(frm), FEL_GROUP);
      }
    }
    if (ctx.cancelled && !ctx.anulada) {
      frm.add_custom_button(__("Anular en SAT"), () => fel_annul_dialog(frm, ctx), FEL_GROUP);
    }
  }
  function fel_certify(frm) {
    frappe.dom.freeze(__("Certificando en SAT\u2026"));
    fel_call("certify_invoice", { invoice: frm.doc.name }).then((result) => fel_after_certify(frm, result)).finally(() => frappe.dom.unfreeze());
  }
  function fel_after_certify(frm, result) {
    if (!result)
      return;
    if (result.ok) {
      frappe.show_alert({ message: result.message || __("Certificada en SAT"), indicator: "green" });
      if (result.name && result.name !== frm.doc.name) {
        frappe.set_route("Form", "Sales Invoice", result.name);
      } else {
        frm.reload_doc();
      }
      return;
    }
    frappe.msgprint({
      title: result.contingency ? __("Factura en contingencia") : __("No se pudo certificar"),
      indicator: result.contingency ? "orange" : "red",
      message: frappe.utils.escape_html(result.message || "")
    });
    frm.reload_doc();
  }
  function fel_make_note(frm, kind) {
    if (kind === "credit") {
      frappe.model.open_mapped_doc({
        method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
        frm
      });
      return;
    }
    frappe.new_doc("Sales Invoice", {
      company: frm.doc.company,
      customer: frm.doc.customer,
      currency: frm.doc.currency,
      is_debit_note: 1,
      return_against: frm.doc.name
    });
  }
  function fel_submit_dialog(frm, ctx) {
    return new Promise((resolve) => {
      const esc = frappe.utils.escape_html;
      const rows = [
        [__("Documento"), esc(ctx.label)],
        [__("Receptor"), esc(ctx.receptor || "") + " \xB7 NIT " + esc(ctx.nit || "CF")],
        [__("Total"), esc(fel_money(ctx))]
      ];
      const fields = [
        {
          fieldtype: "HTML",
          fieldname: "summary",
          options: `<table class="table table-bordered table-sm" style="margin-bottom:8px">` + rows.map((r) => `<tr><th style="width:30%">${r[0]}</th><td>${r[1]}</td></tr>`).join("") + `</table>` + (ctx.mode === "Demo" ? `<p class="text-warning">${__(
            "Modo Demo: se valida contra los esquemas de SAT pero no se env\xEDa; no tiene validez fiscal."
          )}</p>` : `<p class="text-muted">${__(
            "Al validar se env\xEDa a SAT. Solo se puede revertir anul\xE1ndola en SAT."
          )}</p>`)
        }
      ];
      if (ctx.needs_reason) {
        fields.push({
          fieldtype: "Data",
          fieldname: "reason",
          label: __("Motivo del ajuste"),
          reqd: 1,
          default: frm.doc.fel_motivo_ajuste || "",
          description: __("Aparece en el documento que recibe el cliente.")
        });
      }
      let done = false;
      const d = new frappe.ui.Dialog({
        title: ctx.mode === "Demo" ? __("Validar (modo Demo)") : __("Validar y certificar en SAT"),
        fields,
        primary_action_label: __("Validar y certificar"),
        primary_action(values) {
          done = true;
          d.hide();
          resolve(values);
        },
        secondary_action_label: __("Volver"),
        secondary_action() {
          d.hide();
        },
        on_hide() {
          if (!done)
            resolve(null);
        }
      });
      d.show();
    });
  }
  function fel_cancel_dialog(frm, ctx, title) {
    return new Promise((resolve) => {
      let done = false;
      const d = new frappe.ui.Dialog({
        title: title || __("Cancelar y anular en SAT"),
        fields: [
          {
            fieldtype: "HTML",
            fieldname: "note",
            options: `<p>${__("La {0} {1} se anular\xE1 en SAT con este motivo. No se puede deshacer.", [
              frappe.utils.escape_html(ctx.label),
              frappe.utils.escape_html((ctx.serie || "") + " " + (ctx.numero || ""))
            ])}</p>`
          },
          { fieldtype: "Data", fieldname: "reason", label: __("Motivo de anulaci\xF3n"), reqd: 1 }
        ],
        primary_action_label: __("Anular"),
        primary_action(values) {
          done = true;
          d.hide();
          resolve(values);
        },
        secondary_action_label: __("Volver"),
        secondary_action() {
          d.hide();
        },
        on_hide() {
          if (!done)
            resolve(null);
        }
      });
      d.show();
    });
  }
  function fel_annul_dialog(frm, ctx) {
    fel_cancel_dialog(frm, ctx, __("Anular en SAT")).then((values) => {
      if (!values)
        return;
      frappe.dom.freeze(__("Anulando en SAT\u2026"));
      fel_call("annul_invoice", { invoice: frm.doc.name, reason: values.reason }).then((r) => {
        frappe.show_alert({ message: r.message, indicator: r.ok ? "green" : "red" });
        frm.reload_doc();
      }).finally(() => frappe.dom.unfreeze());
    });
  }
  function fel_without_confirm(fn) {
    const original = frappe.confirm;
    const restore = () => {
      if (frappe.confirm === bypass)
        frappe.confirm = original;
    };
    const bypass = function(message, yes) {
      frappe.confirm = original;
      yes && yes();
    };
    frappe.confirm = bypass;
    setTimeout(restore, 15e3);
    try {
      return fn();
    } catch (e) {
      restore();
      throw e;
    }
  }
  function fel_install_overrides(frm) {
    if (frm.__fel_overrides)
      return;
    frm.__fel_overrides = true;
    const original_submit = frm.savesubmit.bind(frm);
    const original_cancel = frm.savecancel.bind(frm);
    frm.savesubmit = function(btn, callback, on_error) {
      const ctx = frm.__fel;
      if (!ctx || !ctx.fel || !ctx.certify_on_submit)
        return original_submit(btn, callback, on_error);
      return fel_submit_dialog(frm, ctx).then((values) => {
        if (!values)
          return;
        if (values.reason)
          frm.doc.fel_motivo_ajuste = values.reason;
        return fel_without_confirm(() => original_submit(btn, callback, on_error));
      });
    };
    frm.savecancel = function(btn, callback, on_error) {
      const ctx = frm.__fel;
      if (!ctx || !ctx.certified || ctx.anulada || !ctx.annul_on_cancel)
        return original_cancel(btn, callback, on_error);
      return fel_cancel_dialog(frm, ctx).then((values) => {
        if (!values)
          return;
        return fel_call("set_cancel_reason", { invoice: frm.doc.name, reason: values.reason }).then(
          () => fel_without_confirm(() => original_cancel(btn, callback, on_error))
        );
      });
    };
  }
  function fel_after_server_step(frm) {
    fel_call("submit_result", { invoice: frm.doc.name }).then((result) => {
      if (result)
        fel_after_certify(frm, result);
    });
  }
  function fel_refresh(frm) {
    if (frm.is_new())
      return;
    fel_call("form_context", { invoice: frm.doc.name }).then((ctx) => {
      frm.__fel = ctx;
      if (!ctx || !ctx.fel)
        return;
      fel_install_overrides(frm);
      fel_headline(frm, ctx);
      fel_actions(frm, ctx);
    });
  }

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/pos_invoice.js
  function generar_tabla_html2(frm) {
    if (frm.doc.items.length > 0) {
      const mi_array = frm.doc.items;
      const mi_array_dos = Array.from(mi_array);
      frappe.call({
        method: "factura_electronica.api.generar_tabla_html",
        args: {
          tabla: JSON.stringify(mi_array_dos),
          currency: frm.doc.currency
        },
        callback: function(data) {
          frm.set_value("other_tax_facelec", data.message);
          frm.refresh_field("other_tax_facelec");
        }
      });
    }
  }
  function sales_invoice_calc2(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.sales_invoice_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \xF0\u0178\u201C\u201E\xF0\u0178\u201C\u201E\xF0\u0178\u201C\u201E",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("POS Invoice Calculated Error");
      }
    });
    frm.reload_doc();
  }
  function btn_generator(frm) {
    frappe.call({
      method: "factura_electronica.pos_fel_api.is_valid_to_fel",
      args: {
        doctype: frm.doc.doctype,
        docname: frm.doc.name
      },
      callback: function(r) {
        if (r.message[1] === "anulador" && r.message[2]) {
          frappe.call("factura_electronica.api.btn_activator", {
            electronic_doc: "anulador_de_facturas_ventas_fel"
          }).then((r2) => {
            if (r2.message) {
              frappe.call("factura_electronica.api.invoice_exists", {
                uuid: frm.doc.numero_autorizacion_fel
              }).then((r3) => {
                if (r3.message) {
                  cur_frm.clear_custom_buttons();
                  pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
                } else {
                  btn_canceller(frm);
                  pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
                }
              });
            }
          });
        }
        if (r.message[0] === "FACT" && r.message[2]) {
          generar_boton_factura(__("Factura Electr\xC3\xB3nica FEL"), frm);
          if (frm.doc.numero_autorizacion_fel) {
            cur_frm.clear_custom_buttons();
            pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
          }
        }
      }
    });
  }
  function special_tax2(frm) {
    let cuentas_registradas = {};
    let otrosimpuestos = frm.doc.shs_otros_impuestos || [];
    otrosimpuestos.forEach((tax_row, index) => {
      if (tax_row.account_head) {
        cuentas_registradas[tax_row.account_head] = tax_row.total;
      }
    });
    if (Object.keys(cuentas_registradas).length > 0) {
      frappe.call({
        method: "factura_electronica.utils.special_tax.add_gl_entry_other_special_tax",
        args: {
          invoice_name: frm.doc.name,
          accounts: cuentas_registradas,
          invoice_type: "POS Invoice",
          is_return: frm.doc.is_return
        },
        callback: function() {
          frm.reload_doc();
        }
      });
    }
    frm.refresh_field("access_number_fel");
    frm.reload_doc();
  }
  function btn_canceller(frm) {
    cur_frm.clear_custom_buttons();
    frm.add_custom_button(__("Electronic Document Canceller"), function() {
      frappe.confirm(
        __("Are you sure to cancel the current electronic document?"),
        () => {
          let d = new frappe.ui.Dialog({
            title: __("Electronic Document Canceller"),
            fields: [
              {
                label: __("Reason for cancellation?"),
                fieldname: "reason_cancelation",
                fieldtype: "Data",
                reqd: 1
              }
            ],
            primary_action_label: __("Submit"),
            primary_action(values) {
              frappe.call({
                method: "factura_electronica.pos_fel_api.invoice_canceller",
                args: {
                  invoice_name: frm.doc.name,
                  reason_cancelation: values.reason_cancelation || "Anulaci\xC3\xB3n",
                  document: "POS Invoice"
                },
                callback: function(data) {
                  frm.reload_doc();
                }
              });
              d.hide();
            }
          });
          d.show();
        },
        () => {
        }
      );
    }).addClass("btn-danger");
  }
  function generar_boton_factura(tipo_factura, frm) {
    frm.add_custom_button(__(tipo_factura), function() {
      frm.reload_doc();
      let serie_de_factura = frm.doc.name;
      let mi_url = window.location.href;
      frappe.call({
        method: "factura_electronica.pos_fel_api.api_interface",
        args: {
          invoice_code: frm.doc.name,
          naming_series: frm.doc.naming_series
        },
        callback: function(data) {
          if (data.message[0] === true) {
            let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
            window.location.assign(url_nueva);
            frm.reload_doc();
          }
        }
      });
    }).addClass("btn-primary");
  }
  function pdf_button_fel(cae_documento, frm) {
    frm.add_custom_button(__("VER PDF DOCUMENTO ELECTR\xC3\u201CNICO"), function() {
      window.open("https://report.feel.com.gt/ingfacereport/ingfacereport_documento?uuid=" + cae_documento);
    }).addClass("btn-primary");
  }
  function dependency_validator2(frm) {
    let taxes = frm.doc.taxes || [];
    if (!taxes.length > 0) {
      frappe.show_alert(
        {
          message: __(
            "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
          ),
          indicator: "red"
        },
        400
      );
    }
  }
  frappe.ui.form.on("POS Invoice", {
    setup(frm) {
      if (frm.doc.docstatus == 0) {
        frappe.call("factura_electronica.utils.utilities_facelec.get_rounding_config").then(({ message }) => {
          frm.set_value("disable_rounded_total", message);
          frm.refresh_field("disable_rounded_total");
        });
      }
    },
    onload_post_render: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      sales_invoice_calc2(frm);
    },
    refresh: function(frm, cdt, cdn) {
      if (frm.doc.docstatus != 0) {
        btn_generator(frm);
      }
    },
    validate: function(frm, cdt, cdn) {
      dependency_validator2(frm);
      generar_tabla_html2(frm);
    },
    discount_amount: function(frm, cdt, cdn) {
    },
    before_save: function(frm, cdt, cdn) {
    },
    on_submit: function(frm, cdt, cdn) {
      special_tax2(frm);
    },
    naming_series: function(frm, cdt, cdn) {
      if (frm.doc.naming_series) {
        frappe.call({
          method: "factura_electronica.api.obtener_numero_resolucion",
          args: {
            nombre_serie: frm.doc.naming_series
          },
          callback: function(numero_resolucion) {
            if (numero_resolucion.message === void 0) {
            } else {
              cur_frm.set_value("shs_numero_resolucion", numero_resolucion.message);
            }
          }
        });
      }
    }
  });
  function funct_eval2(a, b) {
    return a * b;
  }
  frappe.ui.form.on("POS Invoice Item", {
    shs_amount_for_back_calc: function(frm, cdt, cdn) {
      let row = frappe.get_doc(cdt, cdn);
      let a = row.rate;
      let b = row.qty;
      let c = row.amount;
      let calcu = goalSeek({
        Func: funct_eval2,
        aFuncParams: [b, a],
        oFuncArgTarget: {
          Position: 0
        },
        Goal: row.shs_amount_for_back_calc,
        Tol: 1e-3,
        maxIter: 1e4
      });
      row.qty = calcu;
      row.stock_qty = calcu;
      row.amount = calcu * a;
      frm.refresh_field("items");
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/sales_order.js
  function sales_order_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.sales_order_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("Sales Order Calculated Error");
      }
    });
    frm.reload_doc();
  }
  frappe.ui.form.on("Sales Order", {
    onload_post_render: function(frm, cdt, cdn) {
    },
    shs_so_nit: function(frm) {
    },
    discount_amount: function(frm) {
      var tax_before_calc = frm.doc.shs_so_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.shs_so_total_iva = frm.doc.shs_so_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      sales_order_calc(frm);
    },
    validate: function(frm, cdt, cdn) {
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/sales_quotation.js
  function quotation_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.sales_quotation_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("Sales Quotation Calculated Error");
      }
    });
    frm.reload_doc();
  }
  frappe.ui.form.on("Quotation", {
    onload_post_render: function(frm, cdt, cdn) {
    },
    facelec_qt_nit: function(frm, cdt, cdn) {
    },
    discount_amount: function(frm, cdt, cdn) {
      var tax_before_calc = frm.doc.facelec_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.facelec_total_iva = frm.doc.facelec_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      quotation_calc(frm);
    },
    validate: function(frm, cdt, cdn) {
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/purchase_invoice.js
  function redondeo_sales_invoice(a, b) {
    return a * b;
  }
  function btn_factura_especial(frm) {
    cur_frm.clear_custom_buttons();
    frm.add_custom_button(__("Certificar factura especial en SAT"), function() {
      frappe.confirm(
        __("Are you sure you want to proceed to generate a Electronic Special Invoice?"),
        () => {
          let serie_de_factura = frm.doc.name;
          let mi_url = window.location.href;
          frappe.call({
            method: "factura_electronica.fel_api.generate_special_invoice",
            args: {
              invoice_code: frm.doc.name,
              naming_series: frm.doc.naming_series
            },
            callback: function(r) {
              if (r.message[0] === true) {
                let url_nueva = mi_url.replace(serie_de_factura, r.message[1]);
                window.location.assign(url_nueva);
                frm.reload_doc();
              }
            }
          });
        },
        () => {
        }
      );
    }).addClass("btn-warning");
  }
  function btn_poliza_factura_especial(frm) {
    frm.add_custom_button(__("Pago con retenci\xF3n (partida)"), function() {
      let d = new frappe.ui.Dialog({
        title: __("Pago de factura especial con retenci\xF3n"),
        fields: [
          {
            label: __("Centro de costo"),
            fieldname: "cost_center",
            fieldtype: "Link",
            options: "Cost Center",
            get_query: function() {
              return {
                filters: {
                  company: frm.doc.company
                }
              };
            },
            default: ""
          },
          {
            label: __("Cuenta de pago (banco o caja)"),
            fieldname: "credit_in_acc_currency",
            fieldtype: "Link",
            options: "Account",
            reqd: 1,
            get_query: function() {
              return {
                filters: {
                  company: frm.doc.company
                }
              };
            }
          },
          {
            fieldname: "col_br_asdffg",
            fieldtype: "Column Break"
          },
          {
            label: __("Multimoneda"),
            fieldname: "is_multicurrency",
            fieldtype: "Check"
          },
          {
            label: __("Nota"),
            fieldname: "note",
            fieldtype: "Data",
            read_only: 1,
            default: __("Usa los rangos de retenci\xF3n de la empresa; el IVA debe venir incluido en la factura.")
          },
          {
            label: __("Descripci\xF3n"),
            fieldname: "section_asdads",
            fieldtype: "Section Break",
            collapsible: 1
          },
          {
            label: __("Descripci\xF3n"),
            fieldname: "description",
            fieldtype: "Long Text"
          }
        ],
        primary_action_label: __("Crear partida"),
        primary_action(values) {
          frappe.call({
            method: "factura_electronica.api_erp.journal_entry_isr_purchase_inv",
            args: {
              invoice_name: frm.doc.name,
              cost_center: values.cost_center,
              credit_in_acc_currency: values.credit_in_acc_currency,
              is_multicurrency: values.is_multicurrency,
              description: values.description
            },
            callback: function(r) {
              d.hide();
              frm.refresh();
            }
          });
        }
      });
      d.show();
    }, __("FEL"));
  }
  function btn_debit_note(frm) {
    cur_frm.clear_custom_buttons();
    frm.add_custom_button(__("Certificar nota de d\xE9bito en SAT"), function() {
      frappe.confirm(
        __("Are you sure you want to proceed to generate a electronic debit note?"),
        () => {
          let d = new frappe.ui.Dialog({
            title: __("Generate Electronic Debit Note"),
            fields: [
              {
                label: __("Reason Adjusment?"),
                fieldname: "reason_adjust",
                fieldtype: "Data",
                reqd: 1
              }
            ],
            primary_action_label: __("Submit"),
            primary_action(values) {
              let serie_de_factura = frm.doc.name;
              let mi_url = window.location.href;
              frappe.call({
                method: "factura_electronica.fel_api.generate_debit_note",
                args: {
                  invoice_code: frm.doc.name,
                  naming_series: frm.doc.naming_series,
                  uuid_purch_inv: frm.doc.bill_no,
                  date_inv_origin: frm.doc.bill_date,
                  reason: values.reason_adjust
                },
                callback: function(r) {
                  console.log(r.message);
                  if (r.message[0] === true) {
                    let url_nueva = mi_url.replace(serie_de_factura, r.message[1]);
                    window.location.assign(url_nueva);
                    frm.reload_doc();
                  }
                }
              });
              d.hide();
            }
          });
          d.show();
        },
        () => {
        }
      );
    }).addClass("btn-primary");
  }
  function pdf_electronic_doc(frm) {
    frm.add_custom_button(
      __("PDF del documento"),
      function() {
        frappe.call("factura_electronica.fel.print_support.get_fel_pdf_url", {
          uuid: frm.doc.numero_autorizacion_fel,
          doctype: frm.doc.doctype,
          docname: frm.doc.name
        }).then((r) => r.message && window.open(r.message));
      },
      __("FEL")
    );
  }
  function btn_pi_canceller(frm) {
    frm.add_custom_button(
      __("Anular en SAT"),
      function() {
        frappe.confirm(
          __("\xBFAnular este documento en SAT? No se puede deshacer."),
          () => {
            let d = new frappe.ui.Dialog({
              title: __("Anular en SAT"),
              fields: [
                {
                  label: __("Reason for cancellation?"),
                  fieldname: "reason_cancelation",
                  fieldtype: "Data",
                  reqd: 1
                }
              ],
              primary_action_label: __("Submit"),
              primary_action(values) {
                frappe.call({
                  method: "factura_electronica.fel_api.invoice_canceller",
                  args: {
                    invoice_name: frm.doc.name,
                    reason_cancelation: values.reason_cancelation || "Anulaci\xF3n",
                    document: "Purchase Invoice"
                  },
                  callback: function(data) {
                    console.log(data.message);
                  }
                });
                d.hide();
              }
            });
            d.show();
          },
          () => {
          }
        );
      },
      __("FEL")
    );
  }
  function generar_tabla_html_factura_compra(frm) {
    if (frm.doc.items.length > 0) {
      const mi_array = frm.doc.items;
      const mi_array_dos = Array.from(mi_array);
      frappe.call({
        method: "factura_electronica.api.generar_tabla_html_factura_compra",
        args: {
          tabla: JSON.stringify(mi_array_dos),
          currency: frm.doc.currency
        },
        callback: function(data) {
          frm.set_value("other_tax_facelec", data.message);
          frm.refresh_field("other_tax_facelec");
        }
      });
    }
  }
  function purchase_invoice_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.purchase_invoice_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("Purchase Invoice Calculated Error");
      }
    });
    frm.reload_doc();
  }
  function special_pi_tax(frm) {
    let cuentas_registradas = {};
    let otrosImpuestos = frm.doc.shs_pi_otros_impuestos || [];
    otrosImpuestos.forEach((tax_row, index) => {
      if (tax_row.account_head) {
        cuentas_registradas[tax_row.account_head] = tax_row.total;
      }
    });
    if (Object.keys(cuentas_registradas).length > 0) {
      frappe.call({
        method: "factura_electronica.utils.special_tax.add_gl_entry_other_special_tax",
        args: {
          invoice_name: frm.doc.name,
          accounts: cuentas_registradas,
          invoice_type: "Purchase Invoice",
          is_return: frm.doc.is_return
        },
        callback: function() {
          frm.reload_doc();
        }
      });
    }
  }
  function btn_pi_generator(frm) {
    frappe.call({
      method: "factura_electronica.fel_api.is_valid_to_fel",
      args: {
        doctype: frm.doc.doctype,
        docname: frm.doc.name
      },
      callback: function(data) {
        if (data.message[1] === "anulador" && data.message[2]) {
          frappe.call("factura_electronica.api.btn_activator", {
            electronic_doc: "anulador_de_facturas_ventas_fel",
            company: frm.doc.company
          }).then((r) => {
            if (r.message) {
              frappe.call("factura_electronica.api.invoice_exists", {
                uuid: frm.doc.numero_autorizacion_fel
              }).then((r2) => {
                if (r2.message) {
                  cur_frm.clear_custom_buttons();
                  pdf_electronic_doc(frm);
                } else {
                  btn_pi_canceller(frm);
                  pdf_electronic_doc(frm);
                }
              });
            }
          });
        }
        if (data.message[0] == "FESP" && data.message[1]) {
          btn_factura_especial(frm);
          if (frm.doc.numero_autorizacion_fel) {
            cur_frm.clear_custom_buttons();
            pdf_electronic_doc(frm);
            btn_poliza_factura_especial(frm);
          }
        }
        if (data.message[0] == "NDEB" && data.message[1]) {
          btn_debit_note(frm);
          if (frm.doc.numero_autorizacion_fel) {
            cur_frm.clear_custom_buttons();
            pdf_electronic_doc(frm);
          }
        }
      }
    });
  }
  frappe.ui.form.on("Purchase Invoice", {
    refresh: function(frm, cdt, cdn) {
      frm.set_df_property(
        "bill_no",
        "description",
        __("<b>FEL: UUID de factura original</b>, dato necesario para Nota de Debito Electronica")
      );
      frm.set_df_property(
        "bill_date",
        "description",
        __("<b>FEL: Fecha de factura original</b>, dato necesario para Nota de Debito Electronica")
      );
      if (frm.doc.docstatus != 0) {
        btn_pi_generator(frm);
      }
    },
    onload_post_render: function(frm, cdt, cdn) {
    },
    discount_amount: function(frm, cdt, cdn) {
      var tax_before_calc = frm.doc.facelec_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.facelec_total_iva = frm.doc.facelec_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
      generar_tabla_html_factura_compra(frm);
    },
    after_save: function(frm, cdt, cdn) {
      purchase_invoice_calc(frm);
    },
    validate: function(frm, cdt, cdn) {
      generar_tabla_html_factura_compra(frm);
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    },
    on_submit: function(frm, cdt, cdn) {
      special_pi_tax(frm);
    }
  });
  frappe.ui.form.on("Purchase Invoice Item", {
    shs_amount_for_back_calc: function(frm, cdt, cdn) {
      let row = frappe.get_doc(cdt, cdn);
      var a = row.rate;
      var b = row.qty;
      var c = row.amount;
      let calcu = goalSeek({
        Func: redondeo_sales_invoice,
        aFuncParams: [b, a],
        oFuncArgTarget: {
          Position: 0
        },
        Goal: row.shs_amount_for_back_calc,
        Tol: 1e-3,
        maxIter: 1e4
      });
      frappe.model.set_value(row.doctype, row.name, "qty", flt(calcu));
      frappe.model.set_value(row.doctype, row.name, "stock_qty", flt(calcu));
      frappe.model.set_value(row.doctype, row.name, "amount", flt(calcu * a));
      frm.refresh_field("items");
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/purchase_receipt.js
  function purchase_receipt_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.purchase_receipt_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("Purchase Receipt Calculated Error");
      }
    });
    frm.reload_doc();
  }
  frappe.ui.form.on("Purchase Receipt", {
    onload_post_render: function(frm, cdt, cdn) {
    },
    facelec_nit_prproveedor: function(frm) {
      valNit(frm.doc.facelec_nit_prproveedor, frm.doc.supplier, frm);
    },
    discount_amount: function(frm) {
      var tax_before_calc = frm.doc.facelec_pr_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.facelec_pr_total_iva = frm.doc.facelec_pr_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      purchase_receipt_calc(frm);
    },
    validate: function(frm, cdt, cdn) {
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    }
  });
  frappe.ui.form.on("Purchase Receipt Item", {
    shs_amount_for_back_calc: function(frm, cdt, cdn) {
      let row = frappe.get_doc(cdt, cdn);
      let a = row.rate;
      let b = row.qty;
      let c = row.amount;
      let calcu = goalSeek({
        Func: redondeo_purchase_receipt,
        aFuncParams: [b, a],
        oFuncArgTarget: {
          Position: 0
        },
        Goal: row.shs_amount_for_back_calc,
        Tol: 1e-3,
        maxIter: 1e4
      });
      row.qty = calcu;
      row.stock_qty = calcu;
      row.amount = calcu * a;
      frm.refresh_field("items");
    }
  });
  function redondeo_purchase_receipt(a, b) {
    return a * b;
  }

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/purchase_order.js
  function purchase_order_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.purchase_order_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
        console.log("Purchase Order Calculated Error");
      }
    });
    frm.reload_doc();
  }
  frappe.ui.form.on("Purchase Order", {
    onload_post_render: function(frm, cdt, cdn) {
    },
    validate: function(frm, cdt, cdn) {
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    },
    facelec_po_nit: function(frm) {
      valNit(frm.doc.facelec_po_nit, frm.doc.supplier, frm);
    },
    discount_amount: function(frm) {
      var tax_before_calc = frm.doc.facelec_po_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.facelec_po_total_iva = frm.doc.facelec_po_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      purchase_order_calc(frm);
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/supplier_quotation.js
  function supplier_quotation_calc(frm) {
    frappe.call({
      method: "factura_electronica.utils.calculator.supplier_quotation_calculator",
      args: {
        invoice_name: frm.doc.name
      },
      freeze: true,
      freeze_message: __("Calculating") + " \u{1F4C4}\u{1F4C4}\u{1F4C4}",
      callback: (r) => {
        frm.reload_doc();
      },
      error: (r) => {
      }
    });
    frm.reload_doc();
  }
  frappe.ui.form.on("Supplier Quotation", {
    onload_post_render: function(frm, cdt, cdn) {
    },
    shs_spq_nit: function(frm) {
    },
    discount_amount: function(frm) {
      var tax_before_calc = frm.doc.shs_spq_total_iva;
      var discount_amount_net_value = frm.doc.discount_amount / (1 + cur_frm.doc.taxes[0].rate / 100);
      if (isNaN(discount_amount_net_value) || discount_amount_net_value == void 0) {
      } else {
        discount_amount_tax_value = discount_amount_net_value * (cur_frm.doc.taxes[0].rate / 100);
        frm.doc.shs_spq_total_iva = frm.doc.shs_spq_total_iva - discount_amount_tax_value;
      }
    },
    before_save: function(frm, cdt, cdn) {
    },
    after_save: function(frm, cdt, cdn) {
      supplier_quotation_calc(frm);
    },
    validate: function(frm, cdt, cdn) {
      let taxes = frm.doc.taxes || [];
      if (taxes.length == 0) {
        frappe.show_alert(
          {
            message: __(
              "Tabla de impuestos no se encuentra cargada, por favor agregarla para que los calculos se generen correctamente"
            ),
            indicator: "red"
          },
          400
        );
      }
    }
  });

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/sales_invoice_actions.js
  frappe.listview_settings["Sales Invoice"] = frappe.listview_settings["Sales Invoice"] || {};
  var previous_sales_invoice_onload = frappe.listview_settings["Sales Invoice"].onload;
  frappe.listview_settings["Sales Invoice"].onload = function(listview) {
    if (typeof previous_sales_invoice_onload === "function") {
      previous_sales_invoice_onload.call(this, listview);
    }
    listview.page.add_action_item(__("Create GT Electronic Invoice Batch"), function() {
      const checked = listview.get_checked_items() || [];
      const selected = checked.map(function(row) {
        const name = typeof row === "string" ? row : row.name;
        return { invoice: name };
      });
      frappe.call({
        method: "factura_electronica.api_erp.batch_generator_api",
        freeze: true,
        args: {
          invoices: JSON.stringify(selected)
        }
      });
    });
  };

  // ../../../../../../../Quotes/guatemala-l10n/factura_electronica/factura_electronica/public/js/report_defaults.js
  frappe.provide("frappe.query_reports");
  (function() {
    const NET_DEFAULTS = { "Trial Balance": "show_net_values" };
    Object.keys(NET_DEFAULTS).forEach((report) => {
      let current = frappe.query_reports[report];
      Object.defineProperty(frappe.query_reports, report, {
        configurable: true,
        enumerable: true,
        get() {
          return current;
        },
        set(value) {
          (value && value.filters || []).forEach((f) => {
            if (f.fieldname === NET_DEFAULTS[report])
              f.default = 1;
          });
          current = value;
        }
      });
    });
  })();
})();
//# sourceMappingURL=factura_electronica.bundle.X3BJA345.js.map
