from conftest import get_inventory_quantity, set_inventory_quantity


def test_tc6_update_inventory_quantity_for_coca_cola(app, admin_api):
    product_name = "Coca Cola 250ML"
    branch_name = "Ayer Keroh Branch"

    set_inventory_quantity(admin_api, product_name, branch_name, 100)

    app.login_as_admin()
    app.open("/admin/inventory")
    app.wait_for_text("Inventory Overview")
    app.type_by_placeholder("Search product, code, branch...", product_name)
    app.wait_for_text(product_name)
    app.wait_for_text(branch_name)
    app.wait_for_text("100")
    app.save_evidence("TC6_inventory_quantity_updated")

    assert get_inventory_quantity(admin_api, product_name, branch_name) == 100
