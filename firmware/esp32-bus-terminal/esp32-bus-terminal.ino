#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <SPI.h>
#include <MFRC522.h>

// ======================== CONFIGURATION ========================
// 1. Wi-Fi / Hotspot credentials
const char* ssid = "YOUR_WIFI_OR_HOTSPOT_NAME";
const char* password = "YOUR_WIFI_PASSWORD";

// 2. Production CampusFleet API Endpoint
const char* serverUrl = "https://campusfleet.vercel.app/api/telematics/rfid";

// 3. Pin definitions
#define SS_PIN  5   // SDA pin
#define RST_PIN 22  // RST pin
#define LED_PIN 2   // Built-in blue LED on ESP32

MFRC522 rfid(SS_PIN, RST_PIN);

// Debounce: prevent same card from triggering repeatedly within 5 seconds
String lastCardUid = "";
unsigned long lastTapTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 5000;

// Device Identity: Resolved automatically from ESP32 hardware MAC address
String deviceId = "";

// Heartbeat timer: pings Redis every 20 seconds to keep live status active
unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 20000;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n--- CampusFleet IoT Bus RFID Terminal ---");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Initialize SPI bus & MFRC522 module
  SPI.begin();
  rfid.PCD_Init();
  delay(100);

  // Check RC522 status
  byte v = rfid.PCD_ReadRegister(rfid.VersionReg);
  Serial.print("MFRC522 Firmware Version: 0x");
  Serial.println(v, HEX);
  if (v == 0x00 || v == 0xFF) {
    Serial.println("❌ WARNING: RFID RC522 communication failed! Check your jumper wires!");
  } else {
    Serial.println("✅ RFID RC522 Reader initialized and ready.");
  }

  // Connect to Wi-Fi and retrieve unique hardware MAC address
  connectToWiFi();
  deviceId = WiFi.macAddress();
  Serial.println("🏷️ ESP32 Hardware Device ID: " + deviceId);

  // Send initial startup heartbeat
  sendHeartbeatPing();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  // 1. Automatic Heartbeat Ping: keeps dashboard "Live Active" in Redis
  unsigned long now = millis();
  if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatTime = now;
    sendHeartbeatPing();
  }

  // 2. Check for physical RFID card tap
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  // Extract UID in uppercase Hex (e.g. "2184F51D")
  String cardUid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(rfid.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();

  if (cardUid == lastCardUid && (now - lastTapTime < DEBOUNCE_DELAY_MS)) {
    Serial.println("⏳ Duplicate tap ignored: " + cardUid);
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }

  lastCardUid = cardUid;
  lastTapTime = now;

  Serial.println("\n💳 Physical RFID Card Tapped!");
  Serial.println("UID: " + cardUid);

  sendRfidTapToCampusFleet(cardUid);

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

void connectToWiFi() {
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 25) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n❌ Wi-Fi Connection failed. Will retry on next loop.");
  }
}

// Lightweight heartbeat (pure Redis in-memory write, 0 PostgreSQL queries)
void sendHeartbeatPing() {
  if (WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  http.begin(client, serverUrl);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"deviceId\":\"" + deviceId + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    Serial.println("💓 Heartbeat ping OK (Redis updated)");
  }
  http.end();
}

// Attendance tap verification
void sendRfidTapToCampusFleet(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Cannot send RFID: Wi-Fi offline");
    return;
  }

  digitalWrite(LED_PIN, HIGH);

  WiFiClientSecure client;
  client.setInsecure(); // Allows Vercel HTTPS

  HTTPClient http;
  http.begin(client, serverUrl);
  http.addHeader("Content-Type", "application/json");

  // Dynamic payload: sends hardware MAC address + card UID
  String payload = "{\"deviceId\":\"" + deviceId + "\",\"rfidCardId\":\"" + uid + "\"}";
  Serial.println("POST " + String(serverUrl));
  Serial.println("Payload: " + payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("Response [%d]: %s\n", httpCode, response.c_str());

    if (httpCode == 200 || httpCode == 201) {
      Serial.println("🎉 SUCCESS: Attendance verified or card registered!");
      for (int i = 0; i < 3; i++) {
        digitalWrite(LED_PIN, LOW); delay(80);
        digitalWrite(LED_PIN, HIGH); delay(80);
      }
    } else if (httpCode == 404) {
      Serial.println("⚠️ CARD UNREGISTERED: Map this UID in Student Desk.");
    } else if (httpCode == 400) {
      Serial.println("⚠️ UNMAPPED ESP32: Pair this MAC in Transport Admin.");
    }
  } else {
    Serial.printf("❌ HTTPS Request failed: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  digitalWrite(LED_PIN, LOW);
}
