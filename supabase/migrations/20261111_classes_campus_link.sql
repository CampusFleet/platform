-- ==============================================================================
-- Campus → Course → Branch → Specialization → Semester → Section
-- Links each class (specialization + semester + section) to the campus that runs it.
-- All existing classes belong to GEHU Bhimtal.
-- ==============================================================================
BEGIN;

-- 1. Column + backfill
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS campus_id TEXT;
UPDATE public.classes SET campus_id = 'campus-gehu-bhimtal' WHERE campus_id IS NULL;
ALTER TABLE public.classes ALTER COLUMN campus_id SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.classes
    ADD CONSTRAINT fk_classes_campus FOREIGN KEY (campus_id) REFERENCES public.campuses(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_classes_campus ON public.classes (campus_id);

-- 2. A section is unique per campus (the same "B.Tech CSE 4th Sem A" can exist at two campuses)
DROP INDEX IF EXISTS public.uq_classes_spec_sem_section;
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_campus_spec_sem_section
  ON public.classes (campus_id, specialization_id, semester_num, section_id);

-- 3. Expose campus on the expanded view (new columns appended at the end)
CREATE OR REPLACE VIEW public.v_classes_expanded AS
 SELECT c.id,
    c.name,
    c.semester,
    c.semester_num,
        CASE
            WHEN c.year_num IS NOT NULL THEN c.year_num::text ||
            CASE
                WHEN c.year_num = 1 THEN 'st Year'::text
                WHEN c.year_num = 2 THEN 'nd Year'::text
                WHEN c.year_num = 3 THEN 'rd Year'::text
                ELSE 'th Year'::text
            END
            ELSE NULL::text
        END AS year,
    c.year_num,
    c.section_id,
    sec.code AS section,
    sec.code AS section_code,
    sec.name AS section_name,
    c.is_active,
    '{}'::jsonb AS shift_schedule,
    c.created_at,
    COALESCE(ac.short_name, ac.code) AS course,
    COALESCE(ab.name, ac.name) AS department,
    ab.name AS branch,
    COALESCE(asp.short_label, asp.name) AS specialization,
    asp.id AS specialization_id,
    asp.code AS specialization_code,
    asp.name AS specialization_name,
    asp.short_label AS specialization_label,
    asp.is_default AS is_default_specialization,
    ab.id AS branch_id,
    ab.code AS branch_code,
    ab.name AS branch_name,
    ac.id AS course_id,
    ac.code AS course_code,
    ac.name AS course_title,
    ac.short_name AS course_name,
    ac.degree_level,
    ac.total_years,
    ac.total_semesters,
    c.campus_id,
    cp.name AS campus_name,
    cp.code AS campus_code
   FROM classes c
     LEFT JOIN academic_sections sec ON sec.id = c.section_id
     LEFT JOIN academic_specializations asp ON asp.id = c.specialization_id
     LEFT JOIN academic_branches ab ON ab.id = asp.branch_id
     LEFT JOIN academic_courses ac ON ac.id = ab.course_id
     LEFT JOIN campuses cp ON cp.id = c.campus_id;

-- 4. A student's campus follows their class (single source of truth: classes.campus_id)
CREATE OR REPLACE FUNCTION public.fn_sync_student_class_campus()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
      v_campus_name TEXT;
      v_semester TEXT;
      v_class_campus TEXT;
    BEGIN
      IF NEW.class_id IS NOT NULL THEN
        SELECT COALESCE(semester_num::text, semester), campus_id
          INTO v_semester, v_class_campus
          FROM public.classes WHERE id = NEW.class_id LIMIT 1;
        IF v_semester IS NOT NULL THEN
          NEW.semester = v_semester;
        END IF;
        IF v_class_campus IS NOT NULL THEN
          NEW.campus_id = v_class_campus;
        END IF;
      END IF;
      IF NEW.campus_id IS NOT NULL THEN
        SELECT name INTO v_campus_name FROM public.campuses WHERE id = NEW.campus_id LIMIT 1;
        IF v_campus_name IS NOT NULL THEN
          NEW.campus = v_campus_name;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;

COMMIT;
