"use client";

import React, { useEffect, useMemo } from "react";
import { UserRound } from "lucide-react";
import { Card, CardHeader, Field, Input } from "@/components/ui";
import { CustomDropdown } from "@/components/common/CustomDropdown";
import { ordinal, phoneError, semesterOf, type AcademicData, type CampusOption, type OnboardingForm } from "./form";

/** The app's common dropdown, styled like the other onboarding fields (rounded, blue focus). */
function Dropdown({
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <CustomDropdown
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      buttonClassName="!px-4 !py-3 !rounded-xl !border-gray-200 dark:!border-zinc-700 dark:!bg-zinc-900 focus:!border-blue-500 focus:ring-2 focus:ring-blue-500/30"
      menuClassName="!rounded-xl dark:!bg-zinc-900 dark:!border-zinc-700"
    />
  );
}

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

  // The student always sees and confirms their specialization; it is only pre-filled when the
  // branch has exactly one.
  useEffect(() => {
    if (!form.branchId || form.specializationId || specs.length !== 1) return;
    set({ specializationId: specs[0].id });
  }, [form.branchId, form.specializationId, specs, set]);

  // Drop a class that no longer matches the cascade (e.g. after changing campus).
  useEffect(() => {
    if (form.classId && academic.classes.length > 0 && !sections.some((c) => c.id === form.classId)) set({ classId: "" });
  }, [form.classId, sections, academic.classes.length, set]);

  const err = (bad: boolean, msg = "Required") => (showErrors && bad ? msg : null);

  return (
    <Card>
      <CardHeader icon={<UserRound className="w-5 h-5" />} title="1. Your details" subtitle="As on your student ID card" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Full name" error={err(form.fullName.trim().length < 2)}>
          <Input value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} autoComplete="name" maxLength={100} />
        </Field>
        <Field label="Phone" error={showErrors ? phoneError(form.phone) : null}>
          <Input value={form.phone} onChange={(e) => set({ phone: e.target.value })} type="tel" inputMode="tel" autoComplete="tel" maxLength={16} />
        </Field>
        <Field label="Student ID" hint="Optional. Filled from your college email when possible.">
          <Input value={form.studentIdCode} onChange={(e) => set({ studentIdCode: e.target.value.toUpperCase() })} maxLength={30} autoCapitalize="characters" />
        </Field>
        <Field label="Campus" error={err(!form.campusId)}>
          <Dropdown
            value={form.campusId}
            onChange={(v) => set({ campusId: v, classId: "" })}
            placeholder="Choose campus"
            options={campuses.map((c) => ({ value: c.id, label: c.name || "Campus" }))}
          />
        </Field>
        <Field label="Course" error={err(!form.courseId)}>
          <Dropdown
            value={form.courseId}
            onChange={(v) => set({ courseId: v, branchId: "", specializationId: "", semester: "", classId: "" })}
            placeholder="Choose course"
            options={academic.courses.map((c) => ({ value: c.id, label: c.short_name ? `${c.short_name} (${c.name})` : c.name }))}
          />
        </Field>
        <Field label="Branch" error={err(!form.branchId)}>
          <Dropdown
            value={form.branchId}
            disabled={!form.courseId}
            onChange={(v) => set({ branchId: v, specializationId: "", semester: "", classId: "" })}
            placeholder={form.courseId ? "Choose branch" : "Choose a course first"}
            options={branches.map((b) => ({ value: b.id, label: b.code ? `${b.code} (${b.name})` : b.name }))}
          />
        </Field>
        <Field
          label="Specialization"
          error={err(!form.specializationId)}
          hint={form.branchId && specs.length === 0 ? "No specializations are set up for this branch yet. Ask your department." : undefined}
        >
          <Dropdown
            value={form.specializationId}
            disabled={!form.branchId || specs.length === 0}
            onChange={(v) => set({ specializationId: v, semester: "", classId: "" })}
            placeholder={form.branchId ? "Choose specialization" : "Choose a branch first"}
            options={specs.map((sp) => ({ value: sp.id, label: sp.short_label ? `${sp.short_label} (${sp.name})` : sp.name }))}
          />
        </Field>
        <Field label="Semester" error={err(!form.semester)}>
          <Dropdown
            value={form.semester}
            disabled={!form.specializationId}
            onChange={(v) => set({ semester: v, classId: "" })}
            placeholder={form.specializationId ? "Choose semester" : "Choose a specialization first"}
            options={semesters.map((n) => ({ value: String(n), label: `${ordinal(n)} semester` }))}
          />
        </Field>
        <Field
          label="Section"
          error={err(!form.classId)}
          hint={form.specializationId && form.semester && sections.length === 0 ? "No sections are set up for this semester yet. Ask your department." : undefined}
        >
          <Dropdown
            value={form.classId}
            disabled={sections.length === 0}
            onChange={(v) => set({ classId: v })}
            placeholder="Choose section"
            options={sections.map((c) => ({ value: c.id, label: c.section_name || `Section ${c.section}` }))}
          />
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
