# RetailPulse Automated Functional/UI Tests

These tests use Python, pytest, Selenium WebDriver, and pytest-html. They are automated functional/UI tests, not unit tests.

## Install Test Packages

From the repository root:

```powershell
pip install -r requirements/test-requirements.txt
```

Selenium 4 uses Selenium Manager to locate or download the correct ChromeDriver. Install Google Chrome if it is not already installed.

## Prepare Demo Data

The project already includes a repeatable functional-test reset script:

```powershell
cd backend
venv\Scripts\activate
python reset_functional_test_demo_data.py
```

This prepares accounts such as `admin@retailpulse.com`, `melaka.staff@retailpulse.com`, `melaka.manager@retailpulse.com`, and `ayer.manager@retailpulse.com` with password `Admin123!`.

## Run The Application

Start the Flask backend in one terminal:

```powershell
cd backend
venv\Scripts\activate
python app.py
```

Start the React/Vite frontend in another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The tests default to:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`

Override them if needed:

```powershell
$env:RETAILPULSE_FRONTEND_URL="http://localhost:5173"
$env:RETAILPULSE_BACKEND_URL="http://localhost:5000"
```

## Run Tests With HTML Report

From the repository root:

```powershell
pytest automated_tests -v --html=automated_test_report.html --self-contained-html
```

Run with a visible browser:

```powershell
pytest automated_tests -v --headed --html=automated_test_report.html --self-contained-html
```

Screenshots are saved in `automated_tests/evidence/`. Failed tests automatically capture a `FAILED_*.png` screenshot.

## Covered Functional Test Cases

- TC01 valid admin login
- TC02 invalid password
- TC03 add branch staff user
- TC04 add product
- TC05 add category
- TC06 update inventory quantity
- TC07 record sale and reduce inventory
- TC08 create stock transfer request
- TC09 approve stock transfer request
- TC10 create purchase order
- TC11 add branch
- TC12 view sales monitoring
- TC13 generate sales report
- TC14 generate sales forecast
- TC15 branch staff RBAC restriction
