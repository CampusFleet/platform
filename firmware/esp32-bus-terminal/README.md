# CampusFleet IoT Bus RFID Terminal Firmware

Firmware for ESP32 microcontrollers paired with MFRC522 (RC522) RFID readers installed on physical campus buses.

## 📌 Wiring Diagram (ESP32 $\leftrightarrow$ MFRC522)

| MFRC522 Pin | ESP32 GPIO | Description |
|:---|:---|:---|
| **3.3V** | **3V3** | Power (Do NOT connect to 5V!) |
| **GND** | **GND** | Ground |
| **RST** | **GPIO 22** | Reset Pin |
| **SDA (SS)** | **GPIO 5** | SPI Chip Select |
| **MOSI** | **GPIO 23** | SPI MOSI |
| **MISO** | **GPIO 19** | SPI MISO |
| **SCK** | **GPIO 18** | SPI Clock |
| **IRQ** | *Unconnected* | Not used |
| **Built-in LED** | **GPIO 2** | Blue LED Indicator |

---

## 🚀 Setup & Flashing Instructions

1. **Arduino IDE / PlatformIO**:
   - Install **ESP32 Board Package** by Espressif (`v2.0.x` or `v3.x`).
   - Install Library: **`MFRC522` by GithubCommunity / miguelbalboa** (v1.4.11+).
2. **Configuration**:
   - Open `esp32-bus-terminal.ino`.
   - Update Wi-Fi or Bus 4G Mobile Hotspot credentials:
     ```cpp
     const char* ssid = "CAMPUS_BUS_HOTSPOT";
     const char* password = "SECURE_PASSWORD";
     ```
   - Target API Endpoint:
     ```cpp
     const char* serverUrl = "https://campusfleet.vercel.app/api/telematics/rfid";
     ```
3. **Flashing**:
   - Select Board: **ESP32 Dev Module**.
   - Baud Rate: **115200**.
   - Press **Upload**.

---

## ⚡ How It Works in CampusFleet

1. **Self-Identification via Hardware MAC Address**:
   - The device reads its physical factory MAC address (`WiFi.macAddress()`, e.g. `24:6F:28:XX:XX:XX`).
   - No hardcoded bus IDs are needed in the C++ code! Transport Admins map this MAC address to any bus directly on the web dashboard: [`/transport-admin/esp32`](https://campusfleet.vercel.app/transport-admin/esp32).

2. **20-Second Heartbeat (Redis Fast Path)**:
   - Sends lightweight payload `{"deviceId":"..."}` every 20s.
   - Updates Upstash Redis cache-aside with a 60-second sliding TTL, giving real-time "Online / Active" status on the Transport Admin cockpit with **0 SQL load**.

3. **Student Tap Verification**:
   - Tapping an RFID smart card transmits `{"deviceId":"...", "rfidCardId":"2184F51D"}`.
   - Flashes the blue LED 3 times on successful attendance unlock.
