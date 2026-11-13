-- New students were silently given semester '5th'. Leave it empty until the student enters it.
-- Existing rows are not changed.
ALTER TABLE public.students ALTER COLUMN semester DROP DEFAULT;
