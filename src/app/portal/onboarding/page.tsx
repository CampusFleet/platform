"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { store } from "@/lib/store";
import { Student, TransitZone, Campus } from "@/lib/types";
import {
  GraduationCap,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  User,
  HeartHandshake,
  Compass,
  Camera,
  Upload,
  Lock,
  Loader2,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Navigation,
  Clock,
  Check,
  BusFront,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  Phone,
} from "lucide-react";
import { isStudentSubscriptionActive } from "@/lib/subscription-utils";
import { CustomDropdown } from "@/components/common/CustomDropdown";

export default function StudentOnboardingPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());
  const [students, setStudents] = useState(store.getStudents());
  const [campuses, setCampuses] = useState<Campus[]>(() => store.getCampuses());
  const [stops, setStops] = useState(store.getStops());
  const [transitZones, setTransitZones] = useState<TransitZone[]>(() => store.getTransitZones(store.getPrimaryCampus()?.id));
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Toast Notification state (Modern Vercel / Linear standard)
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

  // Form State
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

  // Cascaded lists derived from pure relational academic hierarchy
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

  const [selectedZoneCode, setSelectedZoneCode] = useState("ZONE_B");
  const [phone, setPhone] = useState("");
  const [studentIdCode, setStudentIdCode] = useState("");
  const [primaryStopId, setPrimaryStopId] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [emergencyRel, setEmergencyRel] = useState("Parent / Guardian");
  const [photoUrl, setPhotoUrl] = useState("");
  const [localPreviewUrl, setLocalPreviewUrl] = useState("");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Home Location & Commute Stops state
  const [homeAddress, setHomeAddress] = useState("Mukhani, Haldwani, Uttarakhand, 263141");
  const [homeLat, setHomeLat] = useState("29.220936");
  const [homeLng, setHomeLng] = useState("79.514496");
  const [autoAssignedStopId, setAutoAssignedStopId] = useState<string | null>(null);
  const [nearestStops, setNearestStops] = useState<any[]>([]);
  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingHome, setIsSavingHome] = useState(false);
  const [homeStatusMsg, setHomeStatusMsg] = useState<string | null>(null);
  const [isSelectingStop, setIsSelectingStop] = useState(false);
  const [stopSearchQuery, setStopSearchQuery] = useState("");
  const [showAllStopsPicker, setShowAllStopsPicker] = useState(false);

  const isPassApproved = isStudentSubscriptionActive(activeStudent);
  const isPhotoLocked = isPassApproved;
  const isZoneLocked = isPassApproved;
  const isCampusLocked = isPassApproved;

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPhotoLocked) {
      showToast("warning", "Official photo is locked. Only Campus Staff/Admin can update your photo.", "Photo Locked");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingPhoto(true);
    
    try {
      // 1. Client-side image compression
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
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
              }
              width = MAX_WIDTH;
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
              }
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
        showToast("success", "Official photo uploaded successfully.", "Upload Complete");
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
        setHomeLat(lat.toFixed(6));
        setHomeLng(lng.toFixed(6));
        setIsDetectingGPS(false);
        showToast("success", `GPS location locked (${lat.toFixed(4)}, ${lng.toFixed(4)})`, "Coordinates Acquired");
        fetchAddressForCoordinates(lat, lng);
      },
      err => {
        showToast("error", "Failed to acquire GPS location: " + err.message, "GPS Error");
        setIsDetectingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveHomeLocation = async () => {
    const lat = parseFloat(homeLat);
    const lng = parseFloat(homeLng);
    if (isNaN(lat) || isNaN(lng)) {
      showToast("warning", "Please provide valid numeric latitude and longitude coordinates.", "Coordinates Required");
      return;
    }
    const studentId = activeStudent?.id || currentUser?.id;
    if (!studentId) return;

    setIsSavingHome(true);
    setHomeStatusMsg(null);
    try {
      const res = await fetch("/api/students/home-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          latitude: lat,
          longitude: lng,
          address: homeAddress.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to calculate nearest stops");
      if (data.homeLocation?.autoAssignedStopId) {
        setAutoAssignedStopId(data.homeLocation.autoAssignedStopId);
        setPrimaryStopId(data.homeLocation.autoAssignedStopId);
      }
      if (data.homeLocation?.zoneCode && !isZoneLocked) {
        setSelectedZoneCode(data.homeLocation.zoneCode);
      }
      if (data.nearestStops) {
        setNearestStops(data.nearestStops);
      }
      const successMsg = data.message || "Coordinates saved and optimal stops calculated!";
      setHomeStatusMsg(successMsg);
      showToast("success", successMsg, "Stops Calculated");
    } catch (err: any) {
      showToast("error", err.message || "Error saving coordinates", "Calculation Error");
    } finally {
      setIsSavingHome(false);
    }
  };

  const handleSelectPickupStop = async (stopId: string, stopZoneCode?: string, stopName?: string) => {
    setPrimaryStopId(stopId);
    if (stopZoneCode && !isZoneLocked) {
      setSelectedZoneCode(stopZoneCode);
    }
    const studentId = activeStudent?.id || currentUser?.id;
    if (!studentId) return;

    setIsSelectingStop(true);
    try {
      const res = await fetch("/api/students/home-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SELECT_PICKUP_STOP",
          studentId,
          stopId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast("error", data.message || "Failed to update pickup stop", "Stop Selection Failed");
      } else {
        showToast("success", `Boarding stop updated to "${stopName || 'Selected Stop'}"`, "Stop Assigned");
        if (data.student?.zone_code && !isZoneLocked) {
          setSelectedZoneCode(data.student.zone_code);
        }
      }
    } catch (err: any) {
      console.warn("Error selecting pickup stop:", err);
      showToast("error", err.message || "Error selecting pickup stop", "Stop Selection Error");
    } finally {
      setIsSelectingStop(false);
    }
  };

  // Load existing saved home location and nearest stops on mount
  useEffect(() => {
    const studentId = activeStudent?.id || currentUser?.id;
    if (!studentId) return;

    fetch(`/api/students/home-location?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.homeLocation) {
          if (data.homeLocation.address) setHomeAddress(data.homeLocation.address);
          if (data.homeLocation.latitude) setHomeLat(String(data.homeLocation.latitude));
          if (data.homeLocation.longitude) setHomeLng(String(data.homeLocation.longitude));
          if (data.homeLocation.autoAssignedStopId) setAutoAssignedStopId(data.homeLocation.autoAssignedStopId);
          if (data.homeLocation.primaryStopId) setPrimaryStopId(data.homeLocation.primaryStopId);
          if (data.homeLocation.zoneCode && !isZoneLocked) setSelectedZoneCode(data.homeLocation.zoneCode);
          if (data.nearestStops && data.nearestStops.length > 0) {
            setNearestStops(data.nearestStops);
          }
        }
      })
      .catch(() => {});
  }, [activeStudent?.id, currentUser?.id, isZoneLocked]);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      setStudents(store.getStudents());
      setCurrentUser(store.getCurrentUser());
      setCampuses(store.getCampuses());
      setStops(store.getStops());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (campuses.length === 0) {
      fetch("/api/campus")
        .then(res => res.json())
        .then(data => {
          if (data.success && data.campuses) {
            setCampuses(data.campuses);
            if (!campusId && data.campuses.length > 0) {
              const primary = data.campuses.find((c: Campus) => c.isPrimary) || data.campuses[0];
              setCampusId(primary.id);
              setCampus(primary.name);
            }
          }
        })
        .catch(console.error);
    }
  }, [campuses.length, campusId]);

  useEffect(() => {
    setTransitZones(store.getTransitZones(campusId));
  }, [campusId]);

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

    fetch(`/api/students/me?_t=${Date.now()}`, { cache: 'no-store' })
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
    
    setSelectedZoneCode(prev => prev || activeStudent?.zoneCode || "ZONE_B");
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

    if ((activeStudent as any)?.home_latitude || (activeStudent as any)?.homeLatitude) {
      setHomeLat(String((activeStudent as any)?.home_latitude || (activeStudent as any)?.homeLatitude));
    }
    if ((activeStudent as any)?.home_longitude || (activeStudent as any)?.homeLongitude) {
      setHomeLng(String((activeStudent as any)?.home_longitude || (activeStudent as any)?.homeLongitude));
    }
    if ((activeStudent as any)?.home_address || (activeStudent as any)?.homeAddress) {
      setHomeAddress((activeStudent as any)?.home_address || (activeStudent as any)?.homeAddress);
    }
    if ((activeStudent as any)?.auto_assigned_stop_id || (activeStudent as any)?.autoAssignedStopId) {
      setAutoAssignedStopId((activeStudent as any)?.auto_assigned_stop_id || (activeStudent as any)?.autoAssignedStopId);
    }

  }, [dataLoaded, activeStudent, currentUser, academicData.classes, stops]);

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

  const transitZoneOptions = useMemo(() => {
    return transitZones.map(z => ({
      value: z.code,
      label: `${z.name} — ₹${z.semesterFee.toLocaleString()} / Semester`,
      sublabel: z.corridorDescription,
    }));
  }, [transitZones]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      showToast("warning", "Please fill in your Contact Phone Number.", "Phone Required");
      return;
    }

    if (!photoUrl) {
      showToast("error", "You must upload an official ID photo before activating your pass.", "Photo Required");
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    const targetStudentId = activeStudent?.id || `stud-${currentUser?.id || Date.now()}`;
    const chosenClass = classesList.find(c => c.id === selectedClassId);
    const chosenCampus = campuses.find(c => c.id === campusId);

    const latNum = parseFloat(homeLat);
    const lngNum = parseFloat(homeLng);

    const res = await store.updateStudentProfile(targetStudentId, {
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
      photoUrl: photoUrl.trim() || undefined,
      studentIdCode: studentIdCode.trim() || undefined,
      homeLatitude: !isNaN(latNum) ? latNum : undefined,
      homeLongitude: !isNaN(lngNum) ? lngNum : undefined,
      homeAddress: homeAddress.trim() || undefined,
      autoAssignedStopId: autoAssignedStopId || undefined,
      emergencyContact: {
        name: emergencyName.trim() || "Parent / Guardian",
        relationship: emergencyRel,
        phone: emergencyPhone.trim() || phone.trim(),
      },
    });

    if (chosenClass?.id) {
      try {
        await fetch(`/api/students/${targetStudentId}/class`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: chosenClass.id }),
        });
      } catch (err) {
        console.warn("Failed to sync student class with backend", err);
      }
    }

    if (!isNaN(latNum) && !isNaN(lngNum)) {
      try {
        await fetch("/api/students/home-location", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: targetStudentId,
            latitude: latNum,
            longitude: lngNum,
            address: homeAddress.trim(),
          }),
        });
      } catch (locErr) {
        console.warn("Failed to sync home coordinates", locErr);
      }
    }

    setIsSubmitting(false);
    if (res.success) {
      showToast("success", "Student Profile Saved & Verified in Institutional Database!", "Profile Saved");
      setTimeout(() => {
        if (!isPassApproved) {
          router.push("/portal/payments");
        } else {
          router.push("/portal");
        }
      }, 1200);
    } else {
      showToast("error", res.message || "Failed to save profile.", "Save Error");
    }
  };

  if (!dataLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black text-green-600">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col pb-16">
      {/* Settings-Themed Header */}
      <div className="w-full bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="p-2 border border-gray-200 dark:border-gray-800 text-green-600 dark:text-green-400">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-medium text-gray-900 dark:text-white">
                {activeStudent?.phone ? "Profile & Transit Details" : "Profile Setup"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-800 px-3 py-1 flex items-center gap-1.5 uppercase tracking-wider">
              <Lock className="w-3 h-3 text-green-600" /> Secure
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 animate-in fade-in duration-300">
      {/* Toast Notification Container (Floating Top-Right) */}
      {toast && (
        <div className="fixed top-5 right-5 z-[9999] max-w-sm sm:max-w-md w-[calc(100%-2.5rem)] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className={`p-4 rounded-xl shadow-2xl border backdrop-blur-xl flex items-start gap-3 transition-all ${
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
              {toast.title && <h4 className="text-sm font-semibold tracking-tight text-white mb-0.5">{toast.title}</h4>}
              <p className="text-xs text-zinc-300 leading-relaxed font-normal">{toast.message}</p>
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

        <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none shadow-none">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <div>
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Profile Details & Transit Setup</h2>
              <p className="text-xs text-gray-500 mt-1">Complete your student profile for institutional pass issuance and automated route assignment</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* 1. Official Passport Photo */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">Official ID Photo</h3>
                {isPhotoLocked ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                ) : (
                  <span className="text-[10px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 border border-green-200 dark:border-green-800">
                    Required for Pass
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 p-4 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
                <div className="flex-shrink-0">
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
                      onError={() => {
                        setImageLoadFailed(true);
                      }}
                      className="w-24 h-32 object-cover border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                    />
                  ) : photoUrl && imageLoadFailed ? (
                    <img
                      src={photoUrl}
                      alt="Passport Photo Preview"
                      crossOrigin="anonymous"
                      referrerPolicy="no-referrer"
                      className="w-24 h-32 object-cover border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                    />
                  ) : (
                    <div className="w-24 h-32 border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center text-gray-400">
                      <User className="w-8 h-8 mb-2 opacity-50" />
                      <span className="text-[10px] font-medium">No Photo</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full">
                  {isPhotoLocked ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Your official photo has been verified and locked. Only campus transport staff can update this photo.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Upload a clear passport-sized photo. This will be shown to the conductor and scanner during boarding.
                      </p>
                      <div className="flex items-center gap-3">
                        <label className={`px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-none flex items-center gap-2 transition-colors shadow-sm cursor-pointer ${isUploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''}`}>
                          {isUploadingPhoto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          <span>{isUploadingPhoto ? 'Uploading...' : 'Choose File'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={isUploadingPhoto}
                            onChange={handlePhotoFileChange}
                            className="hidden"
                          />
                        </label>
                        {(photoUrl || localPreviewUrl) && !isUploadingPhoto && (
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoUrl("");
                              setLocalPreviewUrl("");
                              setImageLoadFailed(false);
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-3 py-2 transition-colors border border-gray-200 dark:border-gray-800"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 2. Basic Student Identity */}
            <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">Student Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Student Full Name"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm"
                />
              </div>

              {/* Student Mobile Phone */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-mono"
                />
              </div>

              {/* University Campus */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>University Campus</span>
                  {isCampusLocked && (
                    <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Locked
                    </span>
                  )}
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

              {/* University Student ID */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                  <span>University Student ID (ERP Roll ID) *</span>
                  <span className="text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded border border-green-200 dark:border-green-800">
                    College ERP ID
                  </span>
                </label>
                <input
                  type="text"
                  required
                  value={studentIdCode}
                  onChange={e => setStudentIdCode(e.target.value.trim().toUpperCase())}
                  placeholder="e.g. 230111075"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 font-mono text-sm"
                />
              </div>
            </div>

            {/* Live Campus Email Preview */}
            {institutionalEmailPreview && (
              <div className="p-3 border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300 text-xs font-mono flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
                <span>Campus Email: <strong>{institutionalEmailPreview}</strong></span>
                <span className="text-[10px] uppercase font-bold tracking-wider text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/60 px-2 py-0.5 rounded">
                  ERP Synced
                </span>
              </div>
            )}

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 3. Academic Cohort & Section Selection */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">
                Academic Cohort & Section Selection
              </h3>
              {currentMatchedClass && (
                <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40">
                  <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  <span>Verified Cohort</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Step 1: Degree / Course */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  1. Degree / Course *
                </label>
                <CustomDropdown
                  options={courseOptions}
                  value={selectedCourseId}
                  placeholder="Select Degree / Course"
                  onChange={(val) => {
                    setSelectedCourseId(val);
                    setSelectedBranchId("");
                    setSelectedSpecializationId("");
                    setSelectedYear("");
                    setSelectedSection("");
                    setSelectedClassId("");
                    const crs = academicData.courses.find(c => c.id === val);
                    if (crs) setSelectedCourse(crs.short_name);
                  }}
                />
              </div>

              {/* Step 2: Branch / Department */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  2. Discipline / Branch *
                </label>
                <CustomDropdown
                  disabled={!selectedCourseId || branchOptions.length === 0}
                  options={branchOptions}
                  value={selectedBranchId}
                  placeholder="Select Branch"
                  onChange={(val) => {
                    setSelectedBranchId(val);
                    setSelectedSpecializationId("");
                    setSelectedSection("");
                    setSelectedClassId("");
                    const br = academicData.branches.find(b => b.id === val);
                    if (br) setDepartment(br.name);
                  }}
                />
              </div>

              {/* Step 3: Specialization / Track */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  3. Specialization / Track *
                </label>
                <CustomDropdown
                  disabled={!selectedBranchId || specializationOptions.length === 0}
                  options={specializationOptions}
                  value={selectedSpecializationId}
                  placeholder="Select Specialization"
                  onChange={(val) => {
                    setSelectedSpecializationId(val);
                    setSelectedSection("");
                    setSelectedClassId("");
                  }}
                />
              </div>

              {/* Step 4: Semester */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  4. Current Semester *
                </label>
                <CustomDropdown
                  disabled={!selectedCourseId}
                  options={semesterOptions}
                  value={selectedYear}
                  placeholder="Select Semester"
                  onChange={(val) => {
                    setSelectedYear(val);
                    setSemester(val);
                    setSelectedSection("");
                    setSelectedClassId("");
                  }}
                />
              </div>

              {/* Step 5: Section */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  5. Class Section *
                </label>
                <CustomDropdown
                  disabled={!selectedSpecializationId || !selectedYear}
                  options={sectionOptions}
                  value={selectedSection}
                  placeholder="Select Section"
                  onChange={(val) => {
                    setSelectedSection(val);
                    const matched = academicData.classes.find(
                      c => c.specialization_id === selectedSpecializationId &&
                           c.semester === selectedYear &&
                           c.section === val
                    );
                    if (matched) {
                      setSelectedClassId(matched.id);
                    } else {
                      setSelectedClassId("");
                    }
                  }}
                />
              </div>
            </div>

            {/* Verified Matched Class Banner */}
            {currentMatchedClass && (
              <div className="p-3 border border-gray-200 dark:border-gray-800 bg-white dark:bg-black flex items-center justify-between text-xs">
                <span className="text-gray-500">
                  Assigned Timetable Cohort:
                </span>
                <span className="font-medium text-green-700 dark:text-green-400">
                  {currentMatchedClass.name}
                </span>
              </div>
            )}

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 4. Home Location & Commute Stops (Requested) */}
            <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 p-5 sm:p-6 shadow-xs space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 text-xs font-bold font-mono">
                      4
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                      Home Location & Commute Stops
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Configure your residential GPS coordinates for automated nearest boarding stop & route assignment.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
              </div>

              {homeStatusMsg && (
                <div className="p-3.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 dark:bg-emerald-950/40 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-300 text-xs flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  <span className="font-medium">{homeStatusMsg}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      Street / Area Address
                    </label>
                    {isResolvingAddress && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium animate-pulse">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Fetching street address from map...
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={homeAddress}
                    onChange={e => setHomeAddress(e.target.value)}
                    placeholder="Mukhani, Haldwani, Uttarakhand, 263141"
                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all shadow-2xs placeholder:text-gray-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center justify-between">
                      <span>Latitude</span>
                      <span className="text-[10px] text-gray-400 font-mono">DEG (N)</span>
                    </label>
                    <input
                      type="text"
                      value={homeLat}
                      onChange={e => setHomeLat(e.target.value)}
                      placeholder="29.220936"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono transition-all shadow-2xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center justify-between">
                      <span>Longitude</span>
                      <span className="text-[10px] text-gray-400 font-mono">DEG (E)</span>
                    </label>
                    <input
                      type="text"
                      value={homeLng}
                      onChange={e => setHomeLng(e.target.value)}
                      placeholder="79.514496"
                      className="w-full px-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleDetectGPS}
                    disabled={isDetectingGPS || isResolvingAddress}
                    className="px-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-800 dark:text-gray-200 font-medium rounded-xl transition-all text-sm flex items-center justify-center gap-2 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                  >
                    <Navigation className={`w-4 h-4 ${isDetectingGPS ? "animate-spin text-emerald-600" : "text-gray-500"}`} />
                    <span>
                      {isDetectingGPS
                        ? "Acquiring GPS..."
                        : isResolvingAddress
                        ? "Resolving Address..."
                        : "Detect Current Location"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveHomeLocation}
                    disabled={isSavingHome || isResolvingAddress || !homeLat || !homeLng}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-xl transition-all text-sm shadow-xs hover:shadow active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2"
                  >
                    {isSavingHome ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Saving & Calculating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Save & Calculate Nearest Stops</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Nearest Stops Interactive Selection */}
                {nearestStops && nearestStops.length > 0 && (
                  <div className="pt-5 border-t border-gray-100 dark:border-zinc-800/80 space-y-3.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <BusFront className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          Recommended Bus Boarding Stops
                        </h4>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          Ranked by walking proximity to your saved residence coordinates
                        </p>
                      </div>
                      <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300">
                        {nearestStops.length} stops nearby
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {nearestStops.map((stop: any, idx: number) => {
                        const isChosen = stop.id === primaryStopId;
                        const isNearest = idx === 0;

                        return (
                          <div
                            key={stop.id || idx}
                            onClick={() => !isSelectingStop && handleSelectPickupStop(stop.id, stop.zoneCode, stop.name)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 ${
                              isChosen
                                ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-500 shadow-xs ring-1 ring-emerald-500/30"
                                : "border-gray-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 hover:border-emerald-300 dark:hover:border-zinc-700 hover:shadow-2xs"
                            }`}
                          >
                            <div className="flex items-start gap-3.5">
                              <div className="flex flex-col items-center pt-0.5">
                                <span className={`text-[11px] font-mono font-bold w-7 h-7 rounded-lg flex items-center justify-center border ${
                                  isNearest
                                    ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                                    : "border-gray-200 dark:border-zinc-700 text-gray-500 bg-gray-50 dark:bg-zinc-800"
                                }`}>
                                  #{idx + 1}
                                </span>
                              </div>

                              <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                                    {stop.name}
                                  </span>
                                  {isNearest && (
                                    <span className="text-[10px] px-2 py-0.5 font-bold uppercase rounded-full bg-emerald-600 text-white shadow-2xs">
                                      ★ Recommended
                                    </span>
                                  )}
                                  {isChosen && (
                                    <span className="text-[10px] px-2.5 py-0.5 font-bold uppercase rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                                      <Check className="w-3 h-3" /> Selected Stop
                                    </span>
                                  )}
                                </div>

                                {stop.landmark && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Landmark: {stop.landmark}
                                  </p>
                                )}

                                <div className="flex flex-wrap items-center gap-2 text-[11px] pt-0.5">
                                  {stop.routeName && (
                                    <span className="px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/70 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium">
                                      🚌 {stop.routeName}
                                    </span>
                                  )}
                                  {stop.zoneCode && (
                                    <span className="px-2.5 py-0.5 rounded-lg border border-purple-200 dark:border-purple-900/50 bg-purple-50/70 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-medium">
                                      🏷️ Zone {stop.zoneCode.replace("ZONE_", "")}
                                      {stop.semesterFee ? ` • ₹${stop.semesterFee.toLocaleString()}/sem` : ""}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 dark:border-zinc-800 gap-2 shrink-0">
                              <div className="text-left sm:text-right">
                                <p className="text-sm font-extrabold text-gray-900 dark:text-white font-mono">
                                  {stop.distanceKm !== undefined ? `${stop.distanceKm} km` : "Nearby"}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center sm:justify-end gap-1">
                                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                                  {stop.walkTimeMins ? `~${stop.walkTimeMins} min walk` : "Walkable"}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={isSelectingStop}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectPickupStop(stop.id, stop.zoneCode, stop.name);
                                }}
                                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${
                                  isChosen
                                    ? "bg-emerald-600 text-white pointer-events-none shadow-xs"
                                    : "bg-gray-100 dark:bg-zinc-800 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-zinc-700"
                                }`}
                              >
                                {isChosen ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Selected</span>
                                  </>
                                ) : (
                                  <span>Choose This Stop →</span>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fallback: Search all campus stops */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setShowAllStopsPicker(prev => !prev)}
                        className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1.5 font-medium cursor-pointer"
                      >
                        {showAllStopsPicker ? "Hide full stop catalog" : "Looking for another stop? Browse all campus route stops →"}
                      </button>

                      {showAllStopsPicker && (
                        <div className="mt-3 p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-950 space-y-3">
                          <input
                            type="text"
                            value={stopSearchQuery}
                            onChange={(e) => setStopSearchQuery(e.target.value)}
                            placeholder="Search stop by name, landmark, or route..."
                            className="w-full px-3.5 py-2 text-xs border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                          />
                          <div className="max-h-52 overflow-y-auto divide-y divide-gray-100 dark:divide-zinc-800 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                            {stops
                              .filter(s =>
                                !stopSearchQuery ||
                                s.name.toLowerCase().includes(stopSearchQuery.toLowerCase()) ||
                                (s.landmark && s.landmark.toLowerCase().includes(stopSearchQuery.toLowerCase()))
                              )
                              .map(s => {
                                const isCurrent = s.id === primaryStopId;
                                return (
                                  <div
                                    key={s.id}
                                    onClick={() => handleSelectPickupStop(s.id, s.zoneCode, s.name)}
                                    className={`p-3 flex items-center justify-between text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors ${
                                      isCurrent ? "bg-emerald-50/70 dark:bg-emerald-950/40 font-bold" : ""
                                    }`}
                                  >
                                    <div>
                                      <p className="text-gray-900 dark:text-white font-medium">{s.name}</p>
                                      {s.landmark && <p className="text-[11px] text-gray-500 dark:text-gray-400">{s.landmark}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {s.zoneCode && (
                                        <span className="text-[10px] px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30">
                                          {s.zoneCode}
                                        </span>
                                      )}
                                      {isCurrent ? (
                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                          <Check className="w-3.5 h-3.5" /> Active
                                        </span>
                                      ) : (
                                        <span className="text-gray-500 hover:text-emerald-600">Select</span>
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
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 5. Residential Transit Zone */}
            <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 text-xs font-bold font-mono">
                      5
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                      Residential Transit Zone & Subscription Fee
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Defines your semester transportation tier and fee structure
                  </p>
                </div>
                {isZoneLocked && (
                  <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                    <Lock className="w-3.5 h-3.5" /> Locked
                  </span>
                )}
              </div>

              {isZoneLocked ? (
                <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-emerald-900 dark:text-emerald-200">
                  <div className="font-bold flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Zone {selectedZoneCode} — Locked after Fee Clearance
                  </div>
                  <p className="text-xs opacity-80 leading-relaxed">
                    Transit zone is locked once semester fee is paid. Only campus transport admin can modify zone allocation after payment.
                  </p>
                </div>
              ) : (
                <CustomDropdown
                  options={transitZoneOptions}
                  value={selectedZoneCode}
                  placeholder="Select Transit Zone"
                  onChange={(val) => {
                    setSelectedZoneCode(val);
                    const filteredStops = stops.filter(st => (st.zoneCode || "ZONE_B") === val);
                    if (filteredStops.length > 0 && !autoAssignedStopId) {
                      setPrimaryStopId(filteredStops[0].id);
                    }
                  }}
                />
              )}

              {/* Stop & Zone Linkage Summary Card */}
              <div className="p-4 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-950 text-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Selected Boarding Stop:</span>
                  <span className="font-bold text-gray-900 dark:text-white">
                    {stops.find(s => s.id === primaryStopId)?.name || nearestStops.find(s => s.id === primaryStopId)?.name || "Auto-assigned by location"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Zone Subscription Fee:</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    ₹{transitZones.find(z => z.code === selectedZoneCode)?.semesterFee.toLocaleString() || "12,000"} / Semester
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-zinc-800">
                  Corridor: {transitZones.find(z => z.code === selectedZoneCode)?.corridorDescription || "Haldwani / Kathgodam Regional Corridor"}
                </p>
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 6. Emergency & Guardian Contact */}
            <div className="rounded-2xl border border-gray-200/90 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/40 p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 text-xs font-bold font-mono">
                      6
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                      Emergency & Guardian Contact
                    </h3>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Primary contact for campus transport notifications and transit safety
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
                  <HeartHandshake className="w-5 h-5" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Guardian Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={emergencyName}
                      onChange={e => setEmergencyName(e.target.value)}
                      placeholder="Parent / Guardian Name"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm transition-all shadow-2xs placeholder:text-gray-400"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Guardian Phone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      value={emergencyPhone}
                      onChange={e => setEmergencyPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/90 text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono transition-all shadow-2xs placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !photoUrl}
                className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-all text-sm shadow-md hover:shadow-lg active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2.5"
              >
                {!photoUrl ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {isSubmitting
                    ? "Saving to Database..."
                    : !photoUrl
                    ? "Upload Official ID Photo to Proceed"
                    : isPassApproved
                    ? "Save Profile & Verify Transit Account"
                    : "Save Details & Proceed to Payment"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
