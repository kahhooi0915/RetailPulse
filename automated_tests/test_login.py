from urllib.parse import urlparse


def test_tc1_valid_login_redirects_to_admin_dashboard(app):
    app.login_as_admin()

    assert urlparse(app.driver.current_url).path == "/admin"
    app.wait_for_text("Dashboard")
    app.wait_for_text("RetailPulse")
    app.save_evidence("TC1_valid_login_admin_dashboard")


def test_tc2_invalid_password_shows_error(app):
    app.login("admin@retailpulse.com", "Wrong123")

    error = app.wait_for_text("Invalid email or password")
    assert error.is_displayed()
    assert urlparse(app.driver.current_url).path == "/"
    app.save_evidence("TC2_invalid_password_error")
