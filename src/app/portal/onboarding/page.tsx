"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { store } from "@/lib/store";
import { Student, TransitZone, Campus, Stop, Route } from "@/lib/types";
import {
  GraduationCap,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  User,
  HeartHandshake,
  Compass,
  Upload,
  Lock,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Navigation,
  Clock,
  Check,
  BusFront,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Phone,
  CreditCard,
  Search,
  Crosshair,
  Route as RouteIcon,
  BadgeIndianRupee,
  CalendarCheck,
  Building2,
} from "lucide-react";
import { isStudentSubscriptionActive } from "@/lib/subscription-utils";
import { CustomDropdown } from "@/components/common/CustomDropdown";
import { detectCommuterZoneAndStop } from "@/lib/zone-detector";

// Dynamically load the high-performance Leaflet/Google CampusFleetMap client-side
const CampusFleetMap = dynamic(() => import("@/components/maps/CampusFleetMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-2xl bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
      <div className="flex flex-col items-center gap-2 text-zinc-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="text-xs font-medium">Initializing Interactive Transit Map...</span>
      </div>
    </div>
  ),
});

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const [students, setStudents] = useState(store.getStudents());
  const [campuses, setCampuses] = useState<Campus[]>(() => store.getCampuses());
  const [stops, setStops] = useState<Stop[]>(() => store.getStops());
  const [routes, setRoutes] = useState<Route[]>(() => store.getRoutes());
  const [transitZones, setTransitZones] = useState<TransitZone[]>(() => store.getTransitZones(store.getPrimaryCampus()?.id));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRazorpayLoading, setIsRazorpayLoading] = useState(false);

  // Active Wizard Step: 1 = Profile, 2 = Home & Stop Allocation, 3 = Payment & Pass Activation
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Toast Notification state
  const [toast, setToast] = useState<{
    id: string;
    type: "success" | "error" | "warning" | "info";
    title?: string;
    message: string;
  } | null>(null);

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
    students.find(
      s => s.email?.toLowerCase() === currentUser?.email?.toLowerCase() || (currentUser?.id && s.userId === currentUser.id)
    );

  // Form State - Student Profile
  const [fullName, setFullName] = useState("");
  const [campusId, setCampusId] = useState(() => store.getPrimaryCampus()?.id || "");
  const [campus, setCampus] = useState(() => store.getPrimaryCampus()?.name || "Main Campus");
  const [department, setDepartment] = useState("");
  const [semester, setSemester] = useState("");
  const [classesList, setClassesList] = useState<any[]>([]);
  const [academicData, setAcademicData] = useState<{
    courses: any[];
    branches: any[];
    specializations: any[];
    sections: any[];
    classes: any[];
  }>({ courses: [], branches: [], specializations: [], sections: [], classes: [] });

  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedSpecializationId, setSelectedSpecializationId] = useState("");
  const [selectedCourse, setSelectedCourse] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");

  const [phone, setPhone] = useState("");
  const [studentIdCode, setStudentIdCode] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("Parent / Guardian");
  const [photoUrl, setPhotoUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Home Location & Smart Allocation state (ZERO MANUAL LAT/LNG!)
  const [homeAddress, setHomeAddress] = useState("Mukhani, Haldwani, Uttarakhand, 263141");
  const [addressSearchQuery, setAddressSearchQuery] = useState("");
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
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
  const [nearestStops, setNearestStops] = useState<any[]>([]);
  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingHome, setIsSavingHome] = useState(false);
  const [showAllStopsPicker, setShowAllStopsPicker] = useState(false);
  const [stopSearchQuery, setStopSearchQuery] = useState("");

  const isPassApproved = isStudentSubscriptionActive(activeStudent);
  const isPhotoLocked = isPassApproved;
  const isZoneLocked = isPassApproved;
  const isCampusLocked = isPassApproved;

  // Cascaded lists derived from academic hierarchy
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
    if (!selectedSpecializationId || !selectedYear) return [];
    const matched = academicData.classes.filter(
      c => c.specialization_id === selectedSpecializationId && c.semester === selectedYear
    );
    if (matched.length === 0) {
      return (academicData.sections || []).map(s => ({
        id: s.id,
        code: s.code,
        name: s.name,
      }));
    }
    return matched.map(m => ({
      id: m.section_id || m.id,
      code: m.section,
      name: m.section_name || `Section ${m.section}`,
      classId: m.id,
    }));
  }, [academicData.classes, academicData.sections, selectedSpecializationId, selectedYear]);

  const currentMatchedClass = useMemo(() => {
    if (selectedClassId) {
      return academicData.classes.find(c => c.id === selectedClassId) || null;
    }
    if (selectedSpecializationId && selectedYear && selectedSection) {
      return academicData.classes.find(
        c => c.specialization_id === selectedSpecializationId &&
             c.semester === selectedYear &&
             c.section === selectedSection
      ) || null;
    }
    return null;
  }, [academicData.classes, selectedClassId, selectedSpecializationId, selectedYear, selectedSection]);

  const institutionalEmailPreview = useMemo(() => {
    if (!studentIdCode.trim()) return "";
    const nameSlug = (fullName || currentUser?.fullName || "student")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const domain = (campus && campus.toLowerCase().includes("deemed")) || campusId?.toLowerCase().includes("geu")
      ? "geu.ac.in"
      : "gehu.ac.in";
    return `${nameSlug}.${studentIdCode.trim().toLowerCase()}@${domain}`;
  }, [studentIdCode, fullName, currentUser, campus, campusId]);

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
      setPrimaryStopId(prev => prev || result.nearestStop.id);
      setWalkingDistanceMeters(result.walkingDistanceMeters);
      setWalkingTimeMins(result.walkingTimeMins);
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

  // Forward Geocode Address Search Handler
  const handleSearchAddress = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = (addressSearchQuery || homeAddress).trim();
    if (!query) {
      showToast("warning", "Please type your street, colony, or landmark name.", "Address Required");
      return;
    }

    setIsGeocodingAddress(true);
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
      } else {
        showToast("error", data.message || "Could not locate address. Try with city name.", "Search Not Found");
      }
    } catch (err: any) {
      showToast("error", err.message || "Geocoding network error", "Search Error");
    } finally {
      setIsGeocodingAddress(false);
    }
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

  // Check for Razorpay Callback in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get("razorpay_payment_id");
    const linkId = params.get("razorpay_payment_link_id");
    const refId = params.get("razorpay_payment_link_reference_id");
    const status = params.get("razorpay_payment_link_status");
    const sig = params.get("razorpay_signature");

    if (paymentId && linkId && sig) {
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
            showToast("success", "🎉 Payment Verified! Your semester transit pass is officially unlocked.", "Access Granted");
            window.history.replaceState({}, document.title, window.location.pathname);
            setTimeout(() => {
              router.push("/portal");
            }, 1800);
          } else {
            showToast("error", data.error || "Failed to verify transaction.", "Verification Failed");
          }
        })
        .catch(err => {
          setIsRazorpayLoading(false);
          showToast("error", err.message || "Network error verifying payment.", "Network Error");
        });
    }
  }, [router]);

  // Save profile and trigger Razorpay Checkout
  const handleSaveAndCheckout = async () => {
    if (!phone.trim()) {
      showToast("warning", "Please fill in your Contact Phone Number.", "Phone Required");
      setActiveStep(2);
      return;
    }

    if (!photoUrl) {
      showToast("error", "You must upload an official ID photo before activating your pass.", "Photo Required");
      setActiveStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setIsSubmitting(true);
    const targetStudentId = activeStudent?.id || `stud-${currentUser?.id || Date.now()}`;
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

      // 2. Sync home location & auto stop allocation with PostgreSQL backend
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

      // 3. Initiate Seamless Razorpay Hosted Checkout
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

  // Initialize form state
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
    setEmergencyRel(prev => prev || activeStudent?.emergencyContact?.relationship || "Parent / Guardian");
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

  const assignedStop = useMemo(() => {
    return stops.find(s => s.id === primaryStopId) || stops.find(s => s.id === autoAssignedStopId) || stops[0];
  }, [stops, primaryStopId, autoAssignedStopId]);

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black text-emerald-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/80 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-20">
      {/* Modern High-End Transit Header */}
      <div className="w-full bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-b border-gray-200/80 dark:border-zinc-800 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 text-emerald-600 dark:text-emerald-400">
              <BusFront className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-tight">
                Transit Pass Onboarding & Activation
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Zero friction • Automated route & stop allocation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> 256-bit Encrypted
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 space-y-6 animate-in fade-in duration-300">
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

        {/* ─── Modern Step Navigation Tabs ─── */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 p-1.5 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeStep === 1
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
            }`}
          >
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="truncate">1. Home & Route</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep(2)}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeStep === 2
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
            }`}
          >
            <User className="w-4 h-4 shrink-0" />
            <span className="truncate">2. Profile & ID</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStep(3)}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeStep === 3
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800"
            }`}
          >
            <CreditCard className="w-4 h-4 shrink-0" />
            <span className="truncate">3. Activate Pass</span>
          </button>
        </div>

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 1: HOME LOCATION, ADDRESS SEARCH & INTERACTIVE PIN-DROP     */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {activeStep === 1 && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  Home Location & Interactive Pin Drop
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Type your home address or drop the pin on the map. We automatically assign your transit corridor, nearest bus stop, and zone tier!
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
                <MapPin className="w-6 h-6" />
              </div>
            </div>

            {/* Modern Address Search Bar (Google Maps / Citymapper Standard) */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center justify-between">
                <span>Search Home Address or Area</span>
                {isResolvingAddress && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5 animate-pulse">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving address...
                  </span>
                )}
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                    <Search className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={addressSearchQuery || homeAddress}
                    onChange={e => {
                      setAddressSearchQuery(e.target.value);
                      setHomeAddress(e.target.value);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearchAddress();
                      }
                    }}
                    placeholder="e.g. Mukhani Chauraha, Haldwani"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 shadow-2xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSearchAddress()}
                    disabled={isGeocodingAddress}
                    className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isGeocodingAddress ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    <span>Locate</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDetectGPS}
                    disabled={isDetectingGPS}
                    className="px-4 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 hover:bg-gray-100 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 font-bold text-xs shadow-2xs transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    title="Detect Current GPS Location"
                  >
                    <Navigation className={`w-4 h-4 ${isDetectingGPS ? "animate-spin text-emerald-600" : "text-emerald-600 dark:text-emerald-400"}`} />
                    <span className="hidden sm:inline">Use Current GPS</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Interactive CampusFleet Map with Tactile Pin Drop */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span className="font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-emerald-600" />
                  Tap anywhere on map or drag pin to your exact building entrance
                </span>
                <span className="font-mono text-[11px] bg-gray-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">
                  Pin Locked
                </span>
              </div>

              <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-zinc-800 shadow-sm relative z-0">
                <CampusFleetMap
                  interactiveMode="PIN_DROP"
                  draftPinLocation={[homeLat, homeLng]}
                  onMapClick={handleMapLocationSelect}
                  stops={stops}
                  selectedStopId={primaryStopId}
                  height="340px"
                  zoom={15}
                  showUserLocation={true}
                  tileTheme="GOOGLE_STREETS"
                />
              </div>
            </div>

            {/* Automated Transit Match Summary Card */}
            <div className="p-5 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-sm font-bold text-emerald-950 dark:text-emerald-200">
                    Auto-Matched Transit Allocation
                  </h3>
                </div>
                <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  Zone {selectedZoneCode.replace("ZONE_", "")}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-xs">
                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
                  <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    <RouteIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Assigned Route</span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white truncate">
                    {assignedRouteName}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
                  <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Nearest Pickup Stop</span>
                  </div>
                  <p className="font-bold text-gray-900 dark:text-white truncate" title={assignedStop?.name}>
                    {assignedStop?.name || "Corridor Stop"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-100 dark:border-zinc-800 space-y-1">
                  <div className="text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Walking Distance</span>
                  </div>
                  <p className="font-bold text-emerald-700 dark:text-emerald-400">
                    {walkingDistanceMeters}m • ~{walkingTimeMins} min walk
                  </p>
                </div>
              </div>

              {/* Optional Alternative Stops Accordion */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAllStopsPicker(prev => !prev)}
                  className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {showAllStopsPicker ? "Hide alternative stops" : "Prefer a different boarding stop? Choose from corridor catalog →"}
                </button>

                {showAllStopsPicker && (
                  <div className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 space-y-2.5">
                    <input
                      type="text"
                      value={stopSearchQuery}
                      onChange={e => setStopSearchQuery(e.target.value)}
                      placeholder="Search stop by name or landmark..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-800">
                      {stops
                        .filter(s => !stopSearchQuery || s.name.toLowerCase().includes(stopSearchQuery.toLowerCase()))
                        .map(s => {
                          const isCurrent = s.id === primaryStopId;
                          return (
                            <div
                              key={s.id}
                              onClick={() => handleSelectPickupStop(s.id, s.zoneCode, s.name)}
                              className={`p-2.5 flex items-center justify-between text-xs cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-zinc-800 transition-colors ${
                                isCurrent ? "bg-emerald-50 dark:bg-emerald-950/40 font-bold" : ""
                              }`}
                            >
                              <div>
                                <span className="text-gray-900 dark:text-white">{s.name}</span>
                                {s.landmark && <p className="text-[10px] text-gray-400">{s.landmark}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                {isCurrent ? (
                                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                                    <Check className="w-3.5 h-3.5" /> Selected
                                  </span>
                                ) : (
                                  <span className="text-gray-500 hover:text-emerald-600 font-medium">Select</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Profile & Photo</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 2: STUDENT IDENTITY, ACADEMIC COHORT & OFFICIAL PHOTO       */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {activeStep === 2 && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  Student Identity & Official ID Photo
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Required for institutional pass verification, digital rolling QR pass, and conductor scanner validation.
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
            </div>

            {/* Photo Upload Card */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-5 rounded-2xl border border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950">
              <div className="relative shrink-0">
                {(localPreviewUrl || photoUrl) && !imageLoadFailed ? (
                  <img
                    src={
                      localPreviewUrl ||
                      (photoUrl.startsWith("http")
                        ? `/api/photo-proxy?url=${encodeURIComponent(photoUrl)}`
                        : photoUrl)
                    }
                    alt="Passport Photo Preview"
                    crossOrigin="anonymous"
                    referrerPolicy="no-referrer"
                    onError={() => setImageLoadFailed(true)}
                    className="w-28 h-36 object-cover rounded-2xl border-2 border-emerald-500/60 shadow-md bg-zinc-100 dark:bg-zinc-800"
                  />
                ) : (
                  <div className="w-28 h-36 rounded-2xl border-2 border-dashed border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex flex-col items-center justify-center text-gray-400">
                    <User className="w-10 h-10 mb-2 opacity-40 text-emerald-600" />
                    <span className="text-[11px] font-bold text-center px-2">Upload Photo</span>
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-3 text-center sm:text-left">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    Official Passport-Sized Portrait
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Clear front-facing photo against a plain background. Displayed on conductor scanners during boarding.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 pt-1">
                  <label className={`px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-transform active:scale-95 cursor-pointer ${isUploadingPhoto ? "opacity-50 cursor-not-allowed" : ""}`}>
                    {isUploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{isUploadingPhoto ? "Uploading..." : "Upload ID Photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingPhoto || isPhotoLocked}
                      onChange={handlePhotoFileChange}
                      className="hidden"
                    />
                  </label>

                  {(photoUrl || localPreviewUrl) && !isPhotoLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoUrl("");
                        setLocalPreviewUrl("");
                        setImageLoadFailed(false);
                      }}
                      className="px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
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
                  onChange={e => setPhone(e.target.value)}
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
                  onChange={e => setStudentIdCode(e.target.value.trim().toUpperCase())}
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
                  onChange={(val) => {
                    setCampusId(val);
                    const c = campuses.find(camp => camp.id === val);
                    if (c) setCampus(c.name);
                  }}
                />
              </div>
            </div>

            {/* Academic Cohort Cascade */}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500">Degree / Course</label>
                  <CustomDropdown
                    options={courseOptions}
                    value={selectedCourseId}
                    placeholder="Degree"
                    onChange={(val) => {
                      setSelectedCourseId(val);
                      setSelectedBranchId("");
                      setSelectedSpecializationId("");
                      setSelectedYear("");
                      setSelectedSection("");
                      setSelectedClassId("");
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500">Branch / Dept</label>
                  <CustomDropdown
                    disabled={!selectedCourseId || branchOptions.length === 0}
                    options={branchOptions}
                    value={selectedBranchId}
                    placeholder="Branch"
                    onChange={(val) => {
                      setSelectedBranchId(val);
                      setSelectedSpecializationId("");
                      setSelectedSection("");
                      setSelectedClassId("");
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500">Semester</label>
                  <CustomDropdown
                    disabled={!selectedCourseId}
                    options={semesterOptions}
                    value={selectedYear}
                    placeholder="Semester"
                    onChange={(val) => {
                      setSelectedYear(val);
                      setSemester(val);
                      setSelectedSection("");
                      setSelectedClassId("");
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-gray-500">Section</label>
                  <CustomDropdown
                    disabled={!selectedSpecializationId || !selectedYear}
                    options={sectionOptions}
                    value={selectedSection}
                    placeholder="Section"
                    onChange={(val) => {
                      setSelectedSection(val);
                      const matched = academicData.classes.find(
                        c => c.specialization_id === selectedSpecializationId &&
                             c.semester === selectedYear &&
                             c.section === val
                      );
                      if (matched) setSelectedClassId(matched.id);
                    }}
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
                    onChange={e => setEmergencyName(e.target.value)}
                    placeholder="Parent / Guardian Name"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-600 dark:text-gray-400">Guardian Phone</label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={e => setEmergencyPhone(e.target.value)}
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
                onClick={() => setActiveStep(1)}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                ← Back to Home & Route Map
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!phone.trim()) {
                    showToast("warning", "Please provide a valid contact phone number.", "Phone Required");
                    return;
                  }
                  setActiveStep(3);
                }}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Instant Pass Activation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════ */}
        {/* STEP 3: COMBINED INSTANT PAYMENT & PASS ACTIVATION (RAZORPAY)   */}
        {/* ═════════════════════════════════════════════════════════════════ */}
        {activeStep === 3 && (
          <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 animate-in fade-in duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-zinc-800 pb-5">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                  Activate Pass & Unlock Fleet Access
                </h2>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                  1-Click instant activation via Razorpay. Dynamic digital QR pass, seat reservation, and live radar unlock automatically!
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 shrink-0">
                <CreditCard className="w-6 h-6" />
              </div>
            </div>

            {/* Official Transit Pass Card Preview */}
            <div className="p-6 rounded-3xl bg-gradient-to-br from-emerald-950 via-zinc-900 to-black text-white border border-emerald-800/40 shadow-xl space-y-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                    <BusFront className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm tracking-wide">CAMPUSFLEET TRANSIT PASS</h4>
                    <p className="text-[11px] text-zinc-400 font-mono">Academic Semester 2026-27</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold uppercase px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Ready to Activate
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-zinc-800 relative z-10">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Student</span>
                  <p className="text-xs font-bold text-white truncate">{fullName || "Student Commuter"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">ERP ID</span>
                  <p className="text-xs font-mono font-bold text-white">{studentIdCode || "230111075"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Pickup Stop</span>
                  <p className="text-xs font-bold text-white truncate">{assignedStop?.name || "Mukhani"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400">Transit Zone</span>
                  <p className="text-xs font-bold text-emerald-400">Zone {selectedZoneCode.replace("ZONE_", "")}</p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10">
                <div>
                  <span className="text-xs text-zinc-400">Semester Transportation Fee</span>
                  <div className="text-2xl font-black text-white font-mono flex items-center gap-1">
                    <span>₹{semesterFee.toLocaleString()}</span>
                    <span className="text-xs font-normal text-zinc-400">/ Full Semester</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Instant Database Clearance & Pass Issuance</span>
                </div>
              </div>
            </div>

            {/* Instant Razorpay Activation Button */}
            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={handleSaveAndCheckout}
                disabled={isSubmitting || isRazorpayLoading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-98 disabled:opacity-50 text-white font-extrabold text-base shadow-xl shadow-emerald-950/20 flex items-center justify-center gap-3 transition-all cursor-pointer"
              >
                {isSubmitting || isRazorpayLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Preparing Secure Checkout...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Pay ₹{semesterFee.toLocaleString()} & Activate Transit Pass →</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-gray-400 pt-1">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-emerald-600" /> Razorpay 256-bit Secure
                </span>
                <span>•</span>
                <span>UPI / NetBanking / Cards / EMI</span>
                <span>•</span>
                <span>Instant Auto-Unlock</span>
              </div>
            </div>

            {/* Navigation Button */}
            <div className="pt-2 flex justify-start">
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                ← Back to Profile & ID
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
