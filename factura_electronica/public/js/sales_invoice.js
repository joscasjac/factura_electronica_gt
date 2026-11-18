/**
 * Copyright (c) 2021 Si Hay Sistema and contributors
 * For license information, please see license.txt
 */

// import { valNit } from "./facelec.js";
import { goalSeek } from "./goalSeek.js";

/**
 * @summary Limpia los campos con data no necesaria, al momento de duplicar
 *
 * @param {*} frm
 */
function clean_fields(frm) {
  // Funcionalidad evita copiar CAE cuando se duplica una factura
  // LIMPIA/CLEAN, permite limpiar los campos cuando se duplica una factura
  if (frm.doc.status === "Draft" || frm.doc.docstatus == 0) {
    frm.set_value("cae_factura_electronica", "");
    frm.set_value("serie_original_del_documento", "");
    frm.set_value("numero_autorizacion_fel", "");
    frm.set_value("facelec_s_vat_declaration", "");
    // cur_frm.set_value("ag_invoice_id", '');
    frm.set_value("facelec_tax_retention_guatemala", "");
    frm.set_value("facelec_export_doc", "");
    frm.set_value("facelec_export_record", "");
    frm.set_value("facelec_record_type", "");
    frm.set_value("facelec_consumable_record_type", "");
    frm.set_value("facelec_record_number", "");
    frm.set_value("facelec_record_value", "");
    frm.set_value("access_number_fel", "");
    frm.refresh_fields();
  }
}

/**
 * @summary Generador tabla HTML con detalles de impuestos e impuestos especiales
 *
 * @param {*} frm
 */
function generar_tabla_html(frm) {
  if (frm.doc.items.length > 0) {
    const mi_array = frm.doc.items;
    const mi_array_dos = Array.from(mi_array);

    frappe.call({
      method: "factura_electronica.api.generar_tabla_html",
      args: {
        tabla: JSON.stringify(mi_array_dos),
        currency: frm.doc.currency,
      },
      callback: function (data) {
        frm.set_value("other_tax_facelec", data.message);
        frm.refresh_field("other_tax_facelec");
      },
    });
  }
}

/**
 * @summary Calculador de montos para generar documentos electronicos
 * @param {Object} frm - Propiedades del Doctype
 */
function sales_invoice_calc(frm) {
  frappe.call({
    method: "factura_electronica.utils.calculator.sales_invoice_calculator",
    args: {
      invoice_name: frm.doc.name,
    },
    callback: () => frm.reload_doc(),
  });
}

/**
 * @summary Validador de que boton se debe generar para docs electronicos
 * @param {Object} frm
 */
function btn_generator(frm) {
  // INICIO VALIDACION DE ESCENARIOS PARA MOSTRAR LOS BOTOTNES GENERADORES DOCS ELECTRONICOS ADECUADOS
  // El documento debe estar guardado para que la funcion is_valid_to_fel valide correctamente el escenario
  frappe.call({
    method: "factura_electronica.fel_api.is_valid_to_fel",
    args: {
      doctype: frm.doc.doctype,
      docname: frm.doc.name,
    },
    callback: function (r) {
      // DEBUG: usar para ver si aplica
      // console.log(r.message);

      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA ANULAR DOCS ELECTRONICOS
      // Solo si el documento actual ya fue generado anteriormente como electronico
      if (r.message[1] === "anulador" && r.message[2]) {
        frappe
          .call("factura_electronica.api.btn_activator", {
            electronic_doc: "anulador_de_facturas_ventas_fel",
            company: frm.doc.company,
          })
          .then((r) => {
            // console.log(r.message)
            if (r.message) {
              // Si la anulacion electronica ya fue realizada, se mostrara boton para ver pdf doc anulado
              frappe
                .call("factura_electronica.api.invoice_exists", {
                  uuid: frm.doc.numero_autorizacion_fel,
                })
                .then((r) => {
                  // console.log(r.message)
                  if (r.message) {
                    cur_frm.clear_custom_buttons();
                    pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
                  } else {
                    // SI no aplica lo anterior se muestra btn para anular doc
                    btn_canceller(frm);
                    pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
                  }
                });
            }
          });
      }

      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA Generación Facturas Electrónicas FEL - Normal Type
      if ((r.message[0] === "FACT" || r.message[0] === "FPEQ") && r.message[1] !== "export" && r.message[2]) {
        generar_boton_factura(__("Factura Electrónica FEL"), frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
        }
      }

      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA Generación Facturas Electrónicas FEL - Exportación
      if (r.message[0] === "FACT" && r.message[1] == "export") {
        btn_export_invoice(frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
        }
      }

      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA Generación Nota Credito Electronica
      if (r.message[0] === "NCRE" && r.message[1] === "valido" && r.message[2]) {
        btn_credit_note(frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_credit_note(frm);
        }
      }
      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA Generación Nota abono Electronica
      if (r.message[0] === "NABN" && r.message[1] === "valido" && r.message[2]) {
        btn_nota_abono(frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_nota_abono(frm);
        }
      }

      // SI APLICA EL ESCENARIO MUESTRA EL BOTON PARA  Generación Factura Cambiaria
      // Nota de Débito de venta (Sales Invoice con is_debit_note)
      if (r.message[0] === "NDEB" && r.message[1] === "valido" && r.message[2] && frm.doc.is_debit_note) {
        btn_sales_debit_note(frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
        }
      }

      if ((r.message[0] === "FCAM" || r.message[0] === "FCAP") && r.message[1] === "valido" && r.message[2]) {
        btn_exchange_invoice(frm);
        if (frm.doc.numero_autorizacion_fel) {
          cur_frm.clear_custom_buttons();
          pdf_button_fel(frm.doc.numero_autorizacion_fel, frm);
        }
      }
    },
  });
  // FIN BOTONES GENERADORES DOCS ELECTRONICOS

  // INICIO GENERACION POLIZA CON RETENCIONES
  // TODO:AGREGAR VALIDACION EXISTENCIA DE JOURNA ENTRY
  // VALIDAR Y CREAR DOCUMENTACION DE RETENCIONES
  // if (frm.doc.docstatus === 1 && frm.doc.status !== "Paid") {
  //   btn_journal_entry_retention(frm);
  // }
  // FIN GENERACION POLIZA CON RETENCIONES
}

