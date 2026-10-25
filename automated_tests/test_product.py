from conftest import api_get


def test_tc4_add_product_appears_in_product_list(app, admin_api):
    product_name = "Mineral Water"
    existing = [
        product
        for product in api_get(admin_api, "/admin/products")
        if product.get("product_name", "").lower() == product_name.lower()
    ]

    app.login_as_admin()
    app.open("/admin/catalog")
    app.wait_for_text("Catalog Management")

    if not existing:
        app.wait_for_text("Catalog Management")
        app.click_button("Add Product")
        app.wait_for_text("Add Product")

        app.set_input_after_label("Product Name", product_name)
        app.select_after_label("Category", "Beverages")
        app.set_input_after_label("Selling Price", "2.50")
        app.set_input_after_label("Branch Reorder Level", "20")
        app.set_input_after_label("Warehouse Reorder Level", "100")
        app.click_modal_button("Add Product")
        app.wait_for_text("Product added successfully.")

    app.open("/admin/catalog")
    app.wait_for_text("Catalog Management")
    app.type_by_placeholder("Search code, name, category, or status...", product_name)
    app.wait_for_text(product_name)
    app.save_evidence("TC4_add_product_list")

    products = api_get(admin_api, "/admin/products")
    assert any(product.get("product_name") == product_name for product in products)
