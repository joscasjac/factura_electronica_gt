// Copyright (c) 2016, Frappe and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["VAT and Income Tax Retention Report"] = {
    "filters": [
        {
            fieldname: "company",
            label: __("Company"),
            fieldtype: "Link",
            options: "Company",
            default: frappe.defaults.get_user_default("Company"),
            reqd: 1,
            on_change: function () {
                frappe.db
                    .get_value("Company", frappe.query_report.get_filter_value("company"), "tax_id")
                    .then((r) => {
                        // console.log(r.message.name)
                        frappe.query_report.set_filter_value("nit", r.message.tax_id);
                    });
            },
        },
        {
            fieldname: "nit",
            label: __("NIT"),
            fieldtype: "Data",
            default: "",
            read_only: 1,
        },
        {
            fieldname: "tipo_de_factura",
            label: __("Tipo de Factura"),
            fieldtype: "Select",
            options: ["", "Supplier", "Customer"],
            default: "",
            reqd: 0,
        },
        {
            fieldname: "from_date",
            label: __("From Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_start(frappe.datetime.add_months(frappe.datetime.get_today(), -1)),
            reqd: 1,
        },
        {
            fieldname: "to_date",
            label: __("To Date"),
            fieldtype: "Date",
            default: frappe.datetime.month_end(frappe.datetime.add_months(frappe.datetime.get_today(), -1)),
            reqd: 1,
        },
        {
            fieldname: "language",
            label: __("Display Language"),
            default: "es",
            fieldtype: "Link",
            options: "Language",
        },
    ],
    onload: function () {
        const company = frappe.query_report.get_filter_value("company");
        if (company) {
            frappe.db.get_value("Company", company, "tax_id").then((r) => frappe.query_report.set_filter_value("nit", (r.message || {}).tax_id || ""));
        }
    },
};
