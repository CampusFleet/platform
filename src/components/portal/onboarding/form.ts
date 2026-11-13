/** Shared state for the single-page onboarding form (src/app/portal/onboarding/page.tsx). */

export interface HomeLocation {
  latitude: number;
  longitude: number;
  address: string;
}

export interface OnboardingForm {
  fullName: string;
  phone: string;
  studentIdCode: string;
  campusId: string;
  courseId: string;
  branchId: string;
  specializationId: string;
  /** Semester number as a string ("1".."12"), "" when not chosen. */
  semester: string;
  classId: string;
  emergencyName: string;
  emergencyPhone: string;
  home: HomeLocation | null;
  stopId: string;
}

export const EMPTY_FORM: OnboardingForm = {
  fullName: "",
  phone: "",
  studentIdCode: "",
  campusId: "",
  courseId: "",
  branchId: "",
  specializationId: "",
  semester: "",
  classId: "",
  emergencyName: "",
  emergencyPhone: "",
  home: null,
  stopId: "",
};

export interface CampusOption {
  id: string;
  name: string | null;
  isPrimary: boolean;
  latitude: number;
  longitude: number;
}

/** Same shape as lib/students/pickup.ts PickupOption (kept separate so this file stays client-safe). */
export interface PickupOption {
  stopId: string;
  name: string;
  landmark: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  walkMins: number;
  zoneId: string | null;
  zoneCode: string | null;
  zoneName: string | null;
  semesterFee: number | null;
  routeId: string | null;
  routeName: string | null;
}

export interface AcademicData {
  courses: { id: string; name: string; short_name: string | null; total_semesters: number | null }[];
  branches: { id: string; course_id: string | null; code: string | null; name: string }[];
  specializations: { id: string; branch_id: string | null; name: string; short_label: string | null; is_default: boolean | null }[];
  classes: {
    id: string;
    name: string | null;
    campus_id: string | null;
    course_id: string | null;
    branch_id: string | null;
    specialization_id: string | null;
    semester: string | null;
    semester_num: number | null;
    section: string | null;
    section_name: string | null;
    is_active: boolean | null;
  }[];
}

const PHONE = /^\+?[0-9][0-9\s-]{8,14}$/;

export function phoneError(v: string): string | null {
  if (!v.trim()) return "Required";
  return PHONE.test(v.trim()) ? null : "Enter a valid phone number";
}

export function semesterOf(c: { semester_num: number | null; semester: string | null }): number | null {
  if (c.semester_num) return c.semester_num;
  const n = parseInt(String(c.semester || "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th";
  return `${n}${s}`;
}

/** Problems that block saving, keyed by section. Empty arrays mean the section is complete. */
export function formProblems(f: OnboardingForm) {
  const details: string[] = [];
  if (f.fullName.trim().length < 2) details.push("full name");
  if (phoneError(f.phone)) details.push("phone");
  if (!f.campusId) details.push("campus");
  if (!f.classId) details.push("class and section");
  if (f.emergencyName.trim().length < 2) details.push("emergency contact name");
  if (phoneError(f.emergencyPhone)) details.push("emergency contact phone");
  const home: string[] = [];
  if (!f.home) home.push("home location");
  else if (f.home.address.trim().length < 3) home.push("home address");
  if (!f.stopId) home.push("pickup stop");
  return { details, home };
}
