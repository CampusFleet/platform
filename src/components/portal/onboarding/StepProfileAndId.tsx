"use client";

import React, { useState, useRef } from "react";
import {
  GraduationCap,
  Camera,
  Upload,
  RefreshCw,
  User,
  HeartHandshake,
  Check,
  ArrowRight,
  Loader2,
  ScanFace,
  QrCode,
  CreditCard,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { CustomDropdown } from "@/components/common/CustomDropdown";
import { StepProfileAndIdProps } from "./types";
import { FaceIdEnrollmentModal } from "./FaceIdEnrollmentModal";
import { useAttendancePolicy } from "@/lib/attendance";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { locks } = useAttendancePolicy();

  const isFaceIdActive = locks.faceId;
  const hasPhoto = Boolean(localPreviewUrl || photoUrl);

  return (
    <div className="bg-white dark:bg-zinc-900 border-y sm:border border-gray-200 dark:border-zinc-800 rounded-none sm:rounded-3xl p-4 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
      
      {/* Hidden File Input for Direct Photo Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={onPhotoFileChange}
      />

      {/* Face ID Live Enrollment Modal */}
      {isFaceIdActive && (
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
      )}

      {/* Sleek Identity & Photo Card (Clean Apple / FinTech Standard) */}
      <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-center sm:text-left w-full sm:w-auto flex-col sm:flex-row">
          {/* Avatar Portrait Preview */}
          <div className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-2xl overflow-hidden bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 shrink-0 shadow-xs flex items-center justify-center">
            {hasPhoto ? (
              <img
                src={localPreviewUrl || photoUrl}
                alt="Commuter Pass Portrait"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500">
                {isFaceIdActive ? (
                  <ScanFace className="w-8 h-8 stroke-[1.5]" />
                ) : (
                  <User className="w-8 h-8 stroke-[1.5]" />
                )}
              </div>
            )}
            {/* Status indicator on avatar corner */}
            {hasPhoto && (
              <div className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs ring-2 ring-white dark:ring-zinc-900">
                <Check className="w-3 h-3 stroke-[3]" />
              </div>
            )}
            {isUploadingPhoto && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                {isFaceIdActive ? "Transit Pass Photo & Face ID" : "Official Commuter Photo ID"}
              </h3>
              {hasPhoto ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <Check className="w-3 h-3" /> Ready
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                  Required
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
              {isFaceIdActive
                ? hasPhoto
                  ? "Live scan active for bus pass and automatic door boarding."
                  : "Live camera scan required for your digital commuter pass & bus door entry."
                : hasPhoto
                  ? "Portrait uploaded and verified for your official transit pass."
                  : "Upload a front-facing photo for your pass. Face ID gate cameras are currently disabled."}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-center sm:justify-end flex-wrap">
          {isFaceIdActive ? (
            <>
              <button
                type="button"
                onClick={() => setShowFaceIdModal(true)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  hasPhoto
                    ? "border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 shadow-xs"
                    : "bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-sm shadow-blue-500/25"
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>{hasPhoto ? "Retake Face ID" : "Set Up Face ID"}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isPhotoLocked || isUploadingPhoto}
                className="px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-xs font-semibold text-gray-700 dark:text-gray-300 transition-all cursor-pointer flex items-center gap-1.5"
                title="Upload Photo File"
              >
                <Upload className="w-3.5 h-3.5 text-gray-500" />
                <span>Upload File</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoLocked || isUploadingPhoto}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                hasPhoto
                  ? "border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-800 shadow-xs"
                  : "bg-blue-600 hover:bg-blue-500 active:scale-95 text-white shadow-sm shadow-blue-500/25"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>{hasPhoto ? "Change Photo" : "Upload Photo"}</span>
            </button>
          )}

          {hasPhoto && !isPhotoLocked && (
            <button
              type="button"
              onClick={onClearPhoto}
              className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 hover:border-rose-300 dark:hover:border-rose-800 text-xs font-medium text-gray-500 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Active Gate Locks Accepted Strip */}
      <div className="p-3 sm:p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-950/40 border border-gray-200 dark:border-zinc-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="font-bold text-gray-900 dark:text-white">
            Accepted Boarding Channels on Bus Fleet:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {locks.faceId && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <ScanFace className="w-3 h-3" /> Face ID
            </span>
          )}
          {locks.dynamicQr && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              <QrCode className="w-3 h-3" /> Dynamic QR Pass
            </span>
          )}
          {locks.rfid && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              <CreditCard className="w-3 h-3" /> RFID Card Tap
            </span>
          )}
          {locks.staticQr && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <ScanLine className="w-3 h-3" /> Bus Door QR
            </span>
          )}
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
              disabled={!selectedYear || sectionOptions.length === 0}
              options={sectionOptions}
              value={selectedSection}
              placeholder={
                !selectedYear
                  ? "Select Semester first"
                  : sectionOptions.length === 0
                  ? "No section exists for this specialization & semester — contact Transport Admin"
                  : "Select Section"
              }
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

