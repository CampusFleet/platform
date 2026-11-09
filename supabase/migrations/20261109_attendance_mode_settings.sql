-- ============================================================================
-- Migration: 20261109_attendance_mode_settings.sql
-- Description: Adds institutional attendance_mode to transport_settings
-- Supported Modes:
--   - 'FACE_ID': Autonomous dual-camera gate telematics (Default)
--   - 'DYNAMIC_QR': Time-based rotating QR code pass on student screen
--   - 'RFID': Contactless RFID / NFC smart cards
--   - 'STATIC_QR': Printable bus/seat QR code with GPS geofencing
--   - 'ALL': Multi-modal hybrid (all validation mechanisms active)
-- ============================================================================

ALTER TABLE transport_settings 
ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'FACE_ID'
CHECK (attendance_mode IN ('FACE_ID', 'DYNAMIC_QR', 'RFID', 'STATIC_QR', 'ALL'));

-- Ensure existing rows have attendance_mode set to 'FACE_ID' if null
UPDATE transport_settings 
SET attendance_mode = 'FACE_ID' 
WHERE attendance_mode IS NULL;
