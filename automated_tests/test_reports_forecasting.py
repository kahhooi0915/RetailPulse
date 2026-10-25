from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from conftest import api_get


def test_tc14_generate_sales_forecast(app, admin_api):
    forecast_payload = api_get(admin_api, "/admin/forecast/products")
    forecasts = forecast_payload.get("forecasts", [])
    assert forecasts, "Expected seeded forecast data"

    top_forecast = sorted(
        forecasts,
        key=lambda item: int(float(item.get("forecast_quantity") or 0)),
        reverse=True,
    )[0]

    app.login_as_admin()
    app.open("/admin/reports")
    WebDriverWait(app.driver, 90).until(
        lambda driver: len(driver.find_elements(By.XPATH, "//*[contains(normalize-space(.), 'Loading forecasting data')]")) == 0
    )

    app.wait_for_text("Reports & Forecasting")
    app.wait_for_text("Forecast Report")
    app.wait_for_text("Next-Month Sales Prediction")
    app.wait_for_text(top_forecast["product_name"])
    app.wait_for_text(str(top_forecast["forecast_quantity"]))
    app.save_evidence("TC14_Generate_Sales_Forecast")