/**
 * @summary Para impuestos especiales (OJO SOLO COMBUSTIBLES) crear entradas en GL Entry para cuadrar montos
 * @param {Object} frm
 */
function special_tax(frm) {
  // Creacion objeto vacio para guardar nombre y valor de las cuentas que se encuentren
  let cuentas_registradas = {};
  let otrosimpuestos = frm.doc.shs_otros_impuestos || [];
  // Recorre la tabla hija en busca de cuentas
  otrosimpuestos.forEach((tax_row, index) => {
    if (tax_row.account_head) {
      // Agrega un nuevo valor al objeto (JSON-DICCIONARIO) con el
      // nombre, valor de la cuenta
      cuentas_registradas[tax_row.account_head] = tax_row.total;
    }
  });

  // Si existe por lo menos una cuenta, se ejecuta frappe.call
  if (Object.keys(cuentas_registradas).length > 0) {
    // llama al metodo python, el cual recibe de parametros el nombre de la factura y el objeto
    // con las ('cuentas encontradas
    //console.log('---------------------- se encontro por lo menos una cuenta--------------------');
    frappe.call({
      method: "factura_electronica.utils.special_tax.add_gl_entry_other_special_tax",
      args: {
        invoice_name: frm.doc.name,
        accounts: cuentas_registradas,
        invoice_type: "Sales Invoice",
        is_return: frm.doc.is_return,
        /* OJO, El valor de este argumento debe ser "Sales Invoice" en sales_invoice.js
        En el caso de purchase_invoice.js el valor del argumento debe de ser: invoice_type: "Purchase Invoice"
        */
      },
      // El callback se ejecuta tras finalizar la ejecucion del script python del lado
      // del servidor
      callback: function () {
        // Busca la modalidad configurada, ya sea Manual o Automatica
        // Esto para mostrar u ocultar los botones para la geneneracion de factura
        // electronica
        frm.reload_doc();
      },
    });
  }

  frm.refresh_field("access_number_fel");
  frm.reload_doc();
}

/**
 * @summary Generador boton para anular documentos electronicos
 *
 * @param {*} frm
 */
function btn_canceller(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("Electronic Document Canceller"), function () {
      // Permite hacer confirmaciones
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
                reqd: 1,
              },
            ],
            primary_action_label: __("Submit"),
            primary_action(values) {
              frappe.call({
                method: "factura_electronica.fel_api.invoice_canceller",
                args: {
                  invoice_name: frm.doc.name,
                  reason_cancelation: values.reason_cancelation || "Anulación",
                  document: "Sales Invoice",
                },
                callback: function (data) {
                  // console.log(data.message);
                  frm.reload_doc();
                },
              });

              d.hide();
            },
          });

          d.show();
        },
        () => {
          // action to perform if No is selected
          // console.log('Selecciono NO')
        }
      );
    })
    .addClass("btn-danger");
}

/**
 * @summary Generador boton para FEL normal
 *
 * @param {*} tipo_factura
 * @param {*} frm
 */
function generar_boton_factura(tipo_factura, frm) {
  frm
    .add_custom_button(__(tipo_factura), function () {
      // frm.reload(); permite hacer un refresh de todo el documento
      frm.reload_doc();
      let serie_de_factura = frm.doc.name;
      // Guarda la url actual
      let mi_url = window.location.href;
      frappe.call({
        method: "factura_electronica.fel_api.api_interface",
        args: {
          invoice_code: frm.doc.name,
          naming_series: frm.doc.naming_series,
        },
        // El callback recibe como parametro el dato retornado por el script python del lado del servidor
        // para validar si se genero correctamente la factura electronica
        callback: function (data) {
          // console.log(data.message);
          if (data.message[0] === true) {
            // Crea una nueva url con el nombre del documento actualizado
            let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
            // Asigna la nueva url a la ventana actual
            window.location.assign(url_nueva);
            // Recarga la pagina
            frm.reload_doc();
          }
        },
      });
    })
    .addClass("btn-primary"); //NOTA: Se puede crear una clase para el boton CSS
}

