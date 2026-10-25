from conftest import BACKEND_URL


def test_tc15_branch_staff_cannot_access_user_management(app, staff_api):
    app.login_as_staff()

    assert "User Management" not in app.driver.page_source
    app.save_evidence("TC15_staff_user_management_screen")

    forbidden = staff_api.get(f"{BACKEND_URL}/api/test/admin-rbac", timeout=10)
    assert forbidden.status_code == 403
    assert forbidden.json()["message"] == "Forbidden"
