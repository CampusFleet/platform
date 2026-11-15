"use client";

import React, { useState } from "react";
import { store } from "@/lib/client-store";
import { formatDate } from "@/lib/utils";
import { FileBarChart, Download, FileSpreadsheet, CheckCircle2, Calendar, User } from "lucide-react";

import type { Booking, Student, Bus } from "@/lib/types";
import { getSafePhotoUrl } from "@/lib/image-utils";

export interface StaffReportsProps {
  initialBookings?: Booking[];
  initialStudents?: Student[];
  initialBuses?: Bus[];
  initialPayments?: any[];
  initialMaintenance?: any[];
}

export default function StaffReportsView({
  initialBookings = [],
  initialStudents = [],
  initialBuses = [],
  initialPayments = [],
  initialMaintenance = [],
}: StaffReportsProps = {}) {
  const [reportType, setReportType] = useState<"ATTENDANCE" | "OCCUPANCY" | "REVENUE" | "MAINTENANCE">("ATTENDANCE");
  const [isExporting, setIsExporting] = useState(false);

  const bookings = initialBookings.length > 0 ? initialBookings : store.getBookings();
  const students = initialStudents.length > 0 ? initialStudents : store.getStudents();
  const buses = initialBuses.length > 0 ? initialBuses : store.getBuses();
  const payments = initialPayments.length > 0 ? initialPayments : store.getPayments();
  const maintenance = initialMaintenance.length > 0 ? initialMaintenance : store.getMaintenance();

  const handleExportCSV = () => {
    setIsExporting(true);
    setTimeout(() => {
      let csvContent = "";
      let filename = `campusfleet_${reportType.toLowerCase()}_report.csv`;

      if (reportType === "ATTENDANCE") {
        csvContent = "BookingCode,StudentName,Department,Seat,Status,BoardedAt,CreatedAt\n";
        bookings.forEach(b => {
          const s = students.find(stud => stud.id === b.studentId);
          csvContent += `"${b.bookingCode}","${s?.fullName || ""}","${s?.department || ""}","${b.seatNumber || `WL-${b.waitlistPosition}`}","${b.status}","${b.boardedAt || ""}","${b.createdAt}"\n`;
        });
      } else if (reportType === "OCCUPANCY") {
        csvContent = "BusNumber,Registration,Capacity,Status,GPS_ID\n";
        buses.forEach(b => {
          csvContent += `"${b.busNumber}","${b.registrationNo}",${b.capacity},"${b.status}","${b.gpsDeviceId}"\n`;
        });
      } else if (reportType === "REVENUE") {
        csvContent = "ReceiptNo,StudentName,PlanName,Amount,Method,Date,Status\n";
        payments.forEach(p => {
          csvContent += `"${p.receiptNumber}","${p.studentName}","${p.planName}",${p.amount},"${p.paymentMethod}","${p.createdAt}","${p.status}"\n`;
        });
      } else if (reportType === "MAINTENANCE") {
        csvContent = "BusNumber,ServiceType,Cost,OdometerKm,Center,ServiceDate,NextDue\n";
        maintenance.forEach(m => {
          csvContent += `"${m.busNumber}","${m.serviceType}",${m.cost},${m.odometerKm},"${m.serviceCenter}","${m.serviceDate}","${m.nextDueDate}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setIsExporting(false);
    }, 600);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-2.5">
            <FileBarChart className="w-7 h-7 text-blue-600" />
            Compliance Reports & CSV Data Export
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Generate auditable spreadsheets for university transport audits, safety boards, and finance.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={isExporting}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-2xl flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all"
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Generating CSV..." : `Download ${reportType} CSV`}
        </button>
      </div>

      {/* Report Selection Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto bg-white dark:bg-gray-900 p-2 rounded-2xl border border-gray-200 dark:border-gray-800">
        {[
          { id: "ATTENDANCE", label: "Daily Trip & Attendance Ledger" },
          { id: "OCCUPANCY", label: "Bus Fleet & Seat Occupancy" },
          { id: "REVENUE", label: "Subscription Pass & Fee Revenue" },
          { id: "MAINTENANCE", label: "Workshop & Maintenance Due" },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setReportType(tab.id as any)}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
              reportType === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Live Data Preview */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            Live Preview: {reportType} Dataset
          </h3>
          <span className="text-xs font-mono text-gray-400">
            Export format: RFC 4180 CSV Compliant
          </span>
        </div>

        {reportType === "ATTENDANCE" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="p-3">Booking Code</th>
                  <th className="p-3">Commuter / Photo</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Seat Number</th>
                  <th className="p-3">Verification Status</th>
                  <th className="p-3">Attendance Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {bookings.map(b => {
                  const s = students.find(stud => stud.id === b.studentId);
                  return (
                    <tr key={b.id}>
                      <td className="p-3 font-mono font-bold text-blue-600">{b.bookingCode}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2.5">
                          {s?.photoUrl ? (
                            <img
                              src={getSafePhotoUrl(s.photoUrl)}
                              alt={s.fullName}
                              className="w-8 h-10 object-cover rounded-md border border-gray-300 dark:border-gray-700 shadow-2xs flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-10 rounded-md border border-dashed border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-gray-400">
                              <User className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-gray-900 dark:text-white">
                              {s?.fullName || "Student"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-600 dark:text-gray-300">
                        {s?.department || "Unassigned"}
                      </td>
                      <td className="p-3 font-mono font-bold">{b.seatNumber || `WL-${b.waitlistPosition}`}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          b.status === "BOARDED"
                            ? "bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300"
                            : b.status === "CONFIRMED"
                            ? "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 text-gray-500">
                        {b.boardedAt ? new Date(b.boardedAt).toLocaleTimeString() : formatDate(b.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {reportType === "OCCUPANCY" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 dark:bg-gray-800/60 uppercase font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="p-3">Bus Identifier</th>
                  <th className="p-3">Registration</th>
                  <th className="p-3">Capacity</th>
                  <th className="p-3">Layout</th>
                  <th className="p-3">Fleet Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {buses.map(bus => (
                  <tr key={bus.id}>
                    <td className="p-3 font-bold">{bus.busNumber}</td>
                    <td className="p-3 font-mono">{bus.registrationNo}</td>
                    <td className="p-3 font-mono">{bus.capacity} Physical Seats</td>
                    <td className="p-3">{bus.seatLayout}</td>
                    <td className="p-3 font-bold text-green-600">{bus.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
