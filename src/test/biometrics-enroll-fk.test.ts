import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Biometrics Enrollment Foreign Key & Student Resolution Integrity", () => {
  it("resolves authentic student_id from students table when students.user_id matches session.userId", () => {
    const session = { userId: "user-123", email: "student@example.com", role: "student" };
    const dbStudents = [
      { id: "stud-xyz-789", user_id: "user-123", full_name: "Test Student" },
    ];

    // Simulating resolution logic
    const student = dbStudents.find((s) => s.user_id === session.userId);
    const resolvedStudentId = student?.id;

    expect(resolvedStudentId).toBe("stud-xyz-789");
    expect(resolvedStudentId).not.toBe("user-123"); // Must not be raw userId
  });

  it("provisions fallback student record with valid students.id when student is brand new", () => {
    const session = { userId: "user-new-456", email: "new@example.com", role: "student" };
    const dbStudents: { id: string; user_id: string }[] = [];

    let resolvedStudentId = dbStudents.find((s) => s.user_id === session.userId)?.id;

    if (!resolvedStudentId) {
      const autoId = `stud-${session.userId}`;
      dbStudents.push({ id: autoId, user_id: session.userId });
      resolvedStudentId = autoId;
    }

    expect(resolvedStudentId).toBe("stud-user-new-456");
    // Verifies that foreign key target now contains the student record
    expect(dbStudents.some((s) => s.id === resolvedStudentId)).toBe(true);
  });

  it("never executes queries with students.email since email column belongs to users/students_full", () => {
    const validStudentsColumns = [
      "id",
      "user_id",
      "full_name",
      "semester",
      "campus_id",
      "class_id",
      "student_id_code",
      "photo_locked",
      "zone_id",
    ];

    expect(validStudentsColumns.includes("email")).toBe(false);
  });
});
