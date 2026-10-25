from conftest import api_get


def _find_user_by_email(admin_api, email):
    for user in api_get(admin_api, "/admin/users"):
        if user.get("email", "").lower() == email.lower():
            return user
    return None


def test_tc03_add_branch_staff_user(app, admin_api):
    email = "john.tan@gmail.com"
    existing_user = _find_user_by_email(admin_api, email)

    app.login_as_admin()
    app.open("/admin/users")
    app.wait_for_text("User Management")

    if not existing_user:
        app.click_button("Add User")
        app.wait_for_text("Add User")
        app.set_input_after_label("Full Name", "John Tan")
        app.set_input_after_label("Email", email)
        app.set_input_after_label("Phone", "012-3456789")
        app.set_input_after_label("Password", "John@123")
        app.select_after_label("Role", "Branch Staff")
        app.select_after_label("Branch", "Ayer Keroh Branch")
        app.click_modal_button("Add User")
        app.wait_for_text("User added successfully")

    app.type_by_placeholder("Search by name, email, phone, user code, branch...", email)
    app.wait_for_text("JOHN TAN")
    app.wait_for_text("Ayer Keroh Branch")
    app.save_evidence("TC03_Add_User")

    created_user = _find_user_by_email(admin_api, email)
    assert created_user is not None
    assert created_user["name"] == "JOHN TAN"
    assert created_user["role"] == "BRANCH_STAFF"
    assert created_user["branch_name"] == "Ayer Keroh Branch"
