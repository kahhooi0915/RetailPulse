from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from conftest import api_get


def _sale_with_product(admin_api, branch_name, product_name, date_prefix):
    for sale in api_get(admin_api, "/admin/sales"):
        if sale.get("branch_name") != branch_name:
            continue
        if not str(sale.get("sale_date", "")).startswith(date_prefix):
            continue

        details_payload = api_get(admin_api, f"/admin/sales/{sale['sale_id']}/details")
        details = details_payload.get("details", [])
        if any(item.get("product_name") == product_name for item in details):
            return sale, details
    raise AssertionError(f"No sale found for {product_name} at {branch_name} on {date_prefix}")


def _apply_sales_filters(app, branch_name, start_date, end_date):
    app.select_option_containing(branch_name)
    app.type_by_css("input[title='Start date']", start_date)
    app.type_by_css("input[title='End date']", end_date)
    WebDriverWait(app.driver, 15).until(
        lambda driver: len(driver.find_elements(By.XPATH, "//*[contains(normalize-space(.), 'No sales records found.')]")) == 0
    )


def test_tc12_view_sales_monitoring(app, admin_api):
    branch_name = "Ayer Keroh Branch"
    product_name = "Coca Cola 250ML"
    sale, _details = _sale_with_product(admin_api, branch_name, product_name, "2026-08-17")

    app.login_as_admin()
    app.open("/admin/sales")
    app.wait_for_text("Sales Monitoring")
    _apply_sales_filters(app, branch_name, "2026-08-17", "2026-08-17")

    app.wait_for_text(sale["sale_code"])
    app.wait_for_text(branch_name)
    app.wait_for_text(product_name)
    app.save_evidence("TC12_View_Sales_Monitoring")


def test_tc13_generate_sales_report(app, admin_api):
    branch_name = "Ayer Keroh Branch"
    product_name = "Coca Cola 250ML"
    _sale, _details = _sale_with_product(admin_api, branch_name, product_name, "2026-08-17")

    app.login_as_admin()
    app.open("/admin/sales")
    app.wait_for_text("Sales Monitoring")
    _apply_sales_filters(app, branch_name, "2026-08-01", "2026-08-17")

    app.wait_for_text("Sales Records")
    app.wait_for_text("Product Profit Report")
    app.wait_for_text(branch_name)
    app.wait_for_text(product_name)
    app.save_evidence("TC13_Generate_Sales_Report")