/**
 * @summary Generador de boton para factura de exportacion, cuando se pulsa
 * hace una peticion a la funcion generate_export_invoice y esta a la
 * vez genera la peticion a INFILE con los datos de la factura
 *
 * @param {*} frm
 */
function btn_export_invoice(frm) {
  cur_frm.clear_custom_buttons(); // Limpia otros customs buttons para generar uno nuevo
  frm
    .add_custom_button(__("FACTURA ELECTRONICA EXPORTACION FEL"), function () {
      frappe.call({
        method: "factura_electronica.fel_api.api_interface_export",
        args: {
          invoice_code: frm.doc.name,
          naming_series: frm.doc.naming_series,
        },
        callback: function (data) {
          // console.log(data.message);
          let serie_de_factura = frm.doc.name;
          // Guarda la url actual
          let mi_url = window.location.href;

          if (data.message[0] === true) {
            // Crea una nueva url con el nombre del documento actualizado
            let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
            // Asigna la nueva url a la ventana actual
            window.location.assign(url_nueva);
            // Recarga la pagina
            frm.reload_doc();
          }
        },
      });
    })
    .addClass("btn-primary");
}

/**
 * @summary Render para boton notas de credito electronicas
 *
 * @param {*} frm
 */
function btn_credit_note(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("CREDIT NOTE FEL"), function () {
      // Permite hacer confirmaciones
      frappe.confirm(
        __("Are you sure you want to proceed to generate a credit note?"),
        () => {
          let d = new frappe.ui.Dialog({
            title: __("Generate Credit Note"),
            fields: [
              {
                label: __("Reason Adjusment?"),
                fieldname: "reason_adjust",
                fieldtype: "Data",
                reqd: 1,
              },
            ],
            primary_action_label: __("Submit"),
            primary_action(values) {
              let serie_de_factura = frm.doc.name;
              // Guarda la url actual
              let mi_url = window.location.href;

              frappe.call({
                method: "factura_electronica.fel_api.generate_credit_note",
                args: {
                  invoice_code: frm.doc.name,
                  naming_series: frm.doc.naming_series,
                  reference_inv: frm.doc.return_against,
                  reason: values.reason_adjust,
                },
                callback: function (data) {
                  console.log(data.message);
                  if (data.message[0] === true) {
                    // Crea una nueva url con el nombre del documento actualizado
                    let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
                    // Asigna la nueva url a la ventana actual
                    window.location.assign(url_nueva);
                    // Recarga la pagina
                    frm.reload_doc();
                  }
                },
              });

              d.hide();
            },
          });

          d.show();
        },
        () => {
          // action to perform if No is selected
          // console.log('Selecciono NO')
        }
      );
    })
    .addClass("btn-primary");
}
/**
 * @summary Render para boton notas de abono electronicas
 *
 * @param {*} frm
 */
function btn_nota_abono(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("GENERAR NOTA DE ABONO"), function () {
      // Permite hacer confirmaciones
      frappe.confirm(
        __("Proceder con la generacion del la nota de abono?"),
        () => {
          let d = new frappe.ui.Dialog({
            title: __("Generar nota de abono"),
            fields: [
              {
                label: __("Inserte la razon del ajuste"),
                fieldname: "reason_adjust",
                fieldtype: "Data",
                reqd: 1,
              },
            ],
            primary_action_label: __("Submit"),
            primary_action(values) {
              let serie_de_factura = frm.doc.name;
              // Guarda la url actual
              let mi_url = window.location.href;
              frappe.call({
                method: "factura_electronica.fel_api.generate_nota_abono",
                args: {
                  invoice_code: frm.doc.name,
                  naming_series: frm.doc.naming_series,
                  reason: values.reason_adjust,
                },
                callback: function (data) {
                  console.log(data.message);
                  if (data.message[0] === true) {
                    // Crea una nueva url con el nombre del documento actualizado
                    let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
                    // Asigna la nueva url a la ventana actual
                    window.location.assign(url_nueva);
                    // Recarga la pagina
                    frm.reload_doc();
                  }
                },
              });

              d.hide();
            },
          });

          d.show();
        },
        () => {
          // action to perform if No is selected
          // console.log('Selecciono NO')
        }
      );
    })
    .addClass("btn-primary");
}
//aqui termina la nota de abono

/**
 * @summary Generador de boton para factura exenta de impuestos
 *
 * @param {*} frm
 */
