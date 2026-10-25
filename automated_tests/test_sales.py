from conftest import get_inventory_quantity, set_inventory_quantity


def test_tc7_record_sale_reduces_inventory_by_two(app, admin_api):
    product_name = "Coca Cola 250ML"
    branch_name = "Melaka Sentral Branch"

    set_inventory_quantity(admin_api, product_name, branch_name, 100)
    before_stock = get_inventory_quantity(admin_api, product_name, branch_name)

    app.login_as_staff()
    app.type_by_placeholder("Search SKU or Product...", product_name)
    app.wait_for_text(product_name)
    app.click_product_card(product_name)
    app.click_product_card(product_name)
    app.click_button("Complete Transaction")
    app.wait_for_text("Complete Payment")
    app.click_button("Cash")
    app.click_button("Confirm Payment")
    app.wait_for_text("Transaction Complete")
    app.save_evidence("TC7_sale_transaction_complete")

    after_stock = get_inventory_quantity(admin_api, product_name, branch_name)
    assert after_stock == before_stock - 2
