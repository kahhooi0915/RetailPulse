import os
from pathlib import Path
from urllib.parse import urlparse

import pytest
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import Select, WebDriverWait


FRONTEND_URL = os.getenv("RETAILPULSE_FRONTEND_URL", "http://localhost:5173")
BACKEND_URL = os.getenv("RETAILPULSE_BACKEND_URL", "http://localhost:5000")
EVIDENCE_DIR = Path(__file__).resolve().parent / "evidence"

ADMIN_EMAIL = "admin@retailpulse.com"
ADMIN_PASSWORD = "Admin123!"
STAFF_EMAIL = "melaka.staff@retailpulse.com"
STAFF_PASSWORD = "Admin123!"


def pytest_addoption(parser):
    parser.addoption(
        "--headed",
        action="store_true",
        default=False,
        help="Run Chrome with the browser window visible.",
    )


@pytest.fixture
def driver(request):
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    options = Options()
    options.add_argument("--window-size=1440,1000")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")

    if not request.config.getoption("--headed"):
        options.add_argument("--headless=new")

    browser = webdriver.Chrome(options=options)
    browser.implicitly_wait(0)

    yield browser

    browser.quit()


@pytest.fixture
def wait(driver):
    return WebDriverWait(driver, 120)


@pytest.fixture
def admin_api():
    session = requests.Session()
    login_response = session.post(
        f"{BACKEND_URL}/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=10,
    )
    assert login_response.status_code == 200, login_response.text
    return session


@pytest.fixture
def staff_api():
    session = requests.Session()
    login_response = session.post(
        f"{BACKEND_URL}/login",
        json={"email": STAFF_EMAIL, "password": STAFF_PASSWORD},
        timeout=10,
    )
    assert login_response.status_code == 200, login_response.text
    return session


@pytest.fixture
def app(driver, wait):
    return RetailPulseApp(driver, wait)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    if report.when != "call" or report.passed:
        return

    browser = item.funcargs.get("driver")
    if browser:
        safe_name = item.nodeid.replace("::", "__").replace("/", "_").replace("\\", "_")
        browser.save_screenshot(str(EVIDENCE_DIR / f"FAILED_{safe_name}.png"))


def pytest_html_report_title(report):
    report.title = "RetailPulse Automated Functional UI Test Report"


class RetailPulseApp:
    def __init__(self, driver, wait):
        self.driver = driver
        self.wait = wait

    def open(self, path="/"):
        self.driver.get(f"{FRONTEND_URL}{path}")

    def login(self, email, password):
        self.open("/")
        self.type_by_css("input[type='email']", email)
        self.type_by_css("input[type='password']", password)
        self.click_button("Log In")

    def login_as_admin(self):
        self.login(ADMIN_EMAIL, ADMIN_PASSWORD)
        self.wait_for_path("/admin")

    def login_as_staff(self):
        self.login(STAFF_EMAIL, STAFF_PASSWORD)
        self.wait_for_path("/staff")

    def wait_for_path(self, path):
        self.wait.until(lambda driver: urlparse(driver.current_url).path == path)

    def wait_for_text(self, text):
        return self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, f"//*[contains(normalize-space(.), {xpath_literal(text)})]")
            )
        )

    def click_button(self, text):
        button = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//button[.//*[contains(normalize-space(.), %s)] or contains(normalize-space(.), %s)]"
                    % (xpath_literal(text), xpath_literal(text)),
                )
            )
        )
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
        button.click()
        return button

    def click_button_in_section(self, section_title, button_text):
        button = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//section[.//*[contains(normalize-space(.), %s)]]"
                    "//button[contains(normalize-space(.), %s)]"
                    % (xpath_literal(section_title), xpath_literal(button_text)),
                )
            )
        )
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
        button.click()
        return button

    def click_modal_button(self, text):
        button = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//div[contains(@class, 'fixed') and contains(@class, 'inset-0')]"
                    "//button[contains(normalize-space(.), %s)]" % xpath_literal(text),
                )
            )
        )
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", button)
        button.click()
        return button

    def click_text(self, text):
        element = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//button[contains(normalize-space(.), %s)]"
                    "|//a[contains(normalize-space(.), %s)]"
                    "|//*[@role='button' and contains(normalize-space(.), %s)]"
                    % (xpath_literal(text), xpath_literal(text), xpath_literal(text)),
                )
            )
        )
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        element.click()
        return element

    def click_product_card(self, product_name):
        card = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//article[.//h3[normalize-space()=%s]]" % xpath_literal(product_name),
                )
            )
        )
        self.driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", card)
        card.click()
        return card

    def type_by_css(self, selector, value):
        element = self.wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, selector)))
        element.clear()
        element.send_keys(value)
        return element

    def type_by_placeholder(self, placeholder, value):
        element = self.wait.until(
            EC.element_to_be_clickable((By.XPATH, f"//input[@placeholder={xpath_literal(placeholder)}]"))
        )
        element.clear()
        element.send_keys(value)
        return element

    def set_textarea_after_label(self, label, value):
        element = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//*[self::label or self::span][normalize-space()=%s]"
                    "/following::textarea[1]" % xpath_literal(label),
                )
            )
        )
        element.clear()
        element.send_keys(value)
        return element

    def set_input_after_label(self, label, value):
        element = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//*[self::label or self::span][normalize-space()=%s]"
                    "/following::input[1]" % xpath_literal(label),
                )
            )
        )
        element.clear()
        element.send_keys(value)
        return element

    def select_after_label(self, label, visible_text):
        element = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//*[self::label or self::span][normalize-space()=%s]"
                    "/following::select[1]" % xpath_literal(label),
                )
            )
        )
        Select(element).select_by_visible_text(visible_text)
        return element

    def select_option_containing_after_label(self, label, text):
        element = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//*[self::label or self::span][normalize-space()=%s]"
                    "/following::select[1]" % xpath_literal(label),
                )
            )
        )
        select = Select(element)
        for option in select.options:
            if text.lower() in option.text.lower():
                select.select_by_visible_text(option.text)
                return element
        raise AssertionError(f"Could not find option containing {text!r} after label {label!r}")

    def select_option_containing(self, text):
        def select_matching_option(driver):
            for element in driver.find_elements(By.TAG_NAME, "select"):
                if not element.is_displayed() or not element.is_enabled():
                    continue

                select = Select(element)
                for option in select.options:
                    if text.lower() in option.text.lower():
                        select.select_by_visible_text(option.text)
                        return element
            return False

        return self.wait.until(select_matching_option)

    def save_evidence(self, name):
        safe_name = "".join(char if char.isalnum() or char in "-_" else "_" for char in name)
        path = EVIDENCE_DIR / f"{safe_name}.png"
        self.driver.save_screenshot(str(path))
        return path