function btn_exempt_invoice(frm) {
  cur_frm.clear_custom_buttons(); // Limpia otros customs buttons para generar uno nuevo

  frm
    .add_custom_button(__("FACTURA ELECTRONICA EXENTA"), function () {
      show_alert("Trabajo en progreso, opcion no disponible", 5);

      // frappe.call({
      //     method: 'factura_electronica.fel_api.generate_exempt_electronic_invoice',
      //     args: {
      //         invoice_code: frm.doc.name,
      //         naming_series: frm.doc.naming_series,
      //     },
      //     callback: function (data) {
      //         console.log(data.message);

      //         if (data.message[0] === true) {
      //             // Crea una nueva url con el nombre del documento actualizado
      //             let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
      //             // Asigna la nueva url a la ventana actual
      //             window.location.assign(url_nueva);
      //             // Recarga la pagina
      //             frm.reload_doc();
      //         };

      //     },
      // });
    })
    .addClass("btn-primary");
}

/**
 * @summary Generador de boton retenciones de impuestos IVA/ISR
 *
 * @param {*} frm
 */
function btn_journal_entry_retention(frm) {
  frm.page.add_action_item(__("Cobro con retención ISR / IVA"), () => btn_journal_entry_retention_dialog(frm));
}

function btn_journal_entry_retention_dialog(frm) {
  {
    let d = new frappe.ui.Dialog({
      title: __("Cobro con retención ISR / IVA"),
      fields: [
        {
          label: __("Centro de costo"),
          fieldname: "cost_center",
          fieldtype: "Link",
          options: "Cost Center",
          get_query: function () {
            return {
              filters: {
                company: frm.doc.company,
              },
            };
          },
          default: "",
        },
        {
          label: __("Cuenta de cobro (banco o caja)"),
          fieldname: "debit_in_acc_currency",
          fieldtype: "Link",
          options: "Account",
          reqd: 1,
          get_query: function () {
            return {
              filters: {
                company: frm.doc.company,
              },
            };
          },
        },
        {
          fieldname: "col_br_asdffg",
          fieldtype: "Column Break",
        },
        {
          label: __("Multimoneda"),
          fieldname: "is_multicurrency",
          fieldtype: "Check",
        },
        {
          label: __("El cliente retiene IVA"),
          fieldname: "is_iva_withholding",
          fieldtype: "Check",
        },
        {
          label: __("Porcentaje de IVA retenido"),
          fieldname: "iva_retention_rate",
          fieldtype: "Percent",
          default: 15,
          depends_on: "eval:doc.is_iva_withholding",
        },
        {
          label: __("El cliente retiene ISR"),
          fieldname: "is_isr_withholding",
          fieldtype: "Check",
        },
        {
          label: __("Nota"),
          fieldname: "note",
          fieldtype: "Data",
          read_only: 1,
          default: __("Usa los rangos de retención de la empresa; el IVA debe venir incluido en la factura."),
        },
        {
          label: __("Descripción"),
          fieldname: "section_asdads",
          fieldtype: "Section Break",
          collapsible: 1,
        },
        {
          label: __("Descripción"),
          fieldname: "description",
          fieldtype: "Long Text",
        },
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
            iva_retention_rate: values.iva_retention_rate,
          },
          callback: function (r) {
            d.hide();
            frm.refresh();
          },
        });
      },
    });
    d.show();
  }
}

/**
 * @summary Generador de boton facturas cambiarias
 *
 * @param {*} frm
 */
function btn_exchange_invoice(frm) {
  cur_frm.clear_custom_buttons(); // Limpia otros customs buttons para generar uno nuevo
  frm
    .add_custom_button(__("FACTURA CAMBIARIA FEL"), function () {
      frappe.call({
        method: "factura_electronica.fel_api.generate_exchange_invoice_si",
        args: {
          invoice_code: frm.doc.name,
          naming_series: frm.doc.naming_series,
        },
        callback: function (data) {
          console.log(data.message);
          let serie_de_factura = frm.doc.name;
          // Guarda la url actual
          let mi_url = window.location.href;

          if (data.message[0] === true) {
            // Crea una nueva url con el nombre del documento actualizado
            let url_nueva = mi_url.replace(serie_de_factura, data.message[1]);
            // Asigna la nueva url a la ventana actual
            window.location.assign(url_nueva);
            // Recarga la pagina
            frm.reload_doc();
          }
        },
      });
    })
    .addClass("btn-primary");
}

/**
 * @summary Generador de boton que visualiza PDF doc electronico
 *
 * @param {*} cae_documento
 * @param {*} frm
 */
function pdf_button_fel(cae_documento, frm) {
  // Esta funcion se encarga de mostrar el boton para obtener el pdf de la factura electronica generada
  // aplica para fel, y anuladas
  frm
    .add_custom_button(__("VER PDF DOCUMENTO ELECTRÓNICO"), function () {
      open_fel_pdf(cae_documento, frm);
    })
    .addClass("btn-primary");
}

/**
 * @summary Generador de boton para visualizar pdf nota credito electronica
 *
 * @param {*} frm
 */
