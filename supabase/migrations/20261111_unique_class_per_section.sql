-- A class is exactly one (specialization, semester, section). Prevents duplicate
-- section rows that made different specializations appear to share sections.
CREATE UNIQUE INDEX IF NOT EXISTS uq_classes_spec_sem_section
  ON public.classes (specialization_id, semester_num, section_id);
