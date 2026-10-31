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
  const [toast, setToast] = useState<string | null>(null);
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

  const isPassApproved = isStudentSubscriptionActive(activeStudent);
  const isPhotoLocked = isPassApproved;
  const isZoneLocked = isPassApproved;
  const isCampusLocked = isPassApproved;

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPhotoLocked) {
      alert("Official photo is locked. Only Campus Staff/Admin can update your photo.");
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
        setToast("Official photo uploaded successfully.");
        setTimeout(() => setToast(null), 3000);
      } else {
        alert(data.error || "Failed to upload photo. Please try again.");
      }
    } catch (err: any) {
      console.error("Photo upload error:", err);
      alert(err.message || "Failed to upload photo");
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
      alert("Geolocation is not supported by your browser.");
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
        fetchAddressForCoordinates(lat, lng);
      },
      err => {
        alert("Failed to acquire GPS location: " + err.message);
        setIsDetectingGPS(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSaveHomeLocation = async () => {
    const lat = parseFloat(homeLat);
    const lng = parseFloat(homeLng);
    if (isNaN(lat) || isNaN(lng)) {
      alert("Please provide valid numeric latitude and longitude coordinates.");
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
      if (data.nearestStops) {
        setNearestStops(data.nearestStops);
      }
      setHomeStatusMsg(data.message || "Coordinates saved and nearest stops calculated!");
    } catch (err: any) {
      alert(err.message || "Error saving coordinates");
    } finally {
      setIsSavingHome(false);
    }
  };

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
      alert("Please fill in your Contact Phone Number.");
      return;
    }

    if (!photoUrl) {
      setToast("Error: You must upload an official ID photo before activating your pass.");
      setTimeout(() => setToast(null), 5000);
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
      setToast("✓ Student Profile Saved & Verified in Institutional Database!");
      setTimeout(() => {
        setToast(null);
        if (!isPassApproved) {
          router.push("/portal/payments");
        } else {
          router.push("/portal");
        }
      }, 1200);
    } else {
      alert(res.message);
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
        {toast && (
          <div className="mb-6 p-4 border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {toast}
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">
                    Home Location & Commute Stops
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure your residential GPS coordinates for automatic nearest stop assignment
                  </p>
                </div>
                <div className="p-2 border border-gray-100 dark:border-gray-800 text-gray-500">
                  <MapPin className="w-5 h-5" />
                </div>
              </div>

              {homeStatusMsg && (
                <div className="p-3 text-xs border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>{homeStatusMsg}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Street / Area Address</label>
                    {isResolvingAddress && (
                      <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 font-medium animate-pulse">
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
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Latitude</label>
                    <input
                      type="text"
                      value={homeLat}
                      onChange={e => setHomeLat(e.target.value)}
                      placeholder="29.220936"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Longitude</label>
                    <input
                      type="text"
                      value={homeLng}
                      onChange={e => setHomeLng(e.target.value)}
                      placeholder="79.514496"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleDetectGPS}
                    disabled={isDetectingGPS || isResolvingAddress}
                    className="px-4 py-2.5 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium rounded-none transition-colors text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                  >
                    <Navigation className={`w-4 h-4 ${isDetectingGPS ? "animate-spin text-green-600" : "text-gray-500"}`} />
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
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-none transition-colors text-sm shadow-sm active:scale-95 cursor-pointer text-center"
                  >
                    {isSavingHome ? "Saving & Calculating..." : "Save Coordinates & Calculate Stops"}
                  </button>
                </div>

                {/* Nearest Stops preview */}
                {nearestStops && nearestStops.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium uppercase tracking-wider text-gray-500">
                        Nearby Stops by Road Distance
                      </h4>
                      <span className="text-xs text-gray-400">Calculated via OSRM / Network</span>
                    </div>

                    <div className="divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-200 dark:border-gray-800">
                      {nearestStops.map((stop: any, idx: number) => {
                        const isAssigned = stop.id === autoAssignedStopId;
                        return (
                          <div key={stop.id || idx} className="p-3 flex items-center justify-between bg-white dark:bg-black">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono px-2 py-0.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                                #{idx + 1}
                              </span>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                  {stop.name}
                                  {isAssigned && (
                                    <span className="text-[10px] px-1.5 py-0.5 font-bold uppercase bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border border-green-300 dark:border-green-800">
                                      Assigned Stop
                                    </span>
                                  )}
                                </p>
                                {stop.landmark && (
                                  <p className="text-xs text-gray-500">Landmark: {stop.landmark}</p>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white font-mono">
                                {stop.distanceKm !== undefined ? `${stop.distanceKm} km` : "Nearby"}
                              </p>
                              <p className="text-xs text-gray-500 flex items-center justify-end gap-1">
                                <Clock className="w-3 h-3" />
                                {stop.walkTimeMins ? `~${stop.walkTimeMins} min walk` : "Walkable"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 5. Residential Transit Zone */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                <span>Residential Transit Zone *</span>
                {isZoneLocked && (
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                )}
              </label>

              {isZoneLocked ? (
                <div className="p-4 border border-green-200 dark:border-green-800/80 bg-green-50/50 dark:bg-green-950/20 text-xs text-green-900 dark:text-green-200">
                  <div className="font-bold flex items-center gap-2 mb-1.5">
                    <ShieldCheck className="w-4 h-4 text-green-600 dark:text-green-400" />
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
              <p className="text-xs text-gray-500">
                Covers: {transitZones.find(z => z.code === selectedZoneCode)?.corridorDescription}
              </p>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* 6. Emergency & Guardian Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">
                Emergency & Guardian Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Guardian Name</label>
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={e => setEmergencyName(e.target.value)}
                    placeholder="Parent / Guardian Name"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Guardian Phone</label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={e => setEmergencyPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
              <button
                type="submit"
                disabled={isSubmitting || !photoUrl}
                className="w-full sm:w-auto px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-none transition-colors text-sm shadow-sm active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2"
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
