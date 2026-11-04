"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/common/ThemeProvider";
import { store } from "@/lib/store";
import { 
  Sun, Moon, Bell, Shield, Database, Download, RefreshCw, MessageSquare, Trash, 
  ChevronDown, Check, Globe, Loader2, Type, MapPin, ArrowLeftRight, Navigation, CheckCircle2, AlertCircle, Clock, Bus,
  Users, BusFront, QrCode, Settings as SettingsIcon, GraduationCap, GitBranch, Layers,
  Radio, CreditCard,
  X, AlertTriangle, Info, Save
} from "lucide-react";
import { usePWAInstall } from "@/lib/usePWAInstall";
import { InstallAppModal } from "@/components/common/InstallAppModal";
import { useTranslation } from "@/components/common/LanguageProvider";
import { UnifiedAppHeader } from "@/components/common/UnifiedAppHeader";
import { MobileBottomNav } from "@/components/common/MobileBottomNav";
import { UserRole } from "@/lib/types";

import { CustomDropdown } from "@/components/common/CustomDropdown";
import { StaffPayoutCredentialsCard } from "@/components/common/StaffPayoutCredentialsCard";
import { CommuterHomeLocationCard } from "@/components/common/CommuterHomeLocationCard";
import { CommuterSeatPreferencesCard } from "@/components/common/CommuterSeatPreferencesCard";

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
      { href: "/portal/radar", label: "Radar" },
      { href: "/chat", label: "Chat" },
      { href: "/portal/payments", label: "Pass & Fees" },
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
      { href: "/portal/radar", label: "Radar", icon: Radio },
      { href: "/chat", label: "Chat", icon: MessageSquare },
      { href: "/portal/payments", label: "Pass & Fees", icon: CreditCard },
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

  // Toast Notification state (Modern Vercel/Linear standard)
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
    const timer = setTimeout(() => {
      setToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Delete Account & Danger Zone state (Modern SaaS Standards)
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [classesList, setClassesList] = useState<any[]>([]);

  // GDPR Data Export (SaaS Best Practice before Account Deletion)
  const handleExportData = () => {
    setIsExportingData(true);
    try {
      const activeStudent = store.getStudents().find(s => s.userId === currentUser?.id || s.id === currentUser?.id);
      const userBookings = store.getBookings().filter(b => b.studentId === activeStudent?.id || (b as any).userId === currentUser?.id);
      const exportPayload = {
        exportedAt: new Date().toISOString(),
        institution: "CampusFleet Transit Network",
        user: {
          id: currentUser?.id,
          name: currentUser?.fullName || (currentUser as any)?.name,
          email: currentUser?.email,
          role: currentUser?.role,
        },
        studentProfile: activeStudent || null,
        recentBookings: userBookings,
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportPayload, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `campusfleet_transit_archive_${currentUser?.id || "user"}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast("success", "Your transit data archive has been downloaded successfully.", "Data Exported");
    } catch (err: any) {
      showToast("error", err?.message || "Failed to export transit archive", "Export Error");
    } finally {
      setIsExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmText = deleteConfirmation.trim().toUpperCase();
    if (confirmText !== "DELETE") {
      showToast("warning", "Please type DELETE to confirm account deletion.", "Confirmation Required");
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
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (storageErr) {
        console.warn("Storage cleanup error:", storageErr);
      }

      showToast("success", "Your account and all transit data have been permanently deleted.", "Account Deleted");
      
      // Short delay to let the user see the success feedback before redirecting
      setTimeout(() => {
        window.location.href = "/account-deleted";
      }, 500);
    } catch (err: any) {
      console.error(err);
      showToast("error", err?.message || "An error occurred while deleting your account.", "Deletion Failed");
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
  
  // Handle simple notifications
  const handleNotImplemented = (feature: string) => {
    showToast("info", `${feature} is not currently available for your account type.`, "Feature Notice");
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
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
        showToast("success", `GPS location locked (${lat.toFixed(4)}, ${lng.toFixed(4)})`, "Location Acquired");
        // Automatically fetch street/area address from map provider (OSM / Google)
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
      const successMsg = data.message || "Home coordinates and stop assignment saved successfully!";
      setHomeStatusMsg(successMsg);
      showToast("success", successMsg, "Stop Assignment Saved");

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
      showToast("error", err.message || "Error saving home location", "Save Error");
    } finally {
      setIsSavingHome(false);
    }
  };

  const [isSelectingStop, setIsSelectingStop] = useState(false);

  const handleSelectPickupStop = async (stopId: string, stopName: string) => {
    const user = store.getCurrentUser();
    const activeStudent = store.getStudents().find(s => s.userId === user?.id || s.id === user?.id);
    const studentId = activeStudent?.id || user?.id;
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
        setAutoAssignedStopId(stopId);
        const successMsg = `Primary pickup stop updated to "${stopName}"`;
        setHomeStatusMsg(`✓ ${successMsg}`);
        showToast("success", successMsg, "Stop Assigned");
        // Refresh today's reservation
        fetch(`/api/students/attendance?studentId=${studentId}`)
          .then(r => r.json())
          .then(resData => {
            if (resData.success && resData.reservation) {
              setActiveReservation(resData.reservation);
            }
          })
          .catch(() => {});
      }
    } catch (e: any) {
      showToast("error", e.message || "Error selecting stop", "Stop Selection Error");
    } finally {
      setIsSelectingStop(false);
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
    if (!profileForm.fullName || profileForm.fullName.trim().length < 2) {
      showToast("error", "Full name must be at least 2 characters.", "Validation Error");
      setSaveFeedback({ type: "error", message: "Full name must be at least 2 characters." });
      return;
    }

    setIsSaving(true);
    setSaveFeedback(null);

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
      const studentId = data.student?.id || activeStudent?.id || (user ? `stud-${user.id}` : "");

      if (studentId) {
        await store.updateStudentProfile(studentId, {
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone?.trim(),
          department: data.student?.department || profileForm.department,
          semester: profileForm.semester,
          classId: profileForm.classId,
          className: data.student?.className || profileForm.className,
          studentIdCode: profileForm.studentIdCode,
          emergencyContact: {
            name: profileForm.emergencyContactName?.trim(),
            relationship: "Parent / Guardian",
            phone: profileForm.emergencyContactPhone?.trim()
          }
        });
      }

      // Update current user state and local storage
      if (user) {
        const updatedUser = {
          ...user,
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone?.trim() || (user as any).phone
        };
        store.setCurrentUser(updatedUser);
        setCurrentUser(updatedUser);
      }

      setIsSavedRecently(true);
      setTimeout(() => setIsSavedRecently(false), 3500);

      const successMsg = data.message || "Profile updated successfully! All details cached.";
      setSaveFeedback({ type: "success", message: successMsg });
      showToast("success", successMsg, "Saved Successfully");
    } catch (err: any) {
      console.error("Profile save error:", err);
      const errMsg = err.message || "An error occurred while updating profile.";
      setSaveFeedback({ type: "error", message: errMsg });
      showToast("error", errMsg, "Update Failed");
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
              onClick={() => setToast(null)}
              className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
        {/* Staff Salary & Payout Banking Credentials Card (Drivers, Conductors, Managers, Admins) */}
        <StaffPayoutCredentialsCard currentUser={currentUser} userRole={detectedRole} />

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

            <div className="pt-5 flex flex-col sm:flex-row justify-between items-center gap-3 border-t border-gray-100 dark:border-gray-800/60">
              <div className="w-full sm:w-auto">
                {saveFeedback && (
                  <div className={`px-3 py-2 text-xs font-medium rounded-md flex items-center gap-2 border animate-in fade-in duration-200 ${
                    saveFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                      : "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60"
                  }`}>
                    {saveFeedback.type === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    )}
                    <span>{saveFeedback.message}</span>
                  </div>
                )}
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-md font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer ${
                  isSavedRecently
                    ? "bg-emerald-700 text-white"
                    : isSaving
                    ? "bg-emerald-600/70 text-white cursor-not-allowed"
                    : "bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white"
                }`}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t('saving') || "Saving Changes..."}</span>
                  </>
                ) : isSavedRecently ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Profile Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{t('saveProfile') || "Save Profile"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
        
        {/* Commute Transit Settings: Interactive Onboarding Pin Drop & Seat Preferences */}
        {isCommuter && (
          <>
            <CommuterHomeLocationCard
              studentId={
                store.getStudents().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                store.getStaff().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                currentUser?.id ||
                ""
              }
              initialAddress={homeAddress}
              initialLat={parseFloat(homeLat) || 29.220936}
              initialLng={parseFloat(homeLng) || 79.514496}
              onLocationSaved={({ address, latitude, longitude, autoAssignedStopId }) => {
                setHomeAddress(address);
                setHomeLat(String(latitude));
                setHomeLng(String(longitude));
                if (autoAssignedStopId) setAutoAssignedStopId(autoAssignedStopId);
                const sId =
                  store.getStudents().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                  currentUser?.id;
                if (sId) {
                  fetch(`/api/students/attendance?studentId=${sId}`)
                    .then(r => r.json())
                    .then(resData => {
                      if (resData.success && resData.reservation) {
                        setActiveReservation(resData.reservation);
                      }
                    })
                    .catch(() => {});
                }
              }}
              showToast={showToast}
            />

            <CommuterSeatPreferencesCard
              studentId={
                store.getStudents().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                store.getStaff().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                currentUser?.id ||
                ""
              }
              activeReservation={activeReservation}
              onPreferencesUpdated={() => {
                const sId =
                  store.getStudents().find(s => s.userId === currentUser?.id || s.id === currentUser?.id)?.id ||
                  currentUser?.id;
                if (sId) {
                  fetch(`/api/students/attendance?studentId=${sId}`)
                    .then(r => r.json())
                    .then(resData => {
                      if (resData.success && resData.reservation) {
                        setActiveReservation(resData.reservation);
                      }
                    })
                    .catch(() => {});
                }
              }}
              showToast={showToast}
            />
          </>
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

        {/* Dedicated Modern Confirmation Modal for Account Deletion (GitHub / Vercel Standards) */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div 
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
              role="dialog"
              aria-modal="true"
            >
              {/* Modal Header */}
              <div className="p-5 sm:p-6 border-b border-zinc-100 dark:border-zinc-800/80 flex items-start justify-between gap-4 bg-gradient-to-b from-rose-50/60 to-transparent dark:from-rose-950/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 ring-4 ring-rose-50 dark:ring-rose-950/30 shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Permanently Delete Account?</h3>
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">This action cannot be undone.</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isDeleting && setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 sm:p-6 space-y-5">
                <div className="rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-900 dark:text-rose-300">
                    The following records will be permanently erased:
                  </p>
                  <ul className="text-xs text-rose-700 dark:text-rose-400 space-y-1.5">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      Student & staff identity, credentials, and guardian details
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      Active bus reservations, QR commuter passes & seat allocations
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      Boarding attendance logs, stop preferences & RFID card bindings
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                      Immediate sign-out across all devices and sessions
                    </li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                      To confirm, type <span className="font-bold text-rose-600 dark:text-rose-400">DELETE</span> below:
                    </label>
                    {deleteConfirmation.trim().toUpperCase() === "DELETE" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="w-3.5 h-3.5" /> Confirmed
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="Type DELETE"
                    disabled={isDeleting}
                    autoFocus
                    className={`w-full px-3.5 py-2.5 text-sm rounded-xl border bg-white dark:bg-zinc-900 transition-colors focus:outline-none ${
                      deleteConfirmation.trim().toUpperCase() === "DELETE"
                        ? "border-emerald-500 dark:border-emerald-500 ring-2 ring-emerald-500/20 text-zinc-900 dark:text-zinc-100"
                        : "border-zinc-300 dark:border-zinc-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-zinc-900 dark:text-zinc-100"
                    }`}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 sm:p-6 bg-zinc-50 dark:bg-zinc-900/60 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs sm:text-sm font-medium rounded-xl border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || deleteConfirmation.trim().toUpperCase() !== "DELETE"}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-sm ${
                    isDeleting || deleteConfirmation.trim().toUpperCase() !== "DELETE"
                      ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed"
                      : "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20 active:scale-95"
                  }`}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{t('deleting')}</span>
                    </>
                  ) : (
                    <>
                      <Trash className="w-4 h-4" />
                      <span>{t('permanentlyDelete')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Danger Zone Card (Modern Vercel / Linear / Stripe Standard) */}
        <div className="bg-white dark:bg-zinc-950 border border-rose-200/80 dark:border-rose-900/40 rounded-2xl shadow-sm overflow-hidden mb-12">
          {/* Card Header */}
          <div className="flex items-center justify-between p-5 sm:p-6 border-b border-rose-100 dark:border-rose-950/60 bg-gradient-to-r from-rose-50/60 via-transparent to-transparent dark:from-rose-950/20">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{t('dangerZone')}</h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Irreversible actions regarding your account and campus transit data</p>
              </div>
            </div>
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100/80 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400">
              High Impact
            </span>
          </div>

          <div className="p-5 sm:p-6 space-y-6">
            {/* Export Personal Data Option */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-0.5">Export Personal Transit Archive</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Download a JSON archive of your personal profile, active passes, and booking records before deletion.</p>
              </div>
              <button
                type="button"
                onClick={handleExportData}
                disabled={isExportingData}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium border border-zinc-200 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors shadow-sm shrink-0"
              >
                {isExportingData ? (
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                ) : (
                  <Download className="w-4 h-4 text-zinc-500" />
                )}
                <span>Download Archive</span>
              </button>
            </div>

            <div className="h-px bg-rose-100/70 dark:bg-rose-950/40" />

            {/* Permanent Account Deletion Option */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-0.5">{t('deleteAccount')}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-lg">
                  Permanently erase your identity, transit allocations, seat reservations, and boarding pass. There is no recovery once deleted.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmation("");
                  setShowDeleteModal(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200 dark:border-rose-900/60 rounded-xl transition-all shadow-sm active:scale-95 shrink-0"
              >
                <Trash className="w-4 h-4" />
                <span>{t('deleteAccount')}...</span>
              </button>
            </div>
          </div>
        </div>

        </div>
      </main>

      {!isEnclosedInPortalLayout && <MobileBottomNav navItems={mobileBottomNavItems} />}
    </div>
  );
}
