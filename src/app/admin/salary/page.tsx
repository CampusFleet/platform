import { getStaffServerData } from "@/lib/transport-admin-data";
import StaffSalaryManagementView from "@/components/transport-admin/StaffSalaryManagementView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Staff Payroll & Automated Salary Disbursements | CampusFleet",
};

export const dynamic = "force-dynamic";

export default async function AdminSalaryPage() {
  await getStaffServerData("/admin/salary");

  return <StaffSalaryManagementView />;
}
