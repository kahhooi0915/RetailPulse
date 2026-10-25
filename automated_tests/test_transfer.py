import requests

from conftest import (
    BACKEND_URL,
    api_get,
    get_branch,
    get_product,
    latest_transfer_matching,
    set_inventory_quantity,
    wait_for_transfer_matching,
)


def test_tc8_create_stock_transfer_pending_source_review(app, admin_api):
    product_name = "Coca Cola 250ML"
    from_branch = "Melaka Sentral Branch"
    to_branch = "Ayer Keroh Branch"

    set_inventory_quantity(admin_api, product_name, from_branch, 100)

    app.login("ayer.manager@retailpulse.com", "Admin123!")
    app.wait_for_path("/manager-dashboard")
    app.open("/manager-stock-transfer")
    app.wait_for_text("Stock Transfer Management")
    _clear_active_matching_transfers(admin_api, from_branch, to_branch, product_name, 5)
    app.select_option_containing_after_label("Source", from_branch)
    app.select_option_containing_after_label("Product 1", product_name)
    app.set_input_after_label("Quantity", "5")
    app.click_button("Request Transfer")
    transfer = wait_for_transfer_matching(admin_api, from_branch, to_branch, product_name, quantity=5, status="PENDING_SOURCE")
    app.wait_for_text(transfer["transfer_code"])
    app.save_evidence("TC8_stock_transfer_created")

    assert transfer["status"] == "PENDING_SOURCE"


def test_tc9_approve_stock_transfer_created_by_tc8(app, admin_api):
    product_name = "Coca Cola 250ML"
    from_branch = "Melaka Sentral Branch"
    to_branch = "Ayer Keroh Branch"
    transfer = _ensure_pending_transfer(admin_api, from_branch, to_branch, product_name, 5)

    app.login("melaka.manager@retailpulse.com", "Admin123!")
    app.wait_for_path("/manager-dashboard")
    app.open("/manager-stock-transfer")
    app.wait_for_text("Staff Requests To Review")
    app.wait_for_text(transfer["transfer_code"])
    app.click_button("Approve")
    app.wait_for_text("Transfer approved successfully")
    app.save_evidence("TC9_stock_transfer_approved")

    updated = latest_transfer_matching(admin_api, from_branch, to_branch, product_name, quantity=5)
    assert updated["transfer_id"] == transfer["transfer_id"]
    assert updated["status"] == "APPROVED"


def _ensure_pending_transfer(admin_api, from_branch, to_branch, product_name, quantity):
    _clear_active_matching_transfers(admin_api, from_branch, to_branch, product_name, quantity)
    try:
        transfer = latest_transfer_matching(admin_api, from_branch, to_branch, product_name, quantity)
        if transfer["status"] == "PENDING_SOURCE":
            return transfer
    except AssertionError:
        pass

    product = get_product(admin_api, product_name)
    source = get_branch(admin_api, from_branch)
    destination = get_branch(admin_api, to_branch)
    set_inventory_quantity(admin_api, product_name, from_branch, 100)

    response = admin_api.post(
        f"{BACKEND_URL}/admin/stock-transfer/request",
        json={
            "from_branch_id": source["branch_id"],
            "to_branch_id": destination["branch_id"],
            "items": [{"product_id": product["product_id"], "quantity": quantity}],
        },
        timeout=10,
    )
    assert response.status_code in (201, 409), response.text

    transfers = api_get(admin_api, "/stock-transfers")
    created_id = response.json().get("transfer_id")
    if created_id:
        return next(transfer for transfer in transfers if transfer["transfer_id"] == created_id)

    return latest_transfer_matching(admin_api, from_branch, to_branch, product_name, quantity)


def _clear_active_matching_transfers(admin_api, from_branch, to_branch, product_name, quantity):
    for transfer in api_get(admin_api, "/stock-transfers"):
        if (
            transfer.get("source_branch_name") == from_branch
            and transfer.get("destination_branch_name") == to_branch
            and transfer.get("status") in ("PENDING_SOURCE", "APPROVED")
        ):
            items = admin_api.get(
                f"{BACKEND_URL}/stock-transfer/{transfer['transfer_id']}/items",
                timeout=10,
            )
            assert items.status_code == 200, items.text
            if any(
                item.get("product_name") == product_name and int(item.get("quantity", 0)) == quantity
                for item in items.json()
            ):
                if transfer.get("status") == "PENDING_SOURCE":
                    source_manager = _login_api("melaka.manager@retailpulse.com", "Admin123!")
                    approved = source_manager.put(
                        f"{BACKEND_URL}/manager/stock-transfer/{transfer['transfer_id']}/approve",
                        json={},
                        timeout=10,
                    )
                    assert approved.status_code == 200, approved.text

                destination_manager = _login_api("ayer.manager@retailpulse.com", "Admin123!")
                received = destination_manager.put(
                    f"{BACKEND_URL}/manager/stock-transfer/{transfer['transfer_id']}/receive",
                    json={},
                    timeout=10,
                )
                assert received.status_code == 200, received.text


def _login_api(email, password):
    session = requests.Session()
    response = session.post(
        f"{BACKEND_URL}/login",
        json={"email": email, "password": password},
        timeout=10,
    )
    assert response.status_code == 200, response.text
    return session
