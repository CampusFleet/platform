"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/common/ThemeProvider";
import { store } from "@/lib/store";
import { 
  Sun, Moon, Bell, Shield, Database, Download, RefreshCw, MessageSquare, Trash, 
  ChevronDown, Check, Globe, Loader2, Type, MapPin, ArrowLeftRight, Navigation, CheckCircle2, AlertCircle, Clock, Bus,
  Users, BusFront, QrCode, Settings as SettingsIcon, GraduationCap, GitBranch, Layers
} from "lucide-react";
import { usePWAInstall } from "@/lib/usePWAInstall";
import { InstallAppModal } from "@/components/common/InstallAppModal";
import { useTranslation } from "@/components/common/LanguageProvider";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { UserRole } from "@/lib/types";

import { CustomDropdown } from "@/components/common/CustomDropdown";

export function SettingsView() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { primaryLanguage, setPrimaryLanguage, languageOptions, t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(store.getCurrentUser());

  const isEnclosedInPortalLayout = useMemo(() => {
    return (
      pathname.startsWith("/portal") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/transport-admin") ||
      pathname.startsWith("/transport-manager") ||
      pathname.startsWith("/conductor")
    );
  }, [pathname]);

  const detectedRole: UserRole = useMemo(() => {
    if (pathname.startsWith("/teacher")) return "teacher";
    if (pathname.startsWith("/conductor")) return "conductor";
    if (pathname.startsWith("/driver")) return "driver";
    if (pathname.startsWith("/transport-admin")) return "transport_admin";
    if (pathname.startsWith("/transport-manager")) return "transport_manager";
    if (pathname.startsWith("/admin")) return "admin";
    return ((currentUser as any)?.role as UserRole) || "student";
  }, [pathname, currentUser]);

  const settingsNavLinks = useMemo(() => {
    if (detectedRole === "teacher") {
      return [
        { href: "/teacher", label: "Class Attendance" },
        { href: "/teacher?tab=my_commute", label: "My Commute" },
        { href: "/teacher/settings", label: "Commute Settings" },
      ];
    }
    if (detectedRole === "conductor") {
      return [
        { href: "/conductor/scanner", label: "Scanner" },
        { href: "/conductor/manifest", label: "Manifest" },
        { href: "/conductor/settings", label: "Settings" },
      ];
    }
    if (detectedRole === "driver") {
      return [
        { href: "/driver", label: "HUD Console" },
        { href: "/driver/settings", label: "Settings" },
      ];
    }
    return [
      { href: "/portal", label: "My Commute" },
      { href: "/portal/qr", label: "QR Connect" },
      { href: "/portal/settings", label: "Settings" },
    ];
  }, [detectedRole]);

  const mobileBottomNavItems = useMemo(() => {
    if (detectedRole === "teacher") {
      return [
        { href: "/teacher", label: "Class Attendance", icon: Users },
        { href: "/teacher?tab=my_commute", label: "My Commute", icon: BusFront, highlight: true },
        { href: "/teacher/settings", label: "Settings", icon: SettingsIcon, active: true },
      ];
    }
    if (detectedRole === "conductor") {
      return [
        { href: "/conductor/scanner", label: "Scanner", icon: QrCode },
        { href: "/conductor/manifest", label: "Manifest", icon: Users },
        { href: "/conductor/settings", label: "Settings", icon: SettingsIcon, active: true },
      ];
    }
    if (detectedRole === "driver") {
      return [
        { href: "/driver", label: "HUD", icon: BusFront },
        { href: "/driver/settings", label: "Settings", icon: SettingsIcon, active: true },
      ];
    }
    return [
      { href: "/portal", label: "My Commute", icon: BusFront },
      { href: "/portal/qr", label: "QR Connect", icon: QrCode },
      { href: "/portal/settings", label: "Settings", icon: SettingsIcon, active: true },
    ];
  }, [detectedRole]);

  const [mounted, setMounted] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [navStyle, setNavStyle] = useState<"top" | "side">("top");
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState(false);

  useEffect(() => {
    const savedNav = localStorage.getItem("campusfleet_nav_style") as "top" | "side" | null;
    if (savedNav === "top" || savedNav === "side") {
      setNavStyle(savedNav);
    }
  }, []);

  const handleSetNavStyle = (style: "top" | "side") => {
    setNavStyle(style);
    localStorage.setItem("campusfleet_nav_style", style);
    window.dispatchEvent(new Event("campusfleet_nav_style_changed"));
    setIsNavDropdownOpen(false);
  };

  const fontOptions = [
    { value: "system", label: "System Default" },
    { value: "inter, sans-serif", label: "Inter" },
    { value: "roboto, sans-serif", label: "Roboto" },
    { value: "'Open Sans', sans-serif", label: "Open Sans" },
    { value: "lato, sans-serif", label: "Lato" },
    { value: "poppins, sans-serif", label: "Poppins" },
    { value: "monospace", label: "Monospace" },
    { value: "serif", label: "Serif" },
  ];

  // App Install state
  const { promptInstall } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleInstallClick = async () => {
    const res = await promptInstall();
    if (res === "modal_needed") {
      setShowInstallModal(true);
    }
  };

  // Delete Account state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [classesList, setClassesList] = useState<any[]>([]);


  const handleDeleteAccount = async () => {
    const confirmText = deleteConfirmation.trim().toUpperCase();
    if (confirmText !== "DELETE") {
      alert("Please type DELETE to confirm.");
      return;
    }
    
    setIsDeleting(true);
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete account");
      
      store.wipeAllData();
      localStorage.removeItem("campusfleet_store");
      
      window.location.href = "/account-deleted";
    } catch (err) {
      console.error(err);
      alert("An error occurred while deleting your account.");
      setIsDeleting(false);
    }
  };

  // States for toggles
  const [allEmails, setAllEmails] = useState(true);
  const [notifDefault, setNotifDefault] = useState(true);
  const [notifTrip, setNotifTrip] = useState(true);
  const [notifBilling, setNotifBilling] = useState(true);
  const [notifGeneral, setNotifGeneral] = useState(true);

  // Load and save notification preferences
  const [notifLoading, setNotifLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("campusfleet_notif_prefs");
      if (saved) {
        const prefs = JSON.parse(saved);
        setAllEmails(prefs.allEmails ?? true);
        setNotifDefault(prefs.notifDefault ?? true);
        setNotifTrip(prefs.notifTrip ?? true);
        setNotifBilling(prefs.notifBilling ?? true);
        setNotifGeneral(prefs.notifGeneral ?? true);
      }
    } catch {}

    const fetchPrefs = async () => {
      try {
        const res = await fetch("/api/users/notifications");
        const data = await res.json();
        if (data.success && data.preferences && Object.keys(data.preferences).length > 0) {
          const p = data.preferences;
          if (p.allEmails !== undefined) setAllEmails(p.allEmails);
          if (p.notifDefault !== undefined) setNotifDefault(p.notifDefault);
          if (p.notifTrip !== undefined) setNotifTrip(p.notifTrip);
          if (p.notifBilling !== undefined) setNotifBilling(p.notifBilling);
          if (p.notifGeneral !== undefined) setNotifGeneral(p.notifGeneral);
          
          localStorage.setItem("campusfleet_notif_prefs", JSON.stringify(p));
        }
      } catch (err) {
        console.error("Failed to load notif prefs", err);
      } finally {
        setNotifLoading(false);
      }
    };
    
    if (currentUser) {
      fetchPrefs();
    } else {
      setNotifLoading(false);
    }
  }, [currentUser]);

  const saveNotifPrefs = async (prefs: any) => {
    localStorage.setItem("campusfleet_notif_prefs", JSON.stringify(prefs));
    try {
      await fetch("/api/users/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs)
      });
    } catch (err) {
      console.error("Failed to save notif prefs", err);
    }
  };

  const handleAllEmailsToggle = (checked: boolean) => {
    setAllEmails(checked);
    setNotifDefault(checked);
    setNotifTrip(checked);
    setNotifBilling(checked);
    setNotifGeneral(checked);
    saveNotifPrefs({
      allEmails: checked,
      notifDefault: checked,
      notifTrip: checked,
      notifBilling: checked,
      notifGeneral: checked
    });
  };

  const handleSingleToggle = (key: string, checked: boolean) => {
    const newPrefs = {
      allEmails, notifDefault, notifTrip, notifBilling, notifGeneral,
      [key]: checked
    };
    
    if (key === 'notifDefault') { setNotifDefault(checked); }
    if (key === 'notifTrip') { setNotifTrip(checked); }
    if (key === 'notifBilling') { setNotifBilling(checked); }
    if (key === 'notifGeneral') { setNotifGeneral(checked); }

    saveNotifPrefs(newPrefs);
  };

  // Profile form states
  const [zoomLevel, setZoomLevel] = useState(100);
  const [fontFamily, setFontFamily] = useState('system');

  // Handle zoom
  const handleZoom = (direction: string) => {
    const newZoom = direction === 'in' ? Math.min(zoomLevel + 10, 150) : Math.max(zoomLevel - 10, 80);
    setZoomLevel(newZoom);
    document.documentElement.style.zoom = newZoom + '%';
  };

  // Handle clear cache
  const handleClearCache = () => {
    if (confirm("Are you sure you want to clear all local data? You will need to log in again.")) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    }
  };
  
  // Handle simple alerts
  const handleNotImplemented = (feature: string) => {
    alert(feature + " is not currently available for your account type.");
  };

  const [isSaving, setIsSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    phone: "",
    photoUrl: "",
    studentIdCode: "",
    department: "",
    semester: "",
    section: "",
    classId: "",
    className: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    employeeCode: "",
    category: "",
    licenseNo: ""
  });

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

  const isStudent = (currentUser as any)?.role === "student" || (currentUser as any)?.role === "portal" || !currentUser?.role;
  const isCommuter = isStudent || (currentUser as any)?.role === "teacher" || (currentUser as any)?.role === "faculty" || (currentUser as any)?.role === "staff";

  // Student Transit State
  const [homeAddress, setHomeAddress] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");
  const [autoAssignedStopId, setAutoAssignedStopId] = useState<string | null>(null);
  const [nearestStops, setNearestStops] = useState<any[]>([]);
  const [isDetectingGPS, setIsDetectingGPS] = useState(false);
  const [isResolvingAddress, setIsResolvingAddress] = useState(false);
  const [isSavingHome, setIsSavingHome] = useState(false);
  const [homeStatusMsg, setHomeStatusMsg] = useState<string | null>(null);

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

  // Bus Switch / Transfer Request State
  const [switchType, setSwitchType] = useState<"TEMPORARY_SWAP" | "PERMANENT_TRANSFER" | "STOP_CHANGE">("TEMPORARY_SWAP");
  const [targetBusId, setTargetBusId] = useState("");
  const [targetStopId, setTargetStopId] = useState("");
  const [switchReason, setSwitchReason] = useState("");
  const [switchDate, setSwitchDate] = useState(new Date().toISOString().split("T")[0]);
  const [isSubmittingSwitch, setIsSubmittingSwitch] = useState(false);
  const [switchStatusMsg, setSwitchStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [switchRequests, setSwitchRequests] = useState<any[]>([]);
  const [availableBuses, setAvailableBuses] = useState<any[]>([]);
  const [availableStops, setAvailableStops] = useState<any[]>([]);
  const [activeReservation, setActiveReservation] = useState<any>(null);

  useEffect(() => {
    const initializeForm = () => {
      const user = store.getCurrentUser();
      if (!user) return;
      setCurrentUser(user);

      const activeStudent = store.getStudents().find(s => s.userId === user.id || s.id === user.id);
      const activeStaff = store.getStaff().find(s => s.userId === user.id || s.id === user.id);

      const rawSection = activeStudent?.className
        ? activeStudent.className.match(/\(([^)]+)\)/)?.[1] || activeStudent.className.split("-").pop()?.trim() || ""
        : "";

      setProfileForm({
        fullName: activeStudent?.fullName || activeStaff?.fullName || user.fullName || "",
        phone: activeStudent?.phone || activeStaff?.phone || (user as any).phone || "",
        photoUrl: activeStudent?.photoUrl || (activeStaff as any)?.photoUrl || user.avatarUrl || "",
        studentIdCode: activeStudent?.studentIdCode || "",
        department: activeStudent?.department || "",
        semester: activeStudent?.semester || "",
        section: rawSection,
        classId: activeStudent?.classId || "",
        className: activeStudent?.className || "",
        emergencyContactName: activeStudent?.emergencyContact?.name || "",
        emergencyContactPhone: activeStudent?.emergencyContact?.phone || "",
        employeeCode: activeStaff?.employeeCode || "",
        category: activeStaff?.category || "",
        licenseNo: activeStaff?.licenseNo || ""
      });
    };

    setMounted(true);
    initializeForm();
    
    const unsub = store.subscribe(() => {
      initializeForm();
    });
    return unsub;
  }, []);

  useEffect(() => {
    fetch("/api/academic/cascade")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAcademicData(data);
          setClassesList(data.classes || []);
          
          setProfileForm(prev => {
            const activeClassId = prev.classId;
            const matched = (data.classes || []).find((c: any) => c.id === activeClassId);
            if (matched) {
              if (matched.course_id) setSelectedCourseId(matched.course_id);
              if (matched.branch_id) setSelectedBranchId(matched.branch_id);
              if (matched.specialization_id) setSelectedSpecializationId(matched.specialization_id);
              return {
                ...prev,
                department: matched.branch_name || matched.course_name || matched.department || prev.department,
                semester: matched.semester || prev.semester,
                section: matched.section || prev.section,
                className: matched.name || prev.className,
              };
            } else if (prev.department) {
              // Try finding course or branch matching current department text
              const matchedCrs = (data.courses || []).find((c: any) => 
                prev.department.toLowerCase().includes(c.short_name.toLowerCase()) || 
                c.short_name.toLowerCase().includes(prev.department.toLowerCase())
              );
              if (matchedCrs) setSelectedCourseId(matchedCrs.id);

              const matchedBr = (data.branches || []).find((b: any) => 
                prev.department.toLowerCase().includes(b.code.toLowerCase()) || 
                b.name.toLowerCase().includes(prev.department.toLowerCase())
              );
              if (matchedBr) {
                setSelectedBranchId(matchedBr.id);
                if (matchedBr.course_id) setSelectedCourseId(matchedBr.course_id);
              }
            }
            return prev;
          });
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!isCommuter) return;
    const user = store.getCurrentUser();
    if (!user) return;
    const activeStudent = store.getStudents().find(s => s.userId === user.id || s.id === user.id);
    const activeStaff = store.getStaff().find(s => s.userId === user.id || s.id === user.id);
    const studentId = activeStudent?.id || activeStaff?.id || user.id;

    setAvailableBuses(store.getBuses() || []);
    setAvailableStops(store.getStops() || []);

    fetch(`/api/students/attendance?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.reservation) {
          setActiveReservation(data.reservation);
        }
      })
      .catch(() => {});

    fetch(`/api/students/home-location?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.homeLocation) {
          if (data.homeLocation.address) setHomeAddress(data.homeLocation.address);
          if (data.homeLocation.latitude) setHomeLat(String(data.homeLocation.latitude));
          if (data.homeLocation.longitude) setHomeLng(String(data.homeLocation.longitude));
          if (data.homeLocation.autoAssignedStopId) setAutoAssignedStopId(data.homeLocation.autoAssignedStopId);
          if (data.nearestStops) setNearestStops(data.nearestStops);
        }
      })
      .catch(() => {});

    fetch(`/api/students/switch-requests?studentId=${studentId}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.requests) {
          setSwitchRequests(data.requests);
        }
      })
      .catch(() => {});
  }, [currentUser, isCommuter]);

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
        // Automatically fetch street/area address from map provider (OSM / Google)
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
    const user = store.getCurrentUser();
    const activeStudent = store.getStudents().find(s => s.userId === user?.id || s.id === user?.id);
    const studentId = activeStudent?.id || user?.id;
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
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to save home location");
      if (data.homeLocation?.autoAssignedStopId) {
        setAutoAssignedStopId(data.homeLocation.autoAssignedStopId);
      }
      if (data.nearestStops) {
        setNearestStops(data.nearestStops);
      }
      setHomeStatusMsg(data.message || "Home coordinates and stop assignment saved successfully!");

      // Refresh today's reservation immediately
      fetch(`/api/students/attendance?studentId=${studentId}`)
        .then(r => r.json())
        .then(resData => {
          if (resData.success && resData.reservation) {
            setActiveReservation(resData.reservation);
          }
        })
        .catch(() => {});
    } catch (err: any) {
      alert(err.message || "Error saving home location");
    } finally {
      setIsSavingHome(false);
    }
  };

  const handleSubmitSwitchRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = store.getCurrentUser();
    const activeStudent = store.getStudents().find(s => s.userId === user?.id || s.id === user?.id);
    const studentId = activeStudent?.id || user?.id;
    if (!studentId) return;

    const currentBusId = activeReservation?.bus_id || activeReservation?.busId || (availableBuses[0]?.id || "");
    const currentStopId = activeReservation?.boarding_stop_id || activeReservation?.boardingStopId || activeStudent?.primaryStopId || (availableStops[0]?.id || "");

    if (!targetBusId && !targetStopId) {
      alert("Please select either a requested bus or requested stop.");
      return;
    }

    setIsSubmittingSwitch(true);
    setSwitchStatusMsg(null);
    try {
      const res = await fetch("/api/students/switch-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          currentBusId,
          currentStopId,
          requestedBusId: targetBusId || undefined,
          requestedStopId: targetStopId || undefined,
          requestType: switchType,
          reason: switchReason.trim(),
          effectiveFrom: switchDate,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to submit request");
      setSwitchStatusMsg({
        type: data.evaluation?.overallDecision === "AUTO_APPROVED" ? "success" : "error",
        text: data.message || "Switch request submitted.",
      });
      if (data.request) {
        setSwitchRequests(prev => [data.request, ...prev]);
      }
      setSwitchReason("");
    } catch (err: any) {
      alert(err.message || "Error submitting switch request");
    } finally {
      setIsSubmittingSwitch(false);
    }
  };

  const courseOptions = useMemo(() => {
    return (academicData.courses || []).map(crs => ({
      value: crs.id,
      label: `${crs.short_name} — ${crs.name}`,
    }));
  }, [academicData.courses]);

  const branchOptions = useMemo(() => {
    const list = selectedCourseId
      ? (academicData.branches || []).filter(b => b.course_id === selectedCourseId)
      : (academicData.branches || []);
    return list.map(br => ({
      value: br.id,
      label: `${br.code} — ${br.name}`,
    }));
  }, [academicData.branches, selectedCourseId]);

  const specializationOptions = useMemo(() => {
    const list = selectedBranchId
      ? (academicData.specializations || []).filter(s => s.branch_id === selectedBranchId)
      : (academicData.specializations || []);
    return list.map(sp => ({
      value: sp.id,
      label: `${sp.short_label} (${sp.name})`,
    }));
  }, [academicData.specializations, selectedBranchId]);

  const semesterOptions = useMemo(() => {
    const crs = (academicData.courses || []).find(c => c.id === selectedCourseId);
    const total = crs?.total_semesters || 8;
    const list: { value: string; label: string }[] = [];
    for (let i = 1; i <= total; i++) {
      const suffix = i === 1 ? "st" : i === 2 ? "nd" : i === 3 ? "rd" : "th";
      list.push({ value: `${i}${suffix} Sem`, label: `${i}${suffix} Semester` });
    }
    return list;
  }, [academicData.courses, selectedCourseId]);

  const sectionOptions = useMemo(() => {
    if (selectedSpecializationId && profileForm.semester) {
      const matched = (academicData.classes || []).filter(
        c => c.specialization_id === selectedSpecializationId && c.semester === profileForm.semester
      );
      if (matched.length > 0) {
        return matched.map(c => ({
          value: c.section,
          label: `Section ${c.section} (${c.name || c.section})`,
        }));
      }
    }
    return (academicData.sections || []).map(s => ({
      value: s.code || s.name,
      label: `Section ${s.code || s.name}`,
    }));
  }, [academicData.classes, academicData.sections, selectedSpecializationId, profileForm.semester]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const displayName = currentUser?.fullName || "User";
  const email = currentUser?.email || "student@example.com";

  if (!mounted) return null;

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/users/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");

      const user = store.getCurrentUser();
      const activeStudent = store.getStudents().find(s => s.userId === user?.id || s.id === user?.id);
      if (activeStudent) {
        await store.updateStudentProfile(activeStudent.id, {
          fullName: profileForm.fullName,
          phone: profileForm.phone,
          department: profileForm.department,
          semester: profileForm.semester,
          classId: profileForm.classId,
          className: profileForm.className,
          studentIdCode: profileForm.studentIdCode,
          emergencyContact: {
            name: profileForm.emergencyContactName,
            relationship: "Parent / Guardian",
            phone: profileForm.emergencyContactPhone
          }
        });
      }

      alert("Profile updated successfully!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "An error occurred");
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Switch Component (Flat UI)
  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <button 
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-green-600" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span 
        className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`} 
      />
    </button>
  );

  return (
    <div className={`min-h-screen bg-gray-50 dark:bg-black text-gray-900 dark:text-gray-100 flex flex-col ${isEnclosedInPortalLayout ? 'pb-16' : 'pb-24 md:pb-12'}`}>
      {!isEnclosedInPortalLayout && (
        <UnifiedAppHeader
          role={detectedRole}
          portalTitle="CampusFleet"
          portalSubtitle={
            detectedRole === "teacher"
              ? "Faculty Transit & Settings"
              : detectedRole === "conductor"
              ? "Conductor Manifest & Settings"
              : detectedRole === "driver"
              ? "Driver HUD & Settings"
              : "Account & Mobility Settings"
          }
          navLinks={settingsNavLinks}
          mobilePrimaryAction={
            detectedRole === "teacher"
              ? {
                  label: "My Commute Cockpit",
                  href: "/teacher?tab=my_commute",
                  subtitle: "View seat pass & live bus tracking",
                  icon: BusFront,
                }
              : undefined
          }
        />
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto py-6 sm:py-8 px-4 sm:px-6 animate-in fade-in duration-300">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-medium text-green-600">
            {getGreeting()}, {displayName}
          </h1>
        </div>

      <div className="space-y-8">

        {/* Profile Details Card */}
        <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profileDetails')}</h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
                <input 
                  type="text" 
                  value={profileForm.fullName} 
                  onChange={e => setProfileForm({...profileForm, fullName: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                <input 
                  type="text" 
                  value={profileForm.phone} 
                  onChange={e => setProfileForm({...profileForm, phone: e.target.value})}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                />
              </div>
            </div>

            {/* Role Specific Fields */}
            {((currentUser as any)?.role === "student" || (currentUser as any)?.role === "portal" || !currentUser?.role) && (
              <>
                <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">Student Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* University Student ID */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center justify-between">
                      <span>University Student ID</span>
                      <span className="text-[10px] text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded border border-green-200 dark:border-green-800">
                        College ERP ID
                      </span>
                    </label>
                    <input 
                      type="text" 
                      value={profileForm.studentIdCode} 
                      onChange={e => setProfileForm({...profileForm, studentIdCode: e.target.value.trim().toUpperCase()})}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500 font-mono text-sm" 
                      placeholder="e.g. 230111075"
                    />
                  </div>

                  {/* 1. Degree / Course */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Degree / Course</label>
                    <CustomDropdown 
                      options={courseOptions}
                      value={selectedCourseId}
                      placeholder="Select Course"
                      onChange={(val) => {
                        setSelectedCourseId(val);
                        setSelectedBranchId("");
                        setSelectedSpecializationId("");
                        const crs = (academicData.courses || []).find(c => c.id === val);
                        setProfileForm({
                          ...profileForm,
                          department: crs?.short_name || profileForm.department,
                          semester: "",
                          section: "",
                          classId: "",
                          className: ""
                        });
                      }}
                    />
                  </div>

                  {/* 2. Discipline / Branch */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Discipline / Branch</label>
                    <CustomDropdown 
                      options={branchOptions}
                      value={selectedBranchId}
                      placeholder="Select Branch"
                      disabled={!selectedCourseId || branchOptions.length === 0}
                      onChange={(val) => {
                        setSelectedBranchId(val);
                        setSelectedSpecializationId("");
                        const br = (academicData.branches || []).find(b => b.id === val);
                        setProfileForm({
                          ...profileForm,
                          department: br?.name || profileForm.department,
                          section: "",
                          classId: "",
                          className: ""
                        });
                      }}
                    />
                  </div>

                  {/* 3. Specialization / Track */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Specialization / Track</label>
                    <CustomDropdown 
                      options={specializationOptions}
                      value={selectedSpecializationId}
                      placeholder="Select Specialization"
                      disabled={!selectedBranchId || specializationOptions.length === 0}
                      onChange={(val) => {
                        setSelectedSpecializationId(val);
                        setProfileForm({
                          ...profileForm,
                          section: "",
                          classId: "",
                          className: ""
                        });
                      }}
                    />
                  </div>

                  {/* 4. Current Semester */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Semester</label>
                    <CustomDropdown 
                      options={semesterOptions}
                      value={profileForm.semester}
                      placeholder="Select Semester"
                      disabled={!selectedCourseId}
                      onChange={(val) => {
                        setProfileForm({
                          ...profileForm,
                          semester: val,
                          section: "",
                          classId: "",
                          className: ""
                        });
                      }}
                    />
                  </div>

                  {/* 5. Class Section */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Class Section</label>
                    <CustomDropdown 
                      options={sectionOptions}
                      value={profileForm.section}
                      placeholder="Select Section"
                      disabled={!profileForm.semester}
                      onChange={(val) => {
                        const matchedClass = (academicData.classes || []).find(
                          c => c.specialization_id === selectedSpecializationId && c.semester === profileForm.semester && c.section === val
                        ) || (academicData.classes || []).find(
                          c => c.branch_id === selectedBranchId && c.semester === profileForm.semester && c.section === val
                        ) || (academicData.classes || []).find(
                          c => c.semester === profileForm.semester && c.section === val
                        ) || classesList.find(c => c.semester === profileForm.semester && c.section === val);

                        setProfileForm({
                          ...profileForm, 
                          section: val, 
                          classId: matchedClass?.id || profileForm.classId,
                          className: matchedClass?.name || profileForm.className || `Section ${val}`
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Emergency Contact Name</label>
                    <input 
                      type="text" 
                      value={profileForm.emergencyContactName} 
                      onChange={e => setProfileForm({...profileForm, emergencyContactName: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                      placeholder="E.g. Parent / Guardian"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Emergency Contact Phone</label>
                    <input 
                      type="text" 
                      value={profileForm.emergencyContactPhone} 
                      onChange={e => setProfileForm({...profileForm, emergencyContactPhone: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                      placeholder="+91 0000000000"
                    />
                  </div>
                </div>
              </>
            )}

            {(["admin", "transport_admin", "transport_manager", "driver", "conductor", "teacher"].includes(currentUser?.role || "")) && (
              <>
                <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
                <h3 className="text-sm font-medium text-gray-900 dark:text-white uppercase tracking-wider">
                  {currentUser?.role === "conductor" ? "Conductor Details" : 
                   currentUser?.role === "driver" ? "Driver Details" : 
                   currentUser?.role === "teacher" ? "Faculty Details" :
                   currentUser?.role === "transport_manager" ? "Transport Manager Details" :
                   "Transport Admin Details"}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Employee Code</label>
                    <input 
                      type="text" 
                      value={profileForm.employeeCode} 
                      onChange={e => setProfileForm({...profileForm, employeeCode: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                      placeholder="E.g. EMP-1001"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Category / Rank</label>
                    <input 
                      type="text" 
                      value={profileForm.category} 
                      onChange={e => setProfileForm({...profileForm, category: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                      placeholder="E.g. Senior"
                    />
                  </div>
                  {currentUser?.role === "driver" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">License Number</label>
                      <input 
                        type="text" 
                        value={profileForm.licenseNo} 
                        onChange={e => setProfileForm({...profileForm, licenseNo: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 rounded-none focus:outline-none focus:border-green-500" 
                        placeholder="E.g. DL-XXXXXX"
                      />
                    </div>
                  )}
                  {currentUser?.role === "conductor" && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assigned Bus / Duty</label>
                      <input 
                        type="text" 
                        value="Assigned by Dispatcher" 
                        disabled
                        className="w-full px-4 py-2 border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-500 rounded-none cursor-not-allowed" 
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="pt-4 flex flex-col sm:flex-row justify-end items-center gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="w-full sm:w-auto px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-medium rounded-none transition-colors text-sm shadow-sm active:scale-95 cursor-pointer"
              >
                {isSaving ? t('saving') : t('saveProfile')}
              </button>
            </div>
          </div>
        </div>
        
        {/* Commute Transit Settings (Home Location & Nearest Stops) */}
        {isCommuter && (
          <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Home Location & Commute Stops</h2>
                <p className="text-xs text-gray-500 mt-1">Configure your residential GPS coordinates for automatic nearest stop assignment</p>
              </div>
              <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
                <MapPin className="w-5 h-5" />
              </div>
            </div>

            <div className="p-6 space-y-6">
              {homeStatusMsg && (
                <div className="p-3 text-sm border border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300 flex items-center gap-2">
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
                    placeholder={
                      isResolvingAddress
                        ? "Resolving street address from map provider..."
                        : "E.g. Flat 402, Sunrise Residency, Main Ring Road"
                    }
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
                      placeholder="E.g. 29.220849"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Longitude</label>
                    <input
                      type="text"
                      value={homeLng}
                      onChange={e => setHomeLng(e.target.value)}
                      placeholder="E.g. 79.514651"
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
                    {isSavingHome ? "Saving & Reserving Bus..." : "Save Coordinates & Calculate Stops"}
                  </button>
                </div>
              </div>

              {/* Nearest Stops preview */}
              {nearestStops && nearestStops.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-800/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Nearby Stops by Road Distance
                    </h3>
                    <span className="text-xs text-gray-500">Calculated via OSRM / Road Network</span>
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
        )}

        {/* Bus Switch & Transfer Request Card */}
        {isCommuter && (
          <div className="bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-none">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">Bus Switch & Route Transfer</h2>
                <p className="text-xs text-gray-500 mt-1">Request a temporary swap or permanent bus transfer with automated capacity evaluation</p>
              </div>
              <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
                <ArrowLeftRight className="w-5 h-5" />
              </div>
            </div>

            <div className="p-6 space-y-6">
              {switchStatusMsg && (
                <div
                  className={`p-3 text-sm border flex items-center gap-2 ${
                    switchStatusMsg.type === "success"
                      ? "border-green-200 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-green-800 dark:text-green-300"
                      : "border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {switchStatusMsg.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span>{switchStatusMsg.text}</span>
                </div>
              )}

              <form onSubmit={handleSubmitSwitchRequest} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Request Type</label>
                    <CustomDropdown
                      value={switchType}
                      onChange={val => setSwitchType(val as any)}
                      options={[
                        { value: "TEMPORARY_SWAP", label: "Temporary Swap (Today / Single Day)" },
                        { value: "PERMANENT_TRANSFER", label: "Permanent Bus Transfer" },
                        { value: "STOP_CHANGE", label: "Boarding Stop Change" },
                      ]}
                      placeholder="Select Request Type"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Effective Date</label>
                    <input
                      type="date"
                      value={switchDate}
                      onChange={e => setSwitchDate(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Requested Bus</label>
                    <CustomDropdown
                      value={targetBusId}
                      onChange={val => setTargetBusId(val)}
                      placeholder="-- Keep Current Bus / Auto-pick --"
                      options={[
                        { value: "", label: "-- Keep Current Bus / Auto-pick --" },
                        ...availableBuses.map((b: any) => ({
                          value: b.id,
                          label: `${b.busNumber || b.bus_number} (${b.capacity || 40} seats)`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Requested Boarding Stop</label>
                    <CustomDropdown
                      value={targetStopId}
                      onChange={val => setTargetStopId(val)}
                      placeholder="-- Keep Current Stop --"
                      options={[
                        { value: "", label: "-- Keep Current Stop --" },
                        ...availableStops.map((s: any) => ({
                          value: s.id,
                          label: `${s.name}${s.landmark ? ` (${s.landmark})` : ""}`,
                        })),
                      ]}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reason for Request</label>
                  <textarea
                    rows={2}
                    value={switchReason}
                    onChange={e => setSwitchReason(e.target.value)}
                    placeholder="E.g. Staying at relative's place near South Campus for exams this week"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white rounded-none focus:outline-none focus:border-green-500 text-sm"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmittingSwitch || (!targetBusId && !targetStopId)}
                    className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-none transition-colors text-sm"
                  >
                    {isSubmittingSwitch ? "Submitting..." : "Submit Switch Request"}
                  </button>
                </div>
              </form>

              {/* Switch History */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800/60 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Request History & Decisions
                </h3>

                {switchRequests.length === 0 ? (
                  <p className="text-sm text-gray-500 py-3">No switch requests submitted yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800/60 border border-gray-200 dark:border-gray-800">
                    {switchRequests.map((req: any) => {
                      const isApproved = req.status === "AUTO_APPROVED" || req.status === "APPROVED";
                      const isDenied = req.status === "AUTO_DENIED" || req.status === "DENIED";
                      return (
                        <div key={req.id} className="p-3.5 space-y-1.5 bg-white dark:bg-black">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">
                              {req.request_type ? req.request_type.replace(/_/g, " ") : "Switch Request"}
                            </span>
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 border ${
                                isApproved
                                  ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
                                  : isDenied
                                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              }`}
                            >
                              {req.status}
                            </span>
                          </div>

                          <p className="text-xs text-gray-500">
                            Effective: <span className="text-gray-700 dark:text-gray-300">{req.effective_from || "Today"}</span>
                            {req.reason && ` • "${req.reason}"`}
                          </p>

                          {req.ai_reasoning && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 p-2 border border-gray-100 dark:border-gray-800">
                              <span className="font-medium text-gray-700 dark:text-gray-300">Decision details: </span>
                              {req.ai_reasoning}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Appearance Card */}
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none relative z-20">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('appearance')}</h2>
            <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
              <Sun className="w-5 h-5" />
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('theme')}</h3>
                <p className="text-sm text-gray-500">{t('switchThemeDesc')}</p>
              </div>
              <div className="flex items-center border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900">
                <button 
                  onClick={() => setTheme('light')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                    theme === 'light' 
                      ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Sun className="w-4 h-4" /> {t('light')}
                </button>
                <button 
                  onClick={() => setTheme('dark')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                    theme === 'dark' 
                      ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Moon className="w-4 h-4" /> {t('dark')}
                </button>
                <button 
                  onClick={() => setTheme('system')}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
                    theme === 'system' 
                      ? 'bg-white dark:bg-gray-800 text-blue-600 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {t('system')}
                </button>
              </div>
            </div>
            
            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('language')}</h3>
                <p className="text-sm text-gray-500">{t('chooseLangDesc')}</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="flex items-center justify-between min-w-[200px] px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-gray-500" />
                    <span>
                      {languageOptions.find(l => l.code === primaryLanguage)?.nativeName || "Language"}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {isLangDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsLangDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 top-full mt-2 w-full z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="max-h-60 overflow-y-auto py-1">
                        {languageOptions.map(lang => (
                          <button
                            key={lang.code}
                            onClick={() => {
                              setPrimaryLanguage(lang.code as any);
                              setIsLangDropdownOpen(false);
                            }}
                            className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                              primaryLanguage === lang.code 
                                ? 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' 
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <span>{lang.nativeName}</span>
                            {primaryLanguage === lang.code && <Check className="w-4 h-4 text-gray-900 dark:text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            
            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('fontFamily')}</h3>
                <p className="text-sm text-gray-500">{t('chooseFontDesc')}</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
                  className="flex items-center justify-between min-w-[200px] px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-gray-500" />
                    <span>
                      {fontOptions.find(f => f.value === fontFamily)?.label || "System Default"}
                    </span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
                
                {isFontDropdownOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10" 
                      onClick={() => setIsFontDropdownOpen(false)} 
                    />
                    <div className="absolute right-0 top-full mt-2 w-full z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="max-h-60 overflow-y-auto py-1">
                        {fontOptions.map(font => (
                          <button
                            key={font.value}
                            onClick={() => {
                              setFontFamily(font.value);
                              document.documentElement.style.fontFamily = font.value === 'system' ? '' : font.value;
                              setIsFontDropdownOpen(false);
                            }}
                            className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                              fontFamily === font.value 
                                ? 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-medium' 
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                            }`}
                          >
                            <span style={{ fontFamily: font.value === 'system' ? 'inherit' : font.value }}>
                              {font.label}
                            </span>
                            {fontFamily === font.value && <Check className="w-4 h-4 text-gray-900 dark:text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />

            {/* Navigation Style (Top Nav vs Side Nav matching reference screenshot) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Navigation</h3>
                <p className="text-sm text-gray-500">Choose between top navigation and side navigation</p>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsNavDropdownOpen(!isNavDropdownOpen)}
                  className="flex items-center justify-between min-w-[200px] px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-800"
                >
                  <span>{navStyle === "top" ? "Top Nav" : "Side Nav"}</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>

                {isNavDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsNavDropdownOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-full z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={() => handleSetNavStyle("top")}
                          className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                            navStyle === "top"
                              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          <span>Top Nav</span>
                          {navStyle === "top" && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetNavStyle("side")}
                          className={`w-full text-left flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                            navStyle === "side"
                              ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                          }`}
                        >
                          <span>Side Nav</span>
                          {navStyle === "side" && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Zoom level</h3>
                <p className="text-sm text-gray-500">Maximize the view (more content) or increase size for readability</p>
              </div>
              <div className="flex items-center border border-gray-200 dark:border-gray-800 rounded-none bg-white dark:bg-gray-950">
                <button onClick={() => handleZoom('out')} className="px-3 py-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900">-</button>
                <span className="px-4 py-2 text-sm font-medium border-x border-gray-200 dark:border-gray-800">{zoomLevel}%</span>
                <button onClick={() => handleZoom('in')} className="px-3 py-2 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900">+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Notifications Card */}
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('notifications')}</h2>
            <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
              <Bell className="w-5 h-5" />
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('emailNotifications')}</h3>
                <p className="text-sm text-gray-500">Manage which emails you receive at {email}.</p>
              </div>
              <Toggle checked={allEmails} onChange={() => handleAllEmailsToggle(!allEmails)} />
            </div>
            
            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className={!allEmails ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('emailCategories')}</h3>
              <p className="text-sm text-gray-500 mb-6">Turn off individual categories to stop those emails while staying subscribed to others.</p>
              
              <div className={`space-y-6 ${notifLoading ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('default')}</span>
                  <Toggle checked={notifDefault} onChange={() => handleSingleToggle('notifDefault', !notifDefault)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('tripUpdates')}</span>
                  <Toggle checked={notifTrip} onChange={() => handleSingleToggle('notifTrip', !notifTrip)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('billingAlerts')}</span>
                  <Toggle checked={notifBilling} onChange={() => handleSingleToggle('notifBilling', !notifBilling)} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('generalNotice')}</span>
                  <Toggle checked={notifGeneral} onChange={() => handleSingleToggle('notifGeneral', !notifGeneral)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy & Security Card */}
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('privacySecurity')}</h2>
            <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
              <Shield className="w-5 h-5" />
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('twoFactorAuth')}</h3>
                <p className="text-sm text-gray-500">Add an extra layer of security</p>
              </div>
              <button onClick={() => handleNotImplemented('Advanced Security')} className="p-2 border border-gray-200 dark:border-gray-800 rounded-none text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"><Shield className="w-4 h-4" /></button>
            </div>
            
            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('dataPrivacy')}</h3>
                <p className="text-sm text-gray-500">Manage your data privacy settings</p>
              </div>
              <button onClick={() => handleNotImplemented('Advanced Security')} className="p-2 border border-gray-200 dark:border-gray-800 rounded-none text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"><Shield className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Data & Storage Card */}
        <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-none mb-12">
          <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800/60">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('dataStorage')}</h2>
            <div className="p-2 border border-gray-100 dark:border-gray-800 rounded-none text-gray-500">
              <Database className="w-5 h-5" />
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('installApp')}</h3>
                <p className="text-sm text-gray-500">Add this app to your home screen or desktop for quicker access</p>
              </div>
              <button onClick={handleInstallClick} className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                <Download className="w-4 h-4" />
                {t('installApp')}
              </button>
            </div>
            
            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Get latest update</h3>
                <p className="text-sm text-gray-500">Reload the app and fetch the newest version</p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t('updateNow')}
              </button>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Clear chat cache</h3>
                <p className="text-sm text-gray-500">Remove local search index, previews, and decrypted caches on this device</p>
              </div>
              <div className="p-2 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors cursor-pointer">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-800/60" />
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">{t('clearCache')}</h3>
                <p className="text-sm text-gray-500">Clear all cached data</p>
              </div>
              <button 
                onClick={() => {
                  if (confirm("Are you sure you want to clear the local cache? You will need to sign in again.")) {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.href = "/";
                  }
                }}
                className="p-2 border border-gray-200 dark:border-gray-800 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
              >
                <Trash className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <InstallAppModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />

        {/* Danger Zone Card */}
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-none mb-12">
          <div className="flex items-center justify-between p-6 border-b border-red-200 dark:border-red-900/50">
            <h2 className="text-lg font-medium text-red-700 dark:text-red-400">{t('dangerZone')}</h2>
            <div className="p-2 border border-red-200 dark:border-red-900/50 rounded-none text-red-500">
              <Trash className="w-5 h-5" />
            </div>
          </div>
          
          <div className="p-6 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">{t('deleteAccount')}</h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80 mb-4">
                {t('deleteAccountDesc')}
              </p>
              
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    To confirm, type <span className="font-bold text-red-600">DELETE</span> below:
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="DELETE"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 focus:outline-none focus:border-red-500 rounded-none"
                  />
                </div>
                
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== "DELETE"}
                  className={`px-6 py-2 text-sm font-bold shadow-none transition-all mt-4 ${
                    isDeleting || deleteConfirmation.trim().toUpperCase() !== "DELETE"
                      ? "bg-gray-200 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed"
                      : "bg-red-600 hover:bg-red-700 text-white"
                  }`}
                >
                  {isDeleting ? t('deleting') : t('permanentlyDelete')}
                </button>
              </div>
            </div>
          </div>
        </div>

        </div>
      </main>

      {!isEnclosedInPortalLayout && <MobileBottomNav navItems={mobileBottomNavItems} />}
    </div>
  );
}
