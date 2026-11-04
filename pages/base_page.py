from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException


class BasePage:
    """Kelas dasar yang diwarisi oleh seluruh halaman Page Object."""

    def __init__(self, driver):
        self.driver = driver
        # Explicit wait default 10 detik
        self.wait = WebDriverWait(self.driver, 10)

    def find_element(self, locator):
        """Mencari elemen tunggal dengan explicit wait visibility."""
        try:
            return self.wait.until(EC.visibility_of_element_located(locator))
        except TimeoutException:
            raise TimeoutException(
                f"Elemen dengan lokator {locator} tidak ditemukan dalam waktu tunggu."
            )

    def click(self, locator):
        """Menunggu elemen dapat diklik lalu melakukan aksi klik."""
        element = self.wait.until(EC.element_to_be_clickable(locator))
        element.click()

    def type_text(self, locator, text):
        """Mengisi teks ke input field setelah membersihkan teks sebelumnya."""
        element = self.find_element(locator)
        element.clear()
        element.send_keys(text)

    def get_text(self, locator):
        """Mengambil teks visual dari suatu elemen web."""
        return self.find_element(locator).text

    def get_current_url(self):
        """Mendapatkan alamat URL browser saat ini."""
        return self.driver.current_url