function pdf_credit_note(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("VER PDF NOTA CREDITO ELECTRONICA"), function () {
      open_fel_pdf(frm.doc.numero_autorizacion_fel, frm);
    })
    .addClass("btn-primary");
}

/**
 * @summary Generador de boton para visualizar pdf nota abono electronica
 *
 * @param {*} frm
 */
function pdf_nota_abono(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("VER PDF NOTA ABONO ELECTRONICA"), function () {
      open_fel_pdf(frm.doc.numero_autorizacion_fel, frm);
    })
    .addClass("btn-primary");
}
/**
 * @summary Abre el PDF del documento certificado según el certificador de la configuración
 * (INFILE: su visor; DIGIFACT: PDF adjunto al Envío FEL; Demo/otros: formato de impresión FEL).
 */
function open_fel_pdf(uuid, frm) {
  frappe
    .call("factura_electronica.fel.print_support.get_fel_pdf_url", {
      uuid: uuid,
      doctype: frm.doc.doctype,
      docname: frm.doc.name,
    })
    .then((r) => {
      if (r.message) window.open(r.message);
    });
}

/**
 * @summary Botón Nota de Débito FEL para Sales Invoice con is_debit_note
 */
function btn_sales_debit_note(frm) {
  cur_frm.clear_custom_buttons();
  frm
    .add_custom_button(__("NOTA DE DÉBITO FEL"), function () {
      let d = new frappe.ui.Dialog({
        title: __("Nota de Débito Electrónica"),
        fields: [
          {
            label: __("Motivo del ajuste"),
            fieldname: "reason",
            fieldtype: "Data",
            reqd: 1,
          },
        ],
        primary_action_label: __("Generar"),
        primary_action(values) {
          let serie_de_factura = frm.doc.name;
          let mi_url = window.location.href;
          frappe.call({
            method: "factura_electronica.fel_api.generate_sales_debit_note",
            args: {
              invoice_code: frm.doc.name,
              naming_series: frm.doc.naming_series,
              reference_inv: frm.doc.return_against,
              reason: values.reason,
            },
            freeze: true,
            callback: function (data) {
              d.hide();
              if (data.message && data.message[0] === true) {
                window.location.assign(mi_url.replace(serie_de_factura, data.message[1]));
              } else if (data.message) {
                frappe.msgprint({ title: __("Nota de Débito FEL"), message: data.message[1], indicator: "red" });
              }
            },
          });
        },
      });
      d.show();
    })
    .addClass("btn-primary");
}

/**
 * @summary NumeroAcceso SAT (100000000-999999999) de un registro Access Number FCAM (FCAM-000000007)
 */
function sat_access_number(record_name) {
  if (!record_name) return "";
  const sequence = parseInt(String(record_name).split("-").pop(), 10);
  if (isNaN(sequence)) return record_name;
  return String(sequence >= 100000000 ? sequence : 100000000 + sequence);
}

/**
 * @summary Venta al crédito con serie de Factura: sugiere la serie de Factura Cambiaria
 */
function suggest_exchange_invoice(frm) {
  if (frm.doc.docstatus !== 0 || !frm.doc.company || !frm.doc.naming_series) return;
  frappe
    .call("factura_electronica.fel.print_support.suggest_exchange_series", {
      company: frm.doc.company,
      naming_series: frm.doc.naming_series,
      posting_date: frm.doc.posting_date,
      due_date: frm.doc.due_date,
    })
    .then((r) => {
      if (!r.message) return;
      frm.dashboard.clear_headline();
      frm.dashboard.set_headline_alert(
        __("Venta al crédito: puede emitirla como Factura Cambiaria (serie {0}).", [r.message]) +
          ` <a href="#" role="button" class="fel-use-fcam" data-series="${frappe.utils.escape_html(r.message)}">${__("Usar serie {0}", [
            r.message,
          ])}</a>`,
        "blue"
      );
    });
}

// Delegated: the headline is rendered outside frm.dashboard.wrapper.
$(document).on("click", ".fel-use-fcam", function (event) {
  event.preventDefault();
  const frm = cur_frm;
  const series = $(this).attr("data-series");
  if (!frm || !series) return;
  frm.dashboard.clear_headline();
  if (frm.is_new()) {
    frm.set_value("naming_series", series);
    return;
  }
  // A saved draft: naming_series is set only once in the form, so change it on the server.
  frappe
    .call("factura_electronica.fel.print_support.use_exchange_series", { invoice: frm.doc.name, series: series })
    .then(() => {
      frm.reload_doc();
      frappe.show_alert({ message: __("Serie cambiada a {0}.", [series]), indicator: "green" });
    });
});

/**
 * @summary Valida que existan los datos minimos necesarios para realizar calculos correctamente
 * @param {Object} frm
 */
function dependency_validator(frm) {
  let taxes = frm.doc.taxes || [];
  if (!taxes.length > 0) {
    // Muestra una notificacion para cargar una tabla de impuestos
    frappe.show_alert(
      {
        message: __("Falta la plantilla de impuestos: agréguela para que el IVA se calcule bien."),
        indicator: "orange",
      },
      8
    );
  }
}

