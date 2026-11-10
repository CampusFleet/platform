-- ============================================================================
-- Migration: 20261110_validation_locks_settings.sql
-- Description: Adds independent validation_locks JSONB to transport_settings
-- Allows transport admins to independently toggle:
--   - faceId: Autonomous Face ID Biometrics
--   - dynamicQr: Dynamic Rotating QR Code Pass
--   - rfid: Contactless RFID Smart Cards
--   - staticQr: Static Bus Door QR (Self-Scan)
-- ============================================================================

ALTER TABLE public.transport_settings 
ADD COLUMN IF NOT EXISTS validation_locks JSONB NOT NULL 
DEFAULT '{"faceId":true,"dynamicQr":true,"rfid":true,"staticQr":true}'::jsonb;

UPDATE public.transport_settings
SET validation_locks = '{"faceId":true,"dynamicQr":true,"rfid":true,"staticQr":true}'::jsonb
WHERE validation_locks IS NULL;
