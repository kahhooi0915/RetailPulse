from selenium.webdriver.support.ui import WebDriverWait

from conftest import api_get


def _find_branch(admin_api, branch_name):
    for branch in api_get(admin_api, "/admin/branches"):
        if branch.get("branch_name", "").lower() == branch_name.lower():
            return branch
    return None


def test_tc11_add_branch(app, admin_api):
    branch_name = "Branch B"
    existing_branch = _find_branch(admin_api, branch_name)

    app.login_as_admin()
    app.open("/admin/branches")
    app.wait_for_text("Branch Management")

    if not existing_branch:
        app.click_button("Add Branch")
        app.wait_for_text("Add New Branch")
        app.set_input_after_label("Branch Name", branch_name)
        app.select_after_label("Branch Type", "Branch")
        app.select_after_label("Status", "Active")
        app.set_textarea_after_label("Branch Address", "Subang Jaya")
        app.set_input_after_label("Phone", "03-12345678")
        app.click_modal_button("Add Branch")
        WebDriverWait(None, 15).until(lambda _ignored: _find_branch(admin_api, branch_name))

    app.type_by_placeholder("Search by branch code, name, type, address, phone, or status...", branch_name)
    app.wait_for_text(branch_name)
    app.wait_for_text("Subang Jaya")
    app.save_evidence("TC11_Add_Branch")

    created_branch = _find_branch(admin_api, branch_name)
    assert created_branch is not None
    assert created_branch["branch_type"] == "BRANCH"
    assert created_branch["status"] == "ACTIVE"