/* Factura de Ventas-------------------------------------------------------------------------------------------------- */
frappe.ui.form.on("Sales Invoice", {
  // Cuando se carga por primera vez una factura se asegura que active o no el redondeo
  // de decimales dependiendo de la configucion
  setup(frm) {
    if (frm.doc.docstatus == 0) {
      frappe.call("factura_electronica.utils.utilities_facelec.get_rounding_config").then(({ message }) => {
        frm.set_value("disable_rounded_total", message);
        frm.refresh_field("disable_rounded_total");
      });
    }
  },
  // Se ejecuta cuando se renderiza el doctype
  onload_post_render: function (frm, cdt, cdn) {
    // clean_fields(frm);
  },
  // Se ejecuta despues de guardar el doctype
  after_save: function (frm, cdt, cdn) {
    // Only drafts: after submit the document is read-only (and FEL may have renamed it).
    if (frm.doc.docstatus === 0) sales_invoice_calc(frm);
  },
  // Se ejecuta cuando hay alguna actualizacion de datos en el doctype
  refresh: function (frm, cdt, cdn) {
    // One status line, one primary action and one "FEL" menu (fel_refresh).
    // The old per-type buttons (btn_generator) are no longer shown.
    fel_refresh(frm);
    if (frm.doc.docstatus === 0) suggest_exchange_invoice(frm);
  },
  due_date: function (frm) {
    suggest_exchange_invoice(frm);
  },
  payment_terms_template: function (frm) {
    suggest_exchange_invoice(frm);
  },
  // Se ejecuta al presionar el boton guardar
  validate: function (frm, cdt, cdn) {
    dependency_validator(frm);
    generar_tabla_html(frm);
  },
  discount_amount: function (frm, cdt, cdn) {},
  // Se ejecuta antes de guardar el documento
  before_save: function (frm, cdt, cdn) {},
  // Se ejecuta al validar el documento
  on_submit: function (frm, cdt, cdn) {
    if (frm.__fel && frm.__fel.certify_on_submit) {
      // The server posted the special-tax entries and certified after the submit.
      fel_after_server_step(frm);
    } else {
      special_tax(frm);
    }
  },
  after_cancel: function (frm) {
    if (frm.__fel && frm.__fel.annul_on_cancel) fel_after_server_step(frm);
  },
  naming_series: function (frm, cdt, cdn) {
    // Aplica solo para FS
    if (frm.doc.naming_series) {
      frappe.call({
        method: "factura_electronica.api.obtener_numero_resolucion",
        args: {
          nombre_serie: frm.doc.naming_series,
        },
        // El callback se ejecuta tras finalizar la ejecucion del script python del lado
        // del servidor
        callback: function (numero_resolucion) {
          if (numero_resolucion.message === undefined) {
            // cur_frm.set_value('shs_numero_resolucion', '');
          } else {
            cur_frm.set_value("shs_numero_resolucion", numero_resolucion.message);
          }
        },
      });
    }
  },
});

/**
 * @summary Funcion para evaluar goalseek
 *
 * @param {*} a
 * @param {*} b
 * @return {*} monto
 */
function funct_eval(a, b) {
  return a * b;
}

frappe.ui.form.on("Sales Invoice Item", {
  // Cuando se cambia el valor de shs_amount_for_back_calc (monto redondeo)
  shs_amount_for_back_calc: function (frm, cdt, cdn) {
    let row = frappe.get_doc(cdt, cdn);

    // Permite aplicar goalSeek
    let a = row.rate;
    let b = row.qty;
    let c = row.amount;

    let calcu = goalSeek({
      Func: funct_eval,
      aFuncParams: [b, a],
      oFuncArgTarget: {
        Position: 0,
      },
      Goal: row.shs_amount_for_back_calc,
      Tol: 0.001,
      maxIter: 10000,
    });

    // frappe.model.set_value(row.doctype, row.name, "qty", calcu);
    // frappe.model.set_value(row.doctype, row.name, "stock_qty", calcu);
    // frappe.model.set_value(row.doctype, row.name, "amount", calcu * a);

    row.qty = calcu;
    row.stock_qty = calcu;
    row.amount = calcu * a;
    frm.refresh_field("items");
  },
});
/**
 * Copyright (c) 2026 QuestFlows and contributors
 * FEL on the Sales Invoice form: one status line, one primary action, one "FEL" menu,
 * and a single confirmation when submitting (certify) or cancelling (annul).
 * Server side: factura_electronica.fel.auto.
 */

const FEL_GROUP = __("FEL");

function fel_call(method, args) {
  return frappe.call({ method: "factura_electronica.fel.auto." + method, args: args }).then((r) => r.message);
}

function fel_money(ctx) {
  return format_currency(ctx.total, ctx.currency);
}

