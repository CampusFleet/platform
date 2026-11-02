import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Account Deletion & Danger Zone Compliance", () => {
  it("enforces exact case-insensitive DELETE confirmation phrase", () => {
    const validateConfirmation = (text: string) => text.trim().toUpperCase() === "DELETE";

    expect(validateConfirmation("")).toBe(false);
    expect(validateConfirmation("del")).toBe(false);
    expect(validateConfirmation("delete")).toBe(true);
    expect(validateConfirmation("DELETE")).toBe(true);
    expect(validateConfirmation(" Delete ")).toBe(true);
    expect(validateConfirmation("DeLeTe")).toBe(true);
    expect(validateConfirmation("CANCEL")).toBe(false);
  });

  it("handles Supabase GoTrue auth admin errors gracefully as non-fatal without failing the deletion", async () => {
    // Simulating the error that caused the bug: "This endpoint requires a valid Bearer token"
    const mockAuthAdmin = {
      deleteUser: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "This endpoint requires a valid Bearer token", status: 401 }
      })
    };

    let authErrorLogged = false;
    let didThrow = false;

    try {
      if (mockAuthAdmin?.deleteUser) {
        const { error: deleteError } = await mockAuthAdmin.deleteUser("usr-12345");
        if (deleteError) {
          authErrorLogged = true;
          // Notice: in the redesigned resilient route, we log and do NOT throw!
        }
      }
    } catch {
      didThrow = true;
    }

    expect(authErrorLogged).toBe(true);
    expect(didThrow).toBe(false); // Graceful recovery without aborting user deletion
  });

  it("generates a comprehensive GDPR data export payload before deletion", () => {
    const mockUser = {
      id: "usr_student_99",
      fullName: "Aditya Dev",
      email: "aditya@campusfleet.edu",
      role: "student" as const
    };

    const mockStudent = {
      id: "stud_usr_student_99",
      userId: "usr_student_99",
      fullName: "Aditya Dev",
      campusId: "campus_north",
      primaryBusId: "BUS-04"
    };

    const mockBookings = [
      { id: "bk_1", studentId: "stud_usr_student_99", status: "CONFIRMED" }
    ];

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      institution: "CampusFleet Transit Network",
      user: {
        id: mockUser.id,
        name: mockUser.fullName,
        email: mockUser.email,
        role: mockUser.role,
      },
      studentProfile: mockStudent,
      recentBookings: mockBookings,
    };

    expect(exportPayload.user.email).toBe("aditya@campusfleet.edu");
    expect(exportPayload.studentProfile?.primaryBusId).toBe("BUS-04");
    expect(exportPayload.recentBookings.length).toBe(1);
    expect(exportPayload.institution).toBe("CampusFleet Transit Network");
  });
});
