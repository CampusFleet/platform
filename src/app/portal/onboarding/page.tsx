"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { store } from "@/lib/store";
import { Student, TransitZone, Campus, Stop, Route } from "@/lib/types";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  BusFront,
} from "lucide-react";
import { isStudentSubscriptionActive } from "@/lib/subscription-utils";
import { detectCommuterZoneAndStop } from "@/lib/zone-detector";
import { createStudentId } from "@/lib/id";
import {
  saveOnboardingDraft,
  loadOnboardingDraft,
  clearOnboardingDraft,
} from "@/lib/onboarding-cache";
import {
  OnboardingHeader,
  OnboardingStepNav,
  StepHomeAndRoute,
  StepProfileAndId,
  StepActivatePass,
  AddressSuggestion,
  OnboardingAcademicData,
  OnboardingToast,
} from "@/components/portal/onboarding";

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [currentUser] = useState(store.getCurrentUser());
  const [, setStudents] = useState(store.getStudents());
  const [campuses] = useState<Campus[]>(() => store.getCampuses());
  const [stops] = useState<Stop[]>(() => store.getStops());
  const [routes] = useState<Route[]>(() => store.getRoutes());
  const [transitZones] = useState<TransitZone[]>(() =>
    store.getTransitZones(store.getPrimaryCampus()?.id)
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);

  // Active Wizard Step: 1 = Home & Route, 2 = Profile & ID, 3 = Payment & Pass Activation
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Payment Verification State (Razorpay return handling)
  const [paymentVerificationState, setPaymentVerificationState] = useState<
    "IDLE" | "VERIFYING" | "SUCCESS" | "ERROR"
  >("IDLE");
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [isDraftCleared, setIsDraftCleared] = useState(false);

  // Toast Notification state
  const [toast, setToast] = useState<OnboardingToast | null>(null);

  const showToast = (type: "success" | "error" | "warning" | "info", message: string, title?: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToast({ id, type, message, title });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const [serverStudent, setServerStudent] = useState<Student | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const activeStudent: Student | undefined =
    serverStudent ||
    store.getStudents().find(
      s => s.email?.toLowerCase() === currentUser?.email?.toLowerCase() || (currentUser?.id && s.userId === currentUser.id)
    );

  // Form State - Student Profile
  const [fullName, setFullName] = useState("");
  const [campusId, setCampusId] = useState(() => store.getPrimaryCampus()?.id || "");
  const [campus, setCampus] = useState(() => store.getPrimaryCampus()?.name || "Main Campus");
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState("");
  const [classesList, setClassesList] = useState<any[]>([]);
  const [academicData, setAcademicData] = useState<OnboardingAcademicData>({
    courses: [],
    branches: [],
    specializations: [],
    sections: [],
    classes: [],
  });

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedSpecializationId, setSelectedSpecializationId] = useState("");
  const [, setSelectedCourse] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");

  const [phone, setPhone] = useState("");
  const [studentIdCode, setStudentIdCode] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel] = useState("Parent / Guardian");
  const [photoUrl, setPhotoUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Home Location & Smart Allocation state
  const [homeAddress, setHomeAddress] = useState("Mukhani, Haldwani, Uttarakhand, 263141");
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingSuggestions, setIsSearchingSuggestions] = useState(false);
  const [showSuggestionsDropdown, setShowSuggestionsDropdown] = useState(false);
  const [fuzzySuggestions, setFuzzySuggestions] = useState<AddressSuggestion[]>([]);
  const [fuzzyNotice, setFuzzyNotice] = useState<string | null>(null);
  const [isOutOfServiceArea, setIsOutOfServiceArea] = useState(false);
  const [serviceAreaWarning, setServiceAreaWarning] = useState<string | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [homeLat, setHomeLat] = useState<number>(29.220936);
  const [homeLng, setHomeLng] = useState<number>(79.514496);
  const [autoAssignedStopId, setAutoAssignedStopId] = useState<string | null>(null);
  const [primaryStopId, setPrimaryStopId] = useState<string>("");
  const [selectedZoneCode, setSelectedZoneCode] = useState<string>("ZONE_B");
  const [assignedRouteName, setAssignedRouteName] = useState<string>("Haldwani Express Corridor");
  const [assignedRouteId, setAssignedRouteId] = useState<string>("");
  const [walkingDistanceMeters, setWalkingDistanceMeters] = useState<number>(450);
  const [walkingTimeMins, setWalkingTimeMins] = useState<number>(6);
  const [semesterFee, setSemesterFee] = useState<number>(12000);
  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [showAllStopsPicker, setShowAllStopsPicker] = useState(false);
  const [stopSearchQuery, setStopSearchQuery] = useState("");

  const isPassApproved = isStudentSubscriptionActive(activeStudent);
  const isPhotoLocked = isPassApproved;
  const isZoneLocked = isPassApproved;
  const isCampusLocked = isPassApproved;

  // Cascaded academic lists
  const filteredBranches = useMemo(() => {
    if (!selectedCourseId) return [];
    return academicData.branches.filter(b => b.course_id === selectedCourseId);
  }, [academicData.branches, selectedCourseId]);

  const filteredSpecializations = useMemo(() => {
    if (!selectedBranchId) return [];
    return academicData.specializations.filter(s => s.branch_id === selectedBranchId);
  }, [academicData.specializations, selectedBranchId]);

  const availableSemesters = useMemo(() => {
    if (!selectedCourseId) return [];
    const crs = academicData.courses.find(c => c.id === selectedCourseId);
    const total = crs?.total_semesters || 8;
    const list: string[] = [];
    for (let i = 1; i <= total; i++) {
      const suffix = i === 1 ? "st" : i === 2 ? "nd" : i === 3 ? "rd" : "th";
      list.push(`${i}${suffix} Sem`);
    }
    return list;
  }, [academicData.courses, selectedCourseId]);

  const availableSections = useMemo(() => {
    if (!selectedYear) return [];

    const isSemesterMatch = (c: any) => {
      if (!c) return false;
      if (c.semester === selectedYear) return true;
      const semNum = parseInt(selectedYear.replace(/\D/g, ""), 10);
      if (!isNaN(semNum) && (c.semester_num === semNum || parseInt(String(c.semester).replace(/\D/g, ""), 10) === semNum)) {
        return true;
      }
      return false;
    };

    // Only sections that exist as a class for THIS specialization + semester.
    // (No branch-wide or global A–H fallback: that showed other specializations'
    // sections and let students pick a section with no class.)
    if (!selectedSpecializationId) return [];
    return academicData.classes
      .filter(c =>
        c.specialization_id === selectedSpecializationId &&
        isSemesterMatch(c) &&
        c.is_active !== false &&
        (!campusId || !c.campus_id || c.campus_id === campusId)
      )
      .sort((a, b) => String(a.section).localeCompare(String(b.section)))
      .map(m => ({
        id: m.section_id || m.id,
        code: m.section,
        name: m.section_name || `Section ${m.section}`,
        classId: m.id,
      }));
  }, [academicData.classes, selectedSpecializationId, selectedYear, campusId]);

  const currentMatchedClass = useMemo(() => {
    if (selectedClassId) {
      return academicData.classes.find(c => c.id === selectedClassId) || null;
    }
    const isSemesterMatch = (c: any) => {
      if (!c || !selectedYear) return false;
      if (c.semester === selectedYear) return true;
      const semNum = parseInt(selectedYear.replace(/\D/g, ""), 10);
      if (!isNaN(semNum) && (c.semester_num === semNum || parseInt(String(c.semester).replace(/\D/g, ""), 10) === semNum)) {
        return true;
      }
      return false;
    };

    if (selectedSpecializationId && selectedYear && selectedSection) {
      return academicData.classes.find(
        c => c.specialization_id === selectedSpecializationId &&
             isSemesterMatch(c) &&
             c.section === selectedSection &&
             (!campusId || !c.campus_id || c.campus_id === campusId)
      ) || null;
    }
    // No branch-level match: a section belongs to one specialization's class.
    return null;
  }, [academicData.classes, selectedClassId, selectedSpecializationId, selectedBranchId, selectedYear, selectedSection, campusId]);

  const campusOptions = useMemo(() => {
    return campuses.map(c => ({
      value: c.id,
      label: `${c.name}${c.isPrimary ? " (Primary)" : ""}`,
    }));
  }, [campuses]);

  const courseOptions = useMemo(() => {
    return (academicData.courses || []).map(crs => ({
      value: crs.id,
      label: `${crs.short_name} — ${crs.name}`,
    }));
  }, [academicData.courses]);

  const branchOptions = useMemo(() => {
    return filteredBranches.map(br => ({
      value: br.id,
      label: `${br.code} — ${br.name}`,
    }));
  }, [filteredBranches]);

  const specializationOptions = useMemo(() => {
    return filteredSpecializations.map(sp => ({
      value: sp.id,
      label: `${sp.short_label} (${sp.name})`,
    }));
  }, [filteredSpecializations]);

  const semesterOptions = useMemo(() => {
    return availableSemesters.map(sem => ({
      value: sem,
      label: sem,
    }));
  }, [availableSemesters]);

  const sectionOptions = useMemo(() => {
    return availableSections.map(sec => ({
      value: sec.code,
      label: `${sec.name} (${sec.code})`,
    }));
  }, [availableSections]);

  // Automatic Intelligent Zone & Route Detector from Coordinates
  const runAutoStopAndZoneDetection = (lat: number, lng: number) => {
    const campusObj = campuses.find(c => c.id === campusId) || store.getPrimaryCampus();
    const result = detectCommuterZoneAndStop(lat, lng, stops, routes, transitZones, campusObj);
    if (result) {
      if (!isZoneLocked) {
        setSelectedZoneCode(result.assignedZone.code);
        setSemesterFee(result.semesterFee);
      }
      setAutoAssignedStopId(result.nearestStop.id);
      setPrimaryStopId(result.nearestStop.id);
      setWalkingDistanceMeters(result.walkingDistanceMeters);
      setWalkingTimeMins(result.walkingTimeMins);
      setIsOutOfServiceArea(Boolean(result.isOutOfServiceArea));
      setServiceAreaWarning(result.serviceAreaWarning || null);
      if (result.assignedRoute) {
        setAssignedRouteId(result.assignedRoute.id);
        setAssignedRouteName(result.assignedRoute.name);
      }
    }
  };

  // Reverse Geocode helper
  const fetchAddressForCoordinates = async (lat: number, lng: number) => {
    setIsResolvingAddress(true);
    try {
      const res = await fetch(`/api/geo/reverse-geocode?lat=${lat}&lng=${lng}`);
      const data = await res.json();
      if (data.success && data.address) {
        setHomeAddress(data.address);
        setAddressSearchQuery(data.address);
      }
    } catch (err) {
      console.warn("Could not reverse geocode coordinates:", err);
    } finally {
      setIsResolvingAddress(false);
    }
  };

  // Map Click / Pin Drop Handler
  const handleMapLocationSelect = (lat: number, lng: number) => {
    setHomeLat(lat);
    setHomeLng(lng);
    fetchAddressForCoordinates(lat, lng);
    runAutoStopAndZoneDetection(lat, lng);
  };

  // Live debounced autocomplete as user types (Google Maps Standard)
  const handleAddressInputChange = (val: string) => {
    setAddressSearchQuery(val);
    setHomeAddress(val);
    setFuzzyNotice(null);
    setFuzzySuggestions([]);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length < 3) {
      setSearchSuggestions([]);
      setShowSuggestionsDropdown(false);
      setIsSearchingSuggestions(false);
      return;
    }

    setIsSearchingSuggestions(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        if (data.results && Array.isArray(data.results) && data.results.length > 0) {
          setSearchSuggestions(data.results);
          setShowSuggestionsDropdown(true);
          setFuzzySuggestions([]);
          setFuzzyNotice(null);
        } else if (data.isFuzzy && data.suggestions && data.suggestions.length > 0) {
          setSearchSuggestions([]);
          setShowSuggestionsDropdown(false);
          setFuzzySuggestions(data.suggestions);
          setFuzzyNotice(data.message || `No exact match for "${trimmed}". Did you mean one of these nearby areas?`);
        } else {
          setSearchSuggestions([]);
          setShowSuggestionsDropdown(false);
        }
      } catch (err) {
        console.warn("Autocomplete fetch failed:", err);
      } finally {
        setIsSearchingSuggestions(false);
      }
    }, 320);
  };

  // Handle Autocomplete or Fuzzy Suggestion Pick
  const handleSelectSuggestion = (item: AddressSuggestion) => {
    const lat = Number(item.latitude);
    const lng = Number(item.longitude);
    setHomeLat(lat);
    setHomeLng(lng);
    setHomeAddress(item.formattedAddress);
    setAddressSearchQuery(item.mainText || item.formattedAddress);
    setShowSuggestionsDropdown(false);
    setFuzzySuggestions([]);
    setFuzzyNotice(null);
    runAutoStopAndZoneDetection(lat, lng);
    showToast("success", `Centered map on "${item.mainText || item.formattedAddress}"`, "Location Locked");
  };

  // Forward Geocode Address Search Handler
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setShowSuggestionsDropdown(false);
    const query = (addressSearchQuery || homeAddress).trim();
    if (!query) {
      showToast("warning", "Please type your street, colony, or landmark name.", "Address Required");
      return;
    }

    setIsGeocodingAddress(true);
    setFuzzyNotice(null);
    setFuzzySuggestions([]);

    try {
      const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success && data.latitude && data.longitude) {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        setHomeLat(lat);
        setHomeLng(lng);
        if (data.formattedAddress) {
          setHomeAddress(data.formattedAddress);
          setAddressSearchQuery(data.formattedAddress);
        }
        runAutoStopAndZoneDetection(lat, lng);
        showToast("success", `Centered map on "${data.formattedAddress || query}"`, "Location Found");
      } else if (data.isFuzzy && data.suggestions && data.suggestions.length > 0) {
        setFuzzySuggestions(data.suggestions);
        setFuzzyNotice(data.message || `No exact match found for "${query}". Did you mean one of these nearby areas?`);
        showToast("info", "No exact match found. See suggestions below.", "Fuzzy Match");
      } else {
        showToast("error", data.message || "Could not locate address. Try with city name.", "Search Not Found");
      }
    } catch (err: any) {
      showToast("error", err.message || "Geocoding network error", "Search Error");
    } finally {
      setIsGeocodingAddress(false);
    }
  };

  const handleClearAddress = () => {
    setAddressSearchQuery("");
    setHomeAddress("");
    setSearchSuggestions([]);
    setShowSuggestionsDropdown(false);
    setFuzzySuggestions([]);
    setFuzzyNotice(null);
  };

  // GPS Device Detection
  const handleDetectGPS = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      showToast("warning", "Geolocation is not supported by your browser.", "GPS Error");
      return;
    }
    setIsDetectingGPS(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setHomeLat(lat);
        setHomeLng(lng);
        setIsDetectingGPS(false);
        showToast("success", `GPS location locked! Pin updated.`, "GPS Acquired");
        fetchAddressForCoordinates(lat, lng);
        runAutoStopAndZoneDetection(lat, lng);
      },
      err => {
        showToast("error", "Failed to acquire GPS location: " + err.message, "GPS Error");
        setIsDetectingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Select Alternate Pickup Stop
  const handleSelectPickupStop = (stopId: string, stopZoneCode?: string, stopName?: string) => {
    setPrimaryStopId(stopId);
    if (stopZoneCode && !isZoneLocked) {
      setSelectedZoneCode(stopZoneCode);
      const matchedZone = transitZones.find(z => z.code === stopZoneCode);
      if (matchedZone) setSemesterFee(matchedZone.semesterFee);
    }
    const chosenStop = stops.find(s => s.id === stopId);
    if (chosenStop) {
      const distKm = Math.hypot(homeLat - chosenStop.latitude, homeLng - chosenStop.longitude) * 111.32;
      setWalkingDistanceMeters(Math.round(distKm * 1000));
      setWalkingTimeMins(Math.max(1, Math.round((distKm / 4.8) * 60)));
    }
    showToast("info", `Assigned pickup stop: ${stopName || "Selected Stop"}`, "Stop Selected");
  };

  // Photo Upload Handler with Client Compression
  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPhotoLocked) {
      showToast("warning", "Official photo is locked. Only Campus Staff/Admin can update your photo.", "Photo Locked");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);

    try {
      const compressedFile = await new Promise<File>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const MAX_WIDTH = 600;
            const MAX_HEIGHT = 600;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            } else {
              if (height > MAX_HEIGHT) width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const fileName = file.name.replace(/\.[^/.]+$/, "") + ".jpeg";
                  resolve(new File([blob], fileName, { type: "image/jpeg" }));
                } else {
                  reject(new Error("Compression failed"));
                }
              },
              "image/jpeg",
              0.8
            );
          };
          img.onerror = () => reject(new Error("Failed to load image for compression"));
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
      });

      try {
        const objectUrl = URL.createObjectURL(compressedFile);
        setLocalPreviewUrl(objectUrl);
        setImageLoadFailed(false);
      } catch (err) {
        console.warn("Local object URL creation failed", err);
      }

      const formData = new FormData();
      formData.append("file", compressedFile);

      const res = await fetch("/api/payments/upload-receipt", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setPhotoUrl(data.url);
        setImageLoadFailed(false);
        showToast("success", "Official passport photo uploaded and encrypted.", "Upload Complete");
      } else {
        showToast("error", data.error || "Failed to upload photo. Please try again.", "Upload Failed");
      }
    } catch (err: any) {
      console.error("Photo upload error:", err);
      showToast("error", err.message || "Failed to upload photo", "Upload Error");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleClearPhoto = () => {
    setPhotoUrl("");
    setLocalPreviewUrl("");
    setImageLoadFailed(false);
  };

  // Check for Razorpay Callback in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("razorpay_payment_id");
    const linkId = params.get("razorpay_payment_link_id");
    const refId = params.get("razorpay_payment_link_reference_id");
    const status = params.get("razorpay_payment_link_status");
    const sig = params.get("razorpay_signature");

    if (paymentId && linkId && sig) {
      setPaymentVerificationState("VERIFYING");
      setIsRazorpayLoading(true);
      fetch("/api/payments/razorpay/verify-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          razorpay_payment_id: paymentId,
          razorpay_payment_link_id: linkId,
          razorpay_payment_link_reference_id: refId,
          razorpay_payment_link_status: status,
          razorpay_signature: sig,
        }),
      })
        .then(res => res.json())
        .then(data => {
          setIsRazorpayLoading(false);
          if (data.success) {
            // 1. Mark in sessionStorage so client layout never triggers a redirect loop
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem("campusfleet_pass_just_activated", "true");
            }
            // 2. Clear any persisted onboarding draft
            clearOnboardingDraft(currentUser?.id);

            // 3. Clean URL parameters without reloading
            window.history.replaceState({}, document.title, window.location.pathname);
            
            const targetId = data.studentId || activeStudent?.id;
            if (targetId) {
              store.markStudentSubscribed(targetId);
            }
            if (currentUser?.id) {
              store.markStudentSubscribed(currentUser.id);
            }
            setServerStudent(prev => prev ? { ...prev, hasActiveSubscription: true, paymentStatus: "APPROVED" } : null);

            // 4. Set state to SUCCESS (renders celebration view)
            setPaymentVerificationState("SUCCESS");
            showToast("success", "🎉 Payment Verified! Your semester transit pass is officially unlocked.", "Access Granted");

            // 5. Clean, single transition to /portal after celebration
            setTimeout(() => {
              window.location.href = "/portal";
            }, 2400);
          } else {
            setPaymentVerificationState("ERROR");
            showToast("error", data.error || "Failed to verify transaction.", "Verification Failed");
          }
        })
        .catch(err => {
          setIsRazorpayLoading(false);
          setPaymentVerificationState("ERROR");
          showToast("error", err.message || "Network error verifying payment.", "Network Error");
        });
    }
  }, [activeStudent?.id, currentUser?.id]);

  // Auto-redirect to Commuter Hub if commuter already has an active transit pass
  useEffect(() => {
    if (!dataLoaded) return;
    // Never auto-redirect if actively processing or celebrating payment
    if (paymentVerificationState === "VERIFYING" || paymentVerificationState === "SUCCESS") return;

    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const hasRazorpayParams = params.has("razorpay_payment_id") || params.has("razorpay_payment_link_id");
    if (hasRazorpayParams) return; // Don't redirect while actively verifying a payment callback

    if (isPassApproved || activeStudent?.hasActiveSubscription || activeStudent?.paymentStatus === "APPROVED") {
      router.replace("/portal");
    }
  }, [dataLoaded, isPassApproved, activeStudent, router, paymentVerificationState]);

  // Save profile and trigger Razorpay Checkout
  const handleSaveAndCheckout = async () => {
    if (!phone.trim()) {
      showToast("warning", "Please fill in your Contact Phone Number.", "Phone Required");
      setActiveStep(2);
      return;
    }

    if (!photoUrl) {
      showToast("error", "Official live camera photo & Face ID verification required.", "Photo Required");
      setActiveStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSubmitting(true);
    const targetStudentId = activeStudent?.id || createStudentId();
    const chosenClass = classesList.find(c => c.id === selectedClassId);
    const chosenCampus = campuses.find(c => c.id === campusId);

    try {
      // 1. Update Student Profile in Store & Database
      await store.updateStudentProfile(targetStudentId, {
        fullName: fullName.trim() || currentUser?.fullName || "Student",
        campusId,
        campus: chosenCampus?.name || campus,
        department,
        semester,
        classId: chosenClass?.id,
        className: chosenClass?.name,
        zoneCode: selectedZoneCode,
        phone: phone.trim(),
        primaryStopId: primaryStopId || stops[0]?.id || "",
        primaryRouteId: assignedRouteId || undefined,
        photoUrl: photoUrl.trim() || undefined,
        studentIdCode: studentIdCode.trim() || undefined,
        homeLatitude: homeLat,
        homeLongitude: homeLng,
        homeAddress: homeAddress.trim() || undefined,
        autoAssignedStopId: autoAssignedStopId || primaryStopId || undefined,
        emergencyContact: {
          name: emergencyName.trim() || "Parent / Guardian",
          relationship: emergencyRel,
          phone: emergencyPhone.trim() || phone.trim(),
        },
      });

      // 2. Sync home location & auto stop allocation with backend
      await fetch("/api/students/home-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: targetStudentId,
          latitude: homeLat,
          longitude: homeLng,
          address: homeAddress.trim(),
          chosenStopId: primaryStopId,
        }),
      });

      // 3. Initiate Hosted Razorpay Checkout
      setIsRazorpayLoading(true);
      const linkRes = await fetch("/api/payments/razorpay/create-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: semesterFee,
          studentId: targetStudentId,
          callbackPath: "/portal/onboarding",
          description: `CampusFleet Semester Transit Pass - Zone ${selectedZoneCode.replace("ZONE_", "")}`,
        }),
      });

      const linkData = await linkRes.json();
      if (!linkRes.ok || !linkData.success) {
        throw new Error(linkData.error || "Failed to create payment checkout link.");
      }

      showToast("info", "Redirecting to Razorpay secure checkout...", "Payment Gateway");
      window.location.href = linkData.short_url;
    } catch (err: any) {
      console.error("Save & Checkout Error:", err);
      showToast("error", err.message || "Error initiating pass activation.", "Checkout Failed");
      setIsSubmitting(false);
      setIsRazorpayLoading(false);
    }
  };

  // Initial Data Fetching
  useEffect(() => {
    fetch("/api/academic/cascade")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAcademicData(data);
          setClassesList(data.classes || []);
        }
      })
      .catch(console.error);

    fetch(`/api/students/me?_t=${Date.now()}`, { cache: "no-store" })
      .then(res => res.json())
      .then(data => {
        if (data && data.student) {
          const s = data.student;
          setServerStudent(s);
          setStudents(prev => {
            const exists = prev.find(p => p.id === s.id);
            if (exists) return prev;
            return [s, ...prev];
          });
        }
      })
      .catch(console.error)
      .finally(() => {
        setDataLoaded(true);
      });
  }, []);

  // Initialize form state from student records
  useEffect(() => {
    if (!dataLoaded) return;

    setFullName(prev => prev || activeStudent?.fullName || currentUser?.fullName || "");
    setPhone(prev => prev || activeStudent?.phone || "");
    setCampusId(prev => prev || activeStudent?.campusId || store.getPrimaryCampus()?.id || "");
    setCampus(prev => prev || activeStudent?.campus || store.getPrimaryCampus()?.name || "Main Campus");
    setDepartment(prev => prev || activeStudent?.department || "");
    setSemester(prev => prev || activeStudent?.semester || "");
    setSelectedClassId(prev => prev || activeStudent?.classId || "");

    if (activeStudent?.classId && academicData.classes.length > 0) {
      const ec2 = academicData.classes.find(c => c.id === activeStudent.classId);
      if (ec2) {
        setSelectedCourseId(prev => prev || ec2.course_id || "");
        setSelectedBranchId(prev => prev || ec2.branch_id || "");
        setSelectedSpecializationId(prev => prev || ec2.specialization_id || "");
        setSelectedCourse(prev => prev || ec2.course_name || ec2.course || "");
        setSelectedYear(prev => prev || ec2.semester || "");
        setSelectedSection(prev => prev || ec2.section || "");
      }
    }

    setPrimaryStopId(prev => prev || activeStudent?.primaryStopId || stops[0]?.id || "");
    setEmergencyName(prev => prev || (activeStudent?.emergencyContact?.name !== "Campus Desk" ? (activeStudent?.emergencyContact?.name || "") : ""));
    setEmergencyPhone(prev => prev || activeStudent?.emergencyContact?.phone || "");
    setPhotoUrl(prev => prev || activeStudent?.photoUrl || "");

    const userEmail = currentUser?.email || "";
    let autoId = "";
    if (userEmail) {
      const localPart = userEmail.split("@")[0] || "";
      const match = localPart.match(/\b\d{7,10}\b/) || localPart.match(/([a-zA-Z]{1,4}-\d{6,10})/i);
      if (match) autoId = match[0].toUpperCase();
    }
    setStudentIdCode(prev => prev || activeStudent?.studentIdCode || autoId || "");

    const existingLat = (activeStudent as any)?.home_latitude || (activeStudent as any)?.homeLatitude;
    const existingLng = (activeStudent as any)?.home_longitude || (activeStudent as any)?.homeLongitude;
    if (existingLat && existingLng) {
      setHomeLat(Number(existingLat));
      setHomeLng(Number(existingLng));
      runAutoStopAndZoneDetection(Number(existingLat), Number(existingLng));
    }
    if ((activeStudent as any)?.home_address || (activeStudent as any)?.homeAddress) {
      setHomeAddress((activeStudent as any)?.home_address || (activeStudent as any)?.homeAddress);
    }
  }, [dataLoaded, activeStudent, currentUser, academicData.classes, stops]);

  // ── Draft Restoration on Mount (Survives Refresh, Navigation, and Tab Sleeping) ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("razorpay_payment_id") || params.has("razorpay_payment_link_id")) {
      return; // Actively verifying payment, do not override
    }

    const draft = loadOnboardingDraft(currentUser?.id);
    if (draft) {
      if (draft.activeStep) setActiveStep(draft.activeStep);
      if (draft.homeAddress) {
        setHomeAddress(draft.homeAddress);
        setAddressSearchQuery(draft.addressSearchQuery || draft.homeAddress);
      }
      if (draft.homeLat && draft.homeLng) {
        setHomeLat(draft.homeLat);
        setHomeLng(draft.homeLng);
      }
      if (draft.primaryStopId) setPrimaryStopId(draft.primaryStopId);
      if (draft.autoAssignedStopId) setAutoAssignedStopId(draft.autoAssignedStopId);
      if (draft.selectedZoneCode) setSelectedZoneCode(draft.selectedZoneCode);
      if (draft.assignedRouteName) setAssignedRouteName(draft.assignedRouteName);
      if (draft.assignedRouteId) setAssignedRouteId(draft.assignedRouteId);
      if (draft.walkingDistanceMeters) setWalkingDistanceMeters(draft.walkingDistanceMeters);
      if (draft.walkingTimeMins) setWalkingTimeMins(draft.walkingTimeMins);
      if (draft.semesterFee) setSemesterFee(draft.semesterFee);

      if (draft.fullName) setFullName(draft.fullName);
      if (draft.phone) setPhone(draft.phone);
      if (draft.studentIdCode) setStudentIdCode(draft.studentIdCode);
      if (draft.campusId) setCampusId(draft.campusId);
      if (draft.campus) setCampus(draft.campus);
      if (draft.department) setDepartment(draft.department);
      if (draft.semester) setSemester(draft.semester);
      if (draft.selectedCourseId) setSelectedCourseId(draft.selectedCourseId);
      if (draft.selectedBranchId) setSelectedBranchId(draft.selectedBranchId);
      if (draft.selectedSpecializationId) setSelectedSpecializationId(draft.selectedSpecializationId);
      if (draft.selectedYear) setSelectedYear(draft.selectedYear);
      if (draft.selectedSection) setSelectedSection(draft.selectedSection);
      if (draft.selectedClassId) setSelectedClassId(draft.selectedClassId);
      if (draft.emergencyName) setEmergencyName(draft.emergencyName);
      if (draft.emergencyPhone) setEmergencyPhone(draft.emergencyPhone);
      if (draft.photoUrl) {
        setPhotoUrl(draft.photoUrl);
        setLocalPreviewUrl(draft.localPreviewUrl || draft.photoUrl);
      }
      setIsDraftRestored(true);
    }
  }, [currentUser?.id]);

  // ── Real-Time Auto-Save with 300ms Debounce ───────────────────────────
  useEffect(() => {
    if (!dataLoaded || isDraftCleared) return;
    if (isPassApproved || paymentVerificationState === "SUCCESS" || paymentVerificationState === "VERIFYING") return;

    const timer = setTimeout(() => {
      saveOnboardingDraft(currentUser?.id, {
        version: 1,
        activeStep,
        homeAddress,
        addressSearchQuery,
        homeLat,
        homeLng,
        primaryStopId,
        autoAssignedStopId,
        selectedZoneCode,
        assignedRouteName,
        assignedRouteId,
        walkingDistanceMeters,
        walkingTimeMins,
        semesterFee,
        fullName,
        phone,
        studentIdCode,
        campusId,
        campus,
        department,
        semester,
        selectedCourseId,
        selectedBranchId,
        selectedSpecializationId,
        selectedYear,
        selectedSection,
        selectedClassId,
        emergencyName,
        emergencyPhone,
        photoUrl,
        localPreviewUrl: localPreviewUrl?.startsWith("blob:") ? "" : localPreviewUrl,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [
    dataLoaded,
    isDraftCleared,
    isPassApproved,
    paymentVerificationState,
    currentUser?.id,
    activeStep,
    homeAddress,
    addressSearchQuery,
    homeLat,
    homeLng,
    primaryStopId,
    autoAssignedStopId,
    selectedZoneCode,
    assignedRouteName,
    assignedRouteId,
    walkingDistanceMeters,
    walkingTimeMins,
    semesterFee,
    fullName,
    phone,
    studentIdCode,
    campusId,
    campus,
    department,
    semester,
    selectedCourseId,
    selectedBranchId,
    selectedSpecializationId,
    selectedYear,
    selectedSection,
    selectedClassId,
    emergencyName,
    emergencyPhone,
    photoUrl,
    localPreviewUrl,
  ]);

  // Reset Draft Helper
  const handleResetDraft = () => {
    clearOnboardingDraft(currentUser?.id);
    setIsDraftCleared(true);
    setIsDraftRestored(false);
    setActiveStep(1);
    setPhone("");
    setPhotoUrl("");
    setLocalPreviewUrl("");
    setStudentIdCode("");
    setSelectedClassId("");
    setSelectedSection("");
    setSelectedYear("");
    setSelectedSpecializationId("");
    setSelectedBranchId("");
    setSelectedCourseId("");
    showToast("info", "Onboarding form reset. You can start fresh.", "Draft Cleared");
  };

  // Initial smart auto-stop detection as soon as stops & routes are available
  useEffect(() => {
    if (stops.length > 0 && homeLat && homeLng && !autoAssignedStopId) {
      runAutoStopAndZoneDetection(homeLat, homeLng);
    }
  }, [stops.length, homeLat, homeLng, autoAssignedStopId]);

  const assignedStop = useMemo(() => {
    return (
      stops.find(s => s.id === primaryStopId) ||
      stops.find(s => s.id === autoAssignedStopId) ||
      undefined
    );
  }, [stops, primaryStopId, autoAssignedStopId]);

  const assignedRoute = useMemo(() => {
    if (assignedRouteId) {
      const found = routes.find(r => r.id === assignedRouteId);
      if (found) return found;
    }
    if (assignedStop) {
      return (
        routes.find(r =>
          r.stops?.some((rs: any) => (rs.stopId || (rs as any).stop_id) === assignedStop.id)
        ) || null
      );
    }
    return null;
  }, [routes, assignedRouteId, assignedStop]);

  // Regional Landmark Shortcuts for Zero-Friction 1-Tap Search
  const regionalLandmarks = useMemo(() => {
    const isDehradunCampus = (campus || "").toLowerCase().includes("dehradun") || (campusId || "").toLowerCase().includes("geu");
    if (isDehradunCampus) {
      return [
        { name: "Clement Town", query: "Clement Town, Dehradun", lat: 30.2687, lng: 77.9954 },
        { name: "ISBT Dehradun", query: "ISBT Dehradun", lat: 30.2882, lng: 78.0081 },
        { name: "Clock Tower", query: "Clock Tower, Dehradun", lat: 30.3244, lng: 78.0427 },
        { name: "Ballupur Chowk", query: "Ballupur, Dehradun", lat: 30.3391, lng: 78.0163 },
        { name: "Rispana Bridge", query: "Rispana Bridge, Dehradun", lat: 30.2987, lng: 78.0583 },
      ];
    }
    return [
      { name: "Mukhani Chauraha", query: "Mukhani, Haldwani", lat: 29.2185, lng: 79.5126 },
      { name: "Haldwani Bus Stand", query: "Haldwani Bus Station", lat: 29.2155, lng: 79.5255 },
      { name: "Kathgodam Stn", query: "Kathgodam Railway Station", lat: 29.2718, lng: 79.5441 },
      { name: "Pili Kothi", query: "Pili Kothi, Haldwani", lat: 29.2320, lng: 79.5160 },
      { name: "Lal Kuan", query: "Lal Kuan, Uttarakhand", lat: 29.0760, lng: 79.5120 },
      { name: "Tallital Nainital", query: "Tallital, Nainital", lat: 29.3833, lng: 79.4667 },
    ];
  }, [campus, campusId]);

  // DATA LEAK SECURITY GUARD:
  // In student pin-drop mode, ONLY pass the assigned stop to the map.
  const stopsForMap = useMemo(() => {
    if (assignedStop) return [assignedStop];
    return [];
  }, [assignedStop]);

  // Filter alternative stop catalog strictly to student's campus corridor
  const availableStopsForCampus = useMemo(() => {
    const campusObj = campuses.find(c => c.id === campusId) || store.getPrimaryCampus();
    const campusName = (campusObj?.name || campus || "").toLowerCase();
    const cId = String(campusObj?.id || campusId || "").toLowerCase();
    const isDehradun = campusName.includes("dehradun") || cId.includes("dehradun") || cId.includes("geu");
    const isBhimtal = campusName.includes("bhimtal") || campusName.includes("haldwani") || cId.includes("bhimtal");

    return stops.filter(s => {
      const sCampusId = String((s as any).campusId || (s as any).campus_id || "").toLowerCase();
      if (sCampusId && (sCampusId === cId || (isDehradun && sCampusId.includes("dehradun")) || (isBhimtal && sCampusId.includes("bhimtal")))) {
        return true;
      }
      const isStopInBhimtalHaldwani = s.latitude < 29.8 && s.longitude > 79.0;
      const isStopInDehradun = s.latitude > 30.0 && s.longitude < 78.5;
      if (isBhimtal && isStopInBhimtalHaldwani) return true;
      if (isDehradun && isStopInDehradun) return true;

      const sName = (s.name || "").toLowerCase();
      if (isDehradun && (sName.includes("dehradun") || sName.includes("clement") || sName.includes("bell road") || sName.includes("subhash nagar"))) return true;
      if (isBhimtal && (sName.includes("bhimtal") || sName.includes("haldwani") || sName.includes("nainital") || sName.includes("kathgodam") || sName.includes("mukhani") || sName.includes("lamachaur") || sName.includes("lalkuan") || sName.includes("tallital"))) return true;
      return !isDehradun && !isBhimtal;
    });
  }, [stops, campus, campusId, campuses]);

  if (paymentVerificationState === "VERIFYING") {
    return (
      <div className="min-h-screen bg-gray-50/80 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xl text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-inner">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
              Verifying Payment with Razorpay
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Securing digital transit credentials and activating zero-touch Face ID clearance. Please do not close this window...
            </p>
          </div>
          <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-2/3 animate-pulse rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (paymentVerificationState === "SUCCESS") {
    return (
      <div className="min-h-screen bg-gray-50/80 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-lg w-full p-6 sm:p-8 rounded-3xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/80 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-300 relative overflow-hidden">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Success Check Badge */}
          <div className="relative mx-auto w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="w-9 h-9 stroke-[2.5]" />
          </div>

          <div className="space-y-1 relative z-10">
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Clearance Granted
            </span>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white pt-2">
              Transit Pass Activated! 🎉
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
              Your semester transit pass, dynamic QR commuter ID, and zero-touch Face ID are now active on all fleet buses.
            </p>
          </div>

          {/* Pass Identity Card */}
          <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 text-left flex items-center gap-3.5 relative z-10">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={fullName}
                className="w-14 h-16 rounded-xl object-cover border border-emerald-500/40 shadow-xs shrink-0"
              />
            ) : (
              <div className="w-14 h-16 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 shrink-0">
                <BusFront className="w-7 h-7" />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-white truncate">
                {fullName || "Student Commuter"}
              </h4>
              <p className="text-xs font-mono text-gray-500 dark:text-gray-400">
                ERP ID: {studentIdCode || "230111075"}
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span>Stop: {assignedStop?.name || "Assigned Stop"}</span>
                <span>•</span>
                <span>Zone {selectedZoneCode.replace("ZONE_", "")}</span>
              </div>
            </div>
          </div>

          {/* Automatic Redirect Progress */}
          <div className="space-y-3 relative z-10">
            <div className="w-full bg-gray-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 w-full animate-pulse rounded-full" />
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center justify-center gap-1.5 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Redirecting to your Commuter Hub...
            </p>

            <button
              type="button"
              onClick={() => {
                window.location.href = "/portal";
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Open My Commute Hub Now</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black text-emerald-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/80 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-20">
      {/* Sticky Responsive Header */}
      <OnboardingHeader onBack={() => router.push("/portal")} />

      <div className="flex-1 w-full max-w-4xl mx-auto py-1.5 sm:py-8 px-0 sm:px-6 space-y-3 sm:space-y-6 animate-in fade-in duration-300">
        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed top-5 right-5 z-[9999] max-w-sm sm:max-w-md w-[calc(100%-2.5rem)] animate-in slide-in-from-top-4 fade-in duration-300">
            <div className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-start gap-3 transition-all ${
              toast.type === "success"
                ? "bg-zinc-900/95 text-zinc-100 border-emerald-500/50 shadow-emerald-950/30"
                : toast.type === "error"
                ? "bg-zinc-900/95 text-zinc-100 border-rose-500/50 shadow-rose-950/30"
                : toast.type === "warning"
                ? "bg-zinc-900/95 text-zinc-100 border-amber-500/50 shadow-amber-950/30"
                : "bg-zinc-900/95 text-zinc-100 border-zinc-700/60 shadow-zinc-950/40"
            }`}>
              <div className="shrink-0 mt-0.5">
                {toast.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {toast.type === "error" && <AlertCircle className="w-5 h-5 text-rose-400" />}
                {toast.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {toast.type === "info" && <Info className="w-5 h-5 text-sky-400" />}
              </div>
              <div className="flex-1 min-w-0 pr-1">
                {toast.title && <h4 className="text-sm font-semibold text-white mb-0.5">{toast.title}</h4>}
                <p className="text-xs text-zinc-300 leading-relaxed">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Draft Restored Banner */}
        {isDraftRestored && !isDraftCleared && (activeStep > 1 || Boolean(phone || photoUrl)) && (
          <div className="mx-3 sm:mx-0 px-3.5 py-2.5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-2 text-xs text-emerald-900 dark:text-emerald-200 shadow-2xs">
            <div className="flex items-center gap-2 truncate">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="truncate">Draft restored from your last session (Step {activeStep} of 3)</span>
            </div>
            <button
              type="button"
              onClick={handleResetDraft}
              className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline shrink-0 cursor-pointer"
            >
              Reset Form
            </button>
          </div>
        )}

        {/* Responsive Step Navigation Tabs */}
        <div className="px-3 sm:px-0">
          <OnboardingStepNav activeStep={activeStep} onSelectStep={setActiveStep} />
        </div>

        {/* STEP 1: HOME LOCATION & ROUTE ALLOCATION */}
        {activeStep === 1 && (
          <StepHomeAndRoute
            homeAddress={homeAddress}
            addressSearchQuery={addressSearchQuery}
            isGeocodingAddress={isGeocodingAddress}
            isResolvingAddress={isResolvingAddress}
            searchSuggestions={searchSuggestions}
            isSearchingSuggestions={isSearchingSuggestions}
            showSuggestionsDropdown={showSuggestionsDropdown}
            fuzzySuggestions={fuzzySuggestions}
            fuzzyNotice={fuzzyNotice}
            regionalLandmarks={regionalLandmarks}
            homeLat={homeLat}
            homeLng={homeLng}
            stopsForMap={stopsForMap}
            assignedStop={assignedStop}
            assignedRoute={assignedRoute}
            allStops={stops}
            primaryStopId={primaryStopId}
            selectedZoneCode={selectedZoneCode}
            assignedRouteName={assignedRouteName}
            walkingDistanceMeters={walkingDistanceMeters}
            walkingTimeMins={walkingTimeMins}
            isOutOfServiceArea={isOutOfServiceArea}
            serviceAreaWarning={serviceAreaWarning}
            showAllStopsPicker={showAllStopsPicker}
            stopSearchQuery={stopSearchQuery}
            availableStopsForCampus={availableStopsForCampus}
            isDetectingGPS={isDetectingGPS}
            onAddressInputChange={handleAddressInputChange}
            onSearchAddress={handleSearchAddress}
            onClearAddress={handleClearAddress}
            onSelectSuggestion={handleSelectSuggestion}
            onDetectGPS={handleDetectGPS}
            onMapLocationSelect={handleMapLocationSelect}
            onToggleAllStopsPicker={() => setShowAllStopsPicker(prev => !prev)}
            onStopSearchQueryChange={setStopSearchQuery}
            onSelectPickupStop={handleSelectPickupStop}
            onContinue={() => setActiveStep(2)}
          />
        )}

        {/* STEP 2: STUDENT IDENTITY, ACADEMIC COHORT & SPECIALIZATION */}
        {activeStep === 2 && (
          <StepProfileAndId
            studentId={activeStudent?.id}
            fullName={fullName}
            phone={phone}
            studentIdCode={studentIdCode}
            campusId={campusId}
            campusOptions={campusOptions}
            isCampusLocked={isCampusLocked}
            courseOptions={courseOptions}
            selectedCourseId={selectedCourseId}
            branchOptions={branchOptions}
            selectedBranchId={selectedBranchId}
            specializationOptions={specializationOptions}
            selectedSpecializationId={selectedSpecializationId}
            semesterOptions={semesterOptions}
            selectedYear={selectedYear}
            sectionOptions={sectionOptions}
            selectedSection={selectedSection}
            currentMatchedClass={currentMatchedClass}
            emergencyName={emergencyName}
            emergencyPhone={emergencyPhone}
            photoUrl={photoUrl}
            localPreviewUrl={localPreviewUrl}
            isUploadingPhoto={isUploadingPhoto}
            isPhotoLocked={isPhotoLocked}
            imageLoadFailed={imageLoadFailed}
            onFullNameChange={setFullName}
            onPhoneChange={setPhone}
            onStudentIdCodeChange={setStudentIdCode}
            onCampusChange={(val) => {
              setCampusId(val);
              const c = campuses.find(camp => camp.id === val);
              if (c) setCampus(c.name);
            }}
            onCourseChange={(val) => {
              setSelectedCourseId(val);
              setSelectedBranchId("");
              setSelectedSpecializationId("");
              setSelectedYear("");
              setSelectedSection("");
              setSelectedClassId("");
              const crs = academicData.courses.find(c => c.id === val);
              if (crs) setSelectedCourse(crs.short_name);
            }}
            onBranchChange={(val) => {
              setSelectedBranchId(val);
              setSelectedSpecializationId("");
              setSelectedSection("");
              setSelectedClassId("");
              const br = academicData.branches.find(b => b.id === val);
              if (br) setDepartment(br.name);
            }}
            onSpecializationChange={(val) => {
              setSelectedSpecializationId(val);
              setSelectedSection("");
              setSelectedClassId("");
            }}
            onSemesterChange={(val) => {
              setSelectedYear(val);
              setSemester(val);
              setSelectedSection("");
              setSelectedClassId("");
            }}
            onSectionChange={(val) => {
              setSelectedSection(val);
              const matched = academicData.classes.find(
                c => (selectedSpecializationId ? c.specialization_id === selectedSpecializationId : true) &&
                     c.semester === selectedYear &&
                     c.section === val
              );
              if (matched) {
                setSelectedClassId(matched.id);
              } else {
                setSelectedClassId("");
              }
            }}
            onEmergencyNameChange={setEmergencyName}
            onEmergencyPhoneChange={setEmergencyPhone}
            isFaceIdEnrolled={Boolean(photoUrl)}
            onFaceIdEnrolled={(avatarUrl) => {
              setPhotoUrl(avatarUrl);
              setLocalPreviewUrl(avatarUrl);
              setImageLoadFailed(false);
              showToast("success", "Live pass photo verified & Biometric Face ID active!", "Verified");
            }}
            onPhotoFileChange={handlePhotoFileChange}
            onClearPhoto={handleClearPhoto}
            onBack={() => setActiveStep(1)}
            onContinue={() => {
              if (!phone.trim()) {
                showToast("warning", "Please provide a valid contact phone number.", "Phone Required");
                return;
              }
              if (!photoUrl && !localPreviewUrl) {
                showToast("error", "Official commuter pass photo required.", "Photo Required");
                return;
              }
              setActiveStep(3);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        )}

        {/* STEP 3: ACTIVATION & PAYMENT */}
        {activeStep === 3 && (
          <StepActivatePass
            fullName={fullName}
            studentIdCode={studentIdCode}
            photoUrl={photoUrl || localPreviewUrl}
            assignedStop={assignedStop}
            selectedZoneCode={selectedZoneCode}
            semesterFee={semesterFee}
            isSubmitting={isSubmitting}
            isRazorpayLoading={isRazorpayLoading}
            onSaveAndCheckout={handleSaveAndCheckout}
            onBack={() => setActiveStep(2)}
          />
        )}
      </div>
    </div>
  );
}