function fel_datetime(value) {
  if (!value) return "";
  // "2026-11-18T08:21:55-06:00" -> user's date format and HH:mm
  const text = String(value).replace("T", " ").slice(0, 16);
  return frappe.datetime.str_to_user(text);
}

/** Status line in the form headline. */
function fel_headline(frm, ctx) {
  frm.dashboard.clear_headline();
  if (!ctx || !ctx.fel) return;
  const esc = frappe.utils.escape_html;
  const demo = ctx.mode === "Demo";
  let text, color;
  if (ctx.anulada) {
    text = __("{0} anulada en SAT.", [esc(ctx.label)]);
    color = "gray";
  } else if (ctx.cancelled) {
    text = __("Cancelada en ERPNext pero vigente en SAT: anúlela con FEL › Anular en SAT.");
    color = "red";
  } else if (ctx.certified) {
    text = __("{0} certificada · Serie {1} Número {2} · {3}", [
      esc(ctx.label),
      esc(ctx.serie || ""),
      esc(ctx.numero || ""),
      esc(fel_datetime(ctx.fecha)),
    ]);
    if (ctx.original) text += " · " + __("número interno {0}", [esc(ctx.original)]);
    color = "green";
  } else if (ctx.contingency) {
    text = __("Emitida en contingencia (número de acceso {0}). Se reintenta certificar cada hora.", [
      esc(sat_access_number(frm.doc.access_number_fel)),
    ]);
    color = "orange";
  } else if (frm.doc.docstatus === 1) {
    text = __("{0} pendiente de certificar en SAT.", [esc(ctx.label)]);
    color = "orange";
  } else {
    return; // drafts: the submit dialog explains what will happen
  }
  if (demo && !ctx.anulada) {
    text += " " + __("Modo Demo: no se envió a SAT y no tiene validez fiscal.");
    color = color === "green" ? "orange" : color;
  }
  frm.dashboard.set_headline_alert(text, color);
}

/** Primary action + "FEL" menu for the document's state. */
function fel_actions(frm, ctx) {
  if (!ctx || !ctx.fel) return;
  const certified = ctx.certified && !ctx.anulada;
  if (frm.doc.docstatus === 1 && !ctx.certified) {
    const label = ctx.contingency ? __("Reintentar certificación") : __("Certificar en SAT");
    frm.add_custom_button(label, () => fel_certify(frm)).addClass("btn-primary");
  }
  if (ctx.certified) {
    frm.add_custom_button(__("PDF del documento"), () => open_fel_pdf(ctx.uuid, frm), FEL_GROUP);
  }
  if (frm.doc.docstatus === 1 && certified && !frm.doc.is_return && !frm.doc.is_debit_note) {
    // Credit notes: ERPNext's own Crear › Devolución / Nota de crédito (its NCRE series is chosen on save).
    frm.add_custom_button(__("Nota de débito"), () => fel_make_note(frm, "debit"), FEL_GROUP);
    if (frm.doc.outstanding_amount > 0) {
      frm.add_custom_button(__("Cobro con retención ISR / IVA"), () => btn_journal_entry_retention_dialog(frm), FEL_GROUP);
    }
  }
  if (ctx.cancelled && !ctx.anulada) {
    frm.add_custom_button(__("Anular en SAT"), () => fel_annul_dialog(frm, ctx), FEL_GROUP);
  }
}

function fel_certify(frm) {
  frappe.dom.freeze(__("Certificando en SAT…"));
  fel_call("certify_invoice", { invoice: frm.doc.name })
    .then((result) => fel_after_certify(frm, result))
    .finally(() => frappe.dom.unfreeze());
}

function fel_after_certify(frm, result) {
  if (!result) return;
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
    message: frappe.utils.escape_html(result.message || ""),
  });
  frm.reload_doc();
}

function fel_make_note(frm, kind) {
  if (kind === "credit") {
    // ERPNext's return; its FEL series (NCRE) is chosen when it is saved.
    frappe.model.open_mapped_doc({
      method: "erpnext.accounts.doctype.sales_invoice.sales_invoice.make_sales_return",
      frm: frm,
    });
    return;
  }
  frappe.new_doc("Sales Invoice", {
    company: frm.doc.company,
    customer: frm.doc.customer,
    currency: frm.doc.currency,
    is_debit_note: 1,
    return_against: frm.doc.name,
  });
}