def xpath_literal(value):
    if "'" not in value:
        return f"'{value}'"
    if '"' not in value:
        return f'"{value}"'
    parts = value.split("'")
    return "concat(%s)" % ', "\'", '.join(f"'{part}'" for part in parts)


def api_get(session, path):
    response = session.get(f"{BACKEND_URL}{path}", timeout=10)
    assert response.status_code == 200, response.text
    return response.json()


def api_post(session, path, payload):
    response = session.post(f"{BACKEND_URL}{path}", json=payload, timeout=10)
    assert response.status_code in (200, 201), response.text
    return response.json()


def api_put(session, path, payload):
    response = session.put(f"{BACKEND_URL}{path}", json=payload, timeout=10)
    assert response.status_code == 200, response.text
    return response.json()


def find_by_name(items, name_key, expected_name):
    for item in items:
        if str(item.get(name_key, "")).strip().lower() == expected_name.lower():
            return item
    raise AssertionError(f"Could not find {expected_name!r} by {name_key!r}")


def get_product(admin_session, product_name):
    return find_by_name(api_get(admin_session, "/admin/products"), "product_name", product_name)


def get_branch(admin_session, branch_name):
    return find_by_name(api_get(admin_session, "/admin/branches"), "branch_name", branch_name)


def get_inventory_quantity(admin_session, product_name, branch_name):
    inventory = api_get(admin_session, "/admin/inventory")
    for item in inventory:
        if (
            str(item.get("product_name", "")).lower() == product_name.lower()
            and str(item.get("branch_name", "")).lower() == branch_name.lower()
        ):
            return int(item["quantity_in_stock"])
    raise AssertionError(f"No inventory row for {product_name!r} at {branch_name!r}")


def set_inventory_quantity(admin_session, product_name, branch_name, quantity):
    product = get_product(admin_session, product_name)
    branch = get_branch(admin_session, branch_name)
    api_put(
        admin_session,
        f"/admin/inventory/{product['product_id']}/{branch['branch_id']}",
        {"quantity_in_stock": quantity},
    )


def latest_transfer_matching(admin_session, from_branch, to_branch, product_name, quantity=None):
    transfers = api_get(admin_session, "/stock-transfers")
    for transfer in sorted(transfers, key=lambda item: item["transfer_id"], reverse=True):
        if (
            transfer.get("source_branch_name") == from_branch
            and transfer.get("destination_branch_name") == to_branch
        ):
            items_response = admin_session.get(
                f"{BACKEND_URL}/stock-transfer/{transfer['transfer_id']}/items",
                timeout=10,
            )
            assert items_response.status_code == 200, items_response.text
            items = items_response.json()
            if any(
                item.get("product_name") == product_name
                and (quantity is None or int(item.get("quantity", 0)) == quantity)
                for item in items
            ):
                return transfer
    raise AssertionError(f"No matching transfer found for {product_name} from {from_branch} to {to_branch}")


def wait_for_transfer_matching(admin_session, from_branch, to_branch, product_name, quantity=None, status=None):
    def lookup(_driver):
        try:
            transfer = latest_transfer_matching(admin_session, from_branch, to_branch, product_name, quantity)
        except AssertionError:
            return False
        if status and transfer.get("status") != status:
            return False
        return transfer

    return WebDriverWait(None, 15).until(lambda _ignored: lookup(_ignored))
