-- ═══════════════════════════════════════════════════════════════════════════════
-- VIEW: payment_submissions_full
-- Enriches payment submissions with student photo, department, semester,
-- route, stop, and Razorpay gateway detection for admin reconciliation.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.payment_submissions_full AS
SELECT
    ps.id,
    ps.student_id,
    ps.student_name,
    ps.zone_code,
    ps.amount,
    ps.installment_no,
    ps.total_installments,
    ps.receipt_url,
    ps.transaction_id,
    ps.auto_detected,
    ps.status,
    ps.reviewed_by,
    ps.reviewed_at,
    ps.rejection_reason,
    ps.created_at,
    ps.ocr_full_text,
    ps.scanned_amount,
    ps.verified_amount,
    ps.receipt_number,
    s.student_id_code,
    s.full_name,
    s.email AS student_email,
    s.phone AS student_phone,
    s.department,
    s.semester,
    s.photo_url,
    s.total_fee_due,
    s.total_fee_paid,
    s.payment_status AS student_payment_status,
    s.has_active_subscription,
    s.primary_stop_id,
    st.name AS primary_stop_name,
    s.primary_route_id,
    r.name AS primary_route_name,
    r.code AS primary_route_code,
    CASE 
      WHEN ps.transaction_id LIKE 'pay_%' THEN 'RAZORPAY_AUTO'
      WHEN ps.auto_detected = true THEN 'GATEWAY_SYNC'
      ELSE 'MANUAL_VERIFICATION'
    END AS gateway_source
FROM public.payment_submissions ps
LEFT JOIN public.students_full s ON s.id = ps.student_id
LEFT JOIN public.stops st ON st.id = s.primary_stop_id
LEFT JOIN public.routes r ON r.id = s.primary_route_id;
