from selenium.webdriver.support.ui import WebDriverWait

from conftest import api_get


def _find_purchase(admin_api, supplier_name, branch_name, product_name, quantity, status=None):
    for purchase in api_get(admin_api, "/admin/purchases"):
        if purchase.get("supplier_name") != supplier_name or purchase.get("branch_name") != branch_name:
            continue
        if status and purchase.get("status") != status:
            continue

        detail_response = api_get(admin_api, f"/admin/purchases/{purchase['purchase_id']}")
        if any(
            item.get("product_name") == product_name and int(item.get("quantity", 0)) == quantity
            for item in detail_response.get("details", [])
        ):
            return detail_response
    return None


def _wait_for_purchase(admin_api, supplier_name, branch_name, product_name, quantity, status):
    return WebDriverWait(None, 15).until(
        lambda _ignored: _find_purchase(admin_api, supplier_name, branch_name, product_name, quantity, status)
    )


def test_tc10_create_purchase_order(app, admin_api):
    supplier_name = "FreshMart Distribution"
    branch_name = "Warehouse"
    product_name = "Coca Cola 250ML"
    quantity = 100

    existing_purchase = _find_purchase(admin_api, supplier_name, branch_name, product_name, quantity, "PENDING")

    app.login_as_admin()
    app.open("/admin/purchases")
    app.wait_for_text("Purchase Orders")

    if not existing_purchase:
        app.click_button_in_section("Purchase Orders", "Create Purchase")
        app.wait_for_text("Create Purchase Order")
        app.select_option_containing_after_label("Supplier", supplier_name)
        app.select_option_containing(product_name)
        app.type_by_placeholder("20", str(quantity))
        app.type_by_placeholder("0.00", "1.55")
        app.click_modal_button("Create Purchase")
        app.wait_for_text("Purchase order created successfully")
        existing_purchase = _wait_for_purchase(
            admin_api,
            supplier_name,
            branch_name,
            product_name,
            quantity,
            "PENDING",
        )

    app.type_by_placeholder("Search purchase code, supplier, branch, or status...", existing_purchase["purchase_code"])
    app.wait_for_text(existing_purchase["purchase_code"])
    app.wait_for_text("PENDING")
    app.save_evidence("TC10_Create_Purchase_Order")

    assert existing_purchase["supplier_name"] == supplier_name
    assert existing_purchase["branch_name"] == branch_name
    assert existing_purchase["status"] == "PENDING"
    detail = existing_purchase["details"][0]
    assert detail["product_name"] == product_name
    assert int(detail["quantity"]) == quantity
    assert float(detail["unit_cost"]) == 1.55