/** Summary shown instead of "Permanently submit?" when submitting certifies in SAT. */
function fel_submit_dialog(frm, ctx) {
  return new Promise((resolve) => {
    const esc = frappe.utils.escape_html;
    const rows = [
      [__("Documento"), esc(ctx.label)],
      [__("Receptor"), esc(ctx.receptor || "") + " · NIT " + esc(ctx.nit || "CF")],
      [__("Total"), esc(fel_money(ctx))],
    ];
    const fields = [
      {
        fieldtype: "HTML",
        fieldname: "summary",
        options:
          `<table class="table table-bordered table-sm" style="margin-bottom:8px">` +
          rows.map((r) => `<tr><th style="width:30%">${r[0]}</th><td>${r[1]}</td></tr>`).join("") +
          `</table>` +
          (ctx.mode === "Demo"
            ? `<p class="text-warning">${__(
                "Modo Demo: se valida contra los esquemas de SAT pero no se envía; no tiene validez fiscal."
              )}</p>`
            : `<p class="text-muted">${__(
                "Al validar se envía a SAT. Solo se puede revertir anulándola en SAT."
              )}</p>`),
      },
    ];
    if (ctx.needs_reason) {
      fields.push({
        fieldtype: "Data",
        fieldname: "reason",
        label: __("Motivo del ajuste"),
        reqd: 1,
        default: frm.doc.fel_motivo_ajuste || "",
        description: __("Aparece en el documento que recibe el cliente."),
      });
    }
    let done = false;
    const d = new frappe.ui.Dialog({
      title: ctx.mode === "Demo" ? __("Validar (modo Demo)") : __("Validar y certificar en SAT"),
      fields: fields,
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
        if (!done) resolve(null);
      },
    });
    d.show();
  });
}

/** Reason dialog shown instead of "Permanently cancel?" for certified invoices. */
function fel_cancel_dialog(frm, ctx, title) {
  return new Promise((resolve) => {
    let done = false;
    const d = new frappe.ui.Dialog({
      title: title || __("Cancelar y anular en SAT"),
      fields: [
        {
          fieldtype: "HTML",
          fieldname: "note",
          options: `<p>${__("La {0} {1} se anulará en SAT con este motivo. No se puede deshacer.", [
            frappe.utils.escape_html(ctx.label),
            frappe.utils.escape_html((ctx.serie || "") + " " + (ctx.numero || "")),
          ])}</p>`,
        },
        { fieldtype: "Data", fieldname: "reason", label: __("Motivo de anulación"), reqd: 1 },
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
        if (!done) resolve(null);
      },
    });
    d.show();
  });
}

function fel_annul_dialog(frm, ctx) {
  fel_cancel_dialog(frm, ctx, __("Anular en SAT")).then((values) => {
    if (!values) return;
    frappe.dom.freeze(__("Anulando en SAT…"));
    fel_call("annul_invoice", { invoice: frm.doc.name, reason: values.reason })
      .then((r) => {
        frappe.show_alert({ message: r.message, indicator: r.ok ? "green" : "red" });
        frm.reload_doc();
      })
      .finally(() => frappe.dom.unfreeze());
  });
}

/** Run Frappe's own submit/cancel without its generic confirm (our dialog replaced it). */
function fel_without_confirm(fn) {
  // Frappe asks "Permanently submit / cancel?" after its own server checks (linked
  // documents), so the one-time bypass stays armed until that confirm is requested,
  // with a safety restore in case the flow stops before asking.
  const original = frappe.confirm;
  const restore = () => {
    if (frappe.confirm === bypass) frappe.confirm = original;
  };
  const bypass = function (message, yes) {
    frappe.confirm = original;
    yes && yes();
  };
  frappe.confirm = bypass;
  setTimeout(restore, 15000);
  try {
    return fn();
  } catch (e) {
    restore();
    throw e;
  }
}

function fel_install_overrides(frm) {
  if (frm.__fel_overrides) return;
  frm.__fel_overrides = true;
  const original_submit = frm.savesubmit.bind(frm);
  const original_cancel = frm.savecancel.bind(frm);

  frm.savesubmit = function (btn, callback, on_error) {
    const ctx = frm.__fel;
    if (!ctx || !ctx.fel || !ctx.certify_on_submit) return original_submit(btn, callback, on_error);
    return fel_submit_dialog(frm, ctx).then((values) => {
      if (!values) return;
      if (values.reason) frm.doc.fel_motivo_ajuste = values.reason;
      return fel_without_confirm(() => original_submit(btn, callback, on_error));
    });
  };

  frm.savecancel = function (btn, callback, on_error) {
    const ctx = frm.__fel;
    if (!ctx || !ctx.certified || ctx.anulada || !ctx.annul_on_cancel) return original_cancel(btn, callback, on_error);
    return fel_cancel_dialog(frm, ctx).then((values) => {
      if (!values) return;
      return fel_call("set_cancel_reason", { invoice: frm.doc.name, reason: values.reason }).then(() =>
        fel_without_confirm(() => original_cancel(btn, callback, on_error))
      );
    });
  };
}

/** After a submit or cancel that ran the FEL automation on the server. */
function fel_after_server_step(frm) {
  fel_call("submit_result", { invoice: frm.doc.name }).then((result) => {
    if (result) fel_after_certify(frm, result);
  });
}

function fel_refresh(frm) {
  if (frm.is_new()) return;
  fel_call("form_context", { invoice: frm.doc.name }).then((ctx) => {
    frm.__fel = ctx;
    if (!ctx || !ctx.fel) return;
    fel_install_overrides(frm);
    fel_headline(frm, ctx);
    fel_actions(frm, ctx);
  });
}

