"use client";

import React, { useEffect, useMemo } from "react";
import { UserRound } from "lucide-react";
import { Card, CardHeader, Field, Input, Select } from "@/components/ui";
import { ordinal, phoneError, semesterOf, type AcademicData, type CampusOption, type OnboardingForm } from "./form";

/**
 * Section 1: personal details and class. The class picker is a cascade
 * (course → branch → specialization → semester → section) over real class rows; a section is only
 * offered when a class exists for that specialization, semester and campus.
 */
export function DetailsSection({
  form,
  set,
  campuses,
  academic,
  showErrors,
}: {
  form: OnboardingForm;
  set: (patch: Partial<OnboardingForm>) => void;
  campuses: CampusOption[];
  academic: AcademicData;
  showErrors: boolean;
}) {
  const branches = useMemo(() => academic.branches.filter((b) => b.course_id === form.courseId), [academic.branches, form.courseId]);
  const specs = useMemo(() => academic.specializations.filter((s) => s.branch_id === form.branchId), [academic.specializations, form.branchId]);
  const course = academic.courses.find((c) => c.id === form.courseId);
  const semesters = useMemo(() => Array.from({ length: course?.total_semesters || 8 }, (_, i) => i + 1), [course?.total_semesters]);
  const sections = useMemo(
    () =>
      academic.classes
        .filter(
          (c) =>
            c.specialization_id === form.specializationId &&
            String(semesterOf(c)) === form.semester &&
            c.is_active !== false &&
            (!form.campusId || !c.campus_id || c.campus_id === form.campusId)
        )
        .sort((a, b) => String(a.section).localeCompare(String(b.section))),
    [academic.classes, form.specializationId, form.semester, form.campusId]
  );

  // One specialization (or a default one) needs no choice.
  useEffect(() => {
    if (!form.branchId || form.specializationId || specs.length === 0) return;
    const only = specs.length === 1 ? specs[0] : specs.find((s) => s.is_default);
    if (only) set({ specializationId: only.id });
  }, [form.branchId, form.specializationId, specs, set]);

  // Drop a class that no longer matches the cascade (e.g. after changing campus).
  useEffect(() => {
    if (form.classId && academic.classes.length > 0 && !sections.some((c) => c.id === form.classId)) set({ classId: "" });
  }, [form.classId, sections, academic.classes.length, set]);

  const err = (bad: boolean, msg = "Required") => (showErrors && bad ? msg : null);

  return (
    <Card>
      <CardHeader icon={<UserRound className="w-5 h-5" />} title="1. Your details" subtitle="As on your university ID card" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name" error={err(form.fullName.trim().length < 2)}>
          <Input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" maxLength={100} />
        </Field>
        <Field label="Phone" error={showErrors ? phoneError(form.phone) : null}>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} />
        </Field>
        <Field label="University ID" hint="Optional. Filled from your college email when possible.">
          <Input value={form.studentIdCode} onChange={(e) => set({ studentIdCode: e.target.value.toUpperCase() })} maxLength={30} autoCapitalize="characters" />
        </Field>
        <Field label="Campus" error={err(!form.campusId)}>
          <Select value={form.campusId} onChange={(e) => set({ campusId: e.target.value, classId: "" })}>
            <option value="">Choose campus</option>
            {campuses.map((c) => (
              <option key={c.id} value={c.id}>{c.name || "Campus"}</option>
            ))}
          </Select>
        </Field>
        <Field label="Course">
          <Select value={form.courseId} onChange={(e) => set({ courseId: e.target.value, branchId: "", specializationId: "", semester: "", classId: "" })}>
            <option value="">Choose course</option>
            {academic.courses.map((c) => (
              <option key={c.id} value={c.id}>{c.short_name ? `${c.short_name} (${c.name})` : c.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Branch">
          <Select value={form.branchId} disabled={!form.courseId} onChange={(e) => set({ branchId: e.target.value, specializationId: "", classId: "" })}>
            <option value="">Choose branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.code ? `${b.code} (${b.name})` : b.name}</option>
            ))}
          </Select>
        </Field>
        {specs.length > 1 && (
          <Field label="Specialization">
            <Select value={form.specializationId} onChange={(e) => set({ specializationId: e.target.value, classId: "" })}>
              <option value="">Choose specialization</option>
              {specs.map((s) => (
                <option key={s.id} value={s.id}>{s.short_label ? `${s.short_label} (${s.name})` : s.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Semester">
          <Select value={form.semester} disabled={!form.specializationId} onChange={(e) => set({ semester: e.target.value, classId: "" })}>
            <option value="">Choose semester</option>
            {semesters.map((n) => (
              <option key={n} value={String(n)}>{ordinal(n)} semester</option>
            ))}
          </Select>
        </Field>
        <Field
          label="Section"
          error={err(!form.classId)}
          hint={form.specializationId && form.semester && sections.length === 0 ? "No sections are set up for this semester yet. Ask your department." : undefined}
        >
          <Select value={form.classId} disabled={sections.length === 0} onChange={(e) => set({ classId: e.target.value })}>
            <option value="">Choose section</option>
            {sections.map((c) => (
              <option key={c.id} value={c.id}>{c.section_name || `Section ${c.section}`}</option>
            ))}
          </Select>
        </Field>
        <Field label="Emergency contact name" error={err(form.emergencyName.trim().length < 2)}>
          <Input value={form.emergencyName} onChange={(e) => set({ emergencyName: e.target.value })} maxLength={100} />
        </Field>
        <Field label="Emergency contact phone" error={showErrors ? phoneError(form.emergencyPhone) : null}>
          <Input value={form.emergencyPhone} onChange={(e) => set({ emergencyPhone: e.target.value })} type="tel" inputMode="tel" maxLength={16} />
        </Field>
      </div>
    </Card>
  );
}
