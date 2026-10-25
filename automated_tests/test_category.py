from conftest import api_get


def _find_category(admin_api, category_name):
    for category in api_get(admin_api, "/admin/categories"):
        if category.get("category_name", "").lower() == category_name.lower():
            return category
    return None


def test_tc05_add_category(app, admin_api):
    category_name = "Test Beverages"
    existing_category = _find_category(admin_api, category_name)

    app.login_as_admin()
    app.open("/admin/catalog")
    app.wait_for_text("Catalog Management")
    app.click_button("Categories")

    if not existing_category:
        app.click_button("Add Category")
        app.wait_for_text("Add Category")
        app.set_input_after_label("Category Name", category_name)
        app.select_after_label("Status", "Active")
        app.click_modal_button("Add Category")
        app.wait_for_text("Category added successfully")

    app.click_button("Categories")
    app.wait_for_text(category_name)
    app.wait_for_text("ACTIVE")
    app.save_evidence("TC05_Add_Category")

    created_category = _find_category(admin_api, category_name)
    assert created_category is not None
    assert created_category["status"] == "ACTIVE"
