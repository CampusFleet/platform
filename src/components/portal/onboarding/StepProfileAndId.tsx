"use client";

import React, { useState } from "react";
import {
  GraduationCap,
  Camera,
  Lock,
  RefreshCw,
  User,
  HeartHandshake,
  Check,
  ArrowRight,
  Loader2,
  ScanFace,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";
import { StepProfileAndIdProps } from "./types";
import { FaceIdEnrollmentModal } from "./FaceIdEnrollmentModal";

export function StepProfileAndId({
  studentId,
  fullName,
  phone,
  studentIdCode,
  campusId,
  campusOptions,
  isCampusLocked,
  courseOptions,
  selectedCourseId,
  branchOptions,
  selectedBranchId,
  specializationOptions,
  selectedSpecializationId,
  semesterOptions,
  selectedYear,
  sectionOptions,
  selectedSection,
  currentMatchedClass,
  emergencyName,
  emergencyPhone,
  photoUrl,
  localPreviewUrl,
  isUploadingPhoto,
  isPhotoLocked,
  imageLoadFailed,
  isFaceIdEnrolled,
  onFaceIdEnrolled,
  onFullNameChange,
  onPhoneChange,
  onStudentIdCodeChange,
  onCampusChange,
  onCourseChange,
  onBranchChange,
  onSpecializationChange,
  onSemesterChange,
  onSectionChange,
  onEmergencyNameChange,
  onEmergencyPhoneChange,
  onPhotoFileChange,
  onClearPhoto,
  onBack,
  onContinue,
}: StepProfileAndIdProps) {
  const [showFaceIdModal, setShowFaceIdModal] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-900 border-y sm:border border-gray-200 dark:border-zinc-800 rounded-none sm:rounded-3xl p-4 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
      
      {/* Face ID Live Enrollment Modal */}
      <FaceIdEnrollmentModal
        isOpen={showFaceIdModal}
        onClose={() => setShowFaceIdModal(false)}
        studentId={studentId}
        studentName={fullName}
        onSuccess={(res) => {
          if (onFaceIdEnrolled) {
            onFaceIdEnrolled(res.avatarUrl);
          }
        }}
      />

      <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
            Official Student Photo & Biometric Face ID
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
            Required for digital commuter pass photo ID, conductor manifests, and autonomous zero-touch bus door attendance.
          </p>
        </div>
        <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 shrink-0">
          <ScanFace className="w-6 h-6" />
        </div>
      </div>

      {/* Modern Biometric Live Photo Card (Zero File Uploads - Live Camera Only) */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-6 rounded-3xl border border-gray-200 dark:border-zinc-800 bg-gradient-to-br from-blue-50/40 via-white to-gray-50/60 dark:from-zinc-900/60 dark:via-zinc-950 dark:to-zinc-900 shadow-xs">
        {/* Live Portrait Frame / Viewfinder */}
        <div className="relative w-36 h-44 rounded-2xl overflow-hidden border-2 border-dashed border-blue-300 dark:border-blue-700/60 bg-white dark:bg-zinc-900 flex items-center justify-center shrink-0 shadow-md">
          {localPreviewUrl || photoUrl ? (
            <div className="relative w-full h-full group">
              <img
                src={localPreviewUrl || photoUrl}
                alt="Official Commuter Pass Portrait"
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[9px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1">
                <Check className="w-3 h-3" />
                Live Verified
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 text-blue-500 dark:text-blue-400 text-center p-3">
              <div className="relative">
                <ScanFace className="w-12 h-12 stroke-[1.5] animate-pulse" />
                <Camera className="w-5 h-5 absolute -bottom-1 -right-1 p-0.5 rounded-full bg-blue-600 text-white shadow-sm" />
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Live Photo
              </span>
              <span className="text-[9px] text-zinc-400 leading-tight">
                Camera Only
              </span>
            </div>
          )}
          {isUploadingPhoto && (
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          )}
        </div>

        {/* Details & Live Actions */}
        <div className="flex-1 space-y-3.5 text-center sm:text-left w-full">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h3 className="text-base font-black text-gray-900 dark:text-white">
                Live Commuter Pass Photo & Face ID
              </h3>
              {isFaceIdEnrolled || localPreviewUrl || photoUrl ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <Check className="w-3 h-3" />
                  VERIFIED & ACTIVE
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <Camera className="w-3 h-3" />
                  LIVE CAPTURE REQUIRED
                </span>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 max-w-lg leading-relaxed">
              In accordance with transit security standards (ICAO 9303 / DPDP 2023), profile photos must be captured live via camera. Pre-saved file uploads are disabled to prevent spoofing and ensure clearance at bus doors.
            </p>
          </div>

          {/* Compliance & Security Pills */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Anti-Spoofing Protected
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
              <ScanFace className="w-3.5 h-3.5 text-blue-500" />
              Dual-Use: Pass Photo + Face ID
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
              <Lock className="w-3.5 h-3.5 text-violet-500" />
              No File Uploads
            </span>
          </div>

          {/* Actions: ONLY Live Camera Capture */}
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
            <button
              type="button"
              onClick={() => setShowFaceIdModal(true)}
              className="px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-black flex items-center gap-2.5 shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>
                {isFaceIdEnrolled || localPreviewUrl || photoUrl
                  ? "Retake Live Photo & Re-Scan Face ID"
                  : "Capture Live Photo & Set Up Face ID"}
              </span>
            </button>

            {(photoUrl || localPreviewUrl) && !isPhotoLocked && (
              <button
                type="button"
                onClick={onClearPhoto}
                className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 text-xs font-bold text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
              >
                Clear Photo
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={e => onFullNameChange(e.target.value)}
            placeholder="e.g. Aditya Pandey"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Contact Mobile Phone *
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            University Student ERP Roll ID *
          </label>
          <input
            type="text"
            required
            value={studentIdCode}
            onChange={e => onStudentIdCodeChange(e.target.value.trim().toUpperCase())}
            placeholder="e.g. 230111075"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            University Campus
          </label>
          <CustomDropdown
            disabled={isCampusLocked}
            options={campusOptions}
            value={campusId}
            placeholder="Select Campus"
            onChange={onCampusChange}
          />
        </div>
      </div>

      {/* Academic Cohort Cascade (With Degree, Branch, Specialization, Semester, Section) */}
      <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            Academic Degree & Section
          </h3>
          {currentMatchedClass && (
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <Check className="w-3 h-3" /> Cohort Verified
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Degree / Course */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              Degree / Course *
            </label>
            <CustomDropdown
              options={courseOptions}
              value={selectedCourseId}
              placeholder="Select Degree"
              onChange={onCourseChange}
            />
          </div>

          {/* 2. Branch / Dept */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              Branch / Dept *
            </label>
            <CustomDropdown
              disabled={!selectedCourseId || branchOptions.length === 0}
              options={branchOptions}
              value={selectedBranchId}
              placeholder="Select Branch"
              onChange={onBranchChange}
            />
          </div>

          {/* 3. Specialization / Track (Re-added per User Request) */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              Specialization / Track
            </label>
            <CustomDropdown
              disabled={!selectedBranchId || specializationOptions.length === 0}
              options={specializationOptions}
              value={selectedSpecializationId}
              placeholder={
                !selectedBranchId
                  ? "Select Branch first"
                  : specializationOptions.length === 0
                  ? "No Specialization Required"
                  : "Select Specialization"
              }
              onChange={onSpecializationChange}
            />
          </div>

          {/* 4. Current Semester */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              Current Semester *
            </label>
            <CustomDropdown
              disabled={!selectedCourseId}
              options={semesterOptions}
              value={selectedYear}
              placeholder="Select Semester"
              onChange={onSemesterChange}
            />
          </div>

          {/* 5. Section */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
            <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
              Class Section *
            </label>
            <CustomDropdown
              disabled={!selectedYear}
              options={sectionOptions}
              value={selectedSection}
              placeholder={!selectedYear ? "Select Semester first" : "Select Section"}
              onChange={onSectionChange}
            />
          </div>
        </div>
      </div>

      {/* Emergency Guardian Contact */}
      <div className="pt-3 border-t border-gray-100 dark:border-zinc-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
          <HeartHandshake className="w-3.5 h-3.5 text-emerald-600" />
          Emergency / Guardian Contact
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-400">Guardian Name</label>
            <input
              type="text"
              value={emergencyName}
              onChange={e => onEmergencyNameChange(e.target.value)}
              placeholder="Parent / Guardian Name"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-gray-600 dark:text-gray-400">Guardian Phone</label>
            <input
              type="tel"
              value={emergencyPhone}
              onChange={e => onEmergencyPhoneChange(e.target.value)}
              placeholder="+91 98765 43210"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          ← Back to Home & Route Map
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Continue to Instant Pass Activation</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

