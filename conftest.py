import pytest
from selenium import webdriver
from selenium.webdriver.chrome.options import Options


@pytest.fixture(scope="function")
def driver():
    """Inisialisasi browser Google Chrome untuk setiap fungsi pengujian."""
    options = Options()
    # Menghapus logging berlebih di terminal
    options.add_argument("--log-level=3")
    options.add_argument("--start-maximized")
    # Opsi headless jika ingin berjalan di CI/CD atau tanpa GUI:
    # options.add_argument("--headless=new")

    driver = webdriver.Chrome(options=options)
    yield driver

    # Teardown: selalu tutup browser setelah tes selesai
    driver.quit()