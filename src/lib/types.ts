export type UserRole = "admin" | "student" | "driver" | "conductor" | "transport_manager" | "teacher" | "transport_admin";

export type BookingStatus = "CONFIRMED" | "WAITLISTED" | "CANCELLED" | "BOARDED" | "ABSENT" | "NO_SHOW";

export type RoamingStatus = "CONFIRMED" | "ROAMING" | "ONBOARD_CONFIRMED" | "RUNNING_TO_BUS";

export type TripStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DELAYED";

export type ShiftType = "MORNING" | "AFTERNOON" | "EVENING" | "CUSTOM" | string;

export type VehicleStatus = "ACTIVE" | "MAINTENANCE" | "INACTIVE" | "DECOMMISSIONED" | "MERGED" | "STANDBY_DISASSEMBLED";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "WAIVED";

export type AttendanceMethod = "QR_SCAN" | "BIOMETRIC_DEVICE" | "MANUAL_OVERRIDE";

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  provider: string;
  phone?: string | null;
  campusId?: string;
  /** @deprecated Use campusId instead */
  campus?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Campus {
  id: string;
  name: string;
  code: string;
  address?: string;
  landmark?: string;
  city?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  fleetCapacity?: number;
  parkingBays?: number;
  contactPhone?: string;
  contactEmail?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Stop {
  id: string;
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  landmark: string;
  geofenceRadiusMeters: number;
  campusId?: string;
  /** @deprecated Use campusId instead */
  campus?: string;
  isBusMergeStop?: boolean;
  zoneCode?: string;
}

export interface RouteStop {
  stopId: string;
  stopOrder: number;
  arrivalOffsetMinutes: number;
  bufferTimeMinutes: number;
  stop: Stop;
}

export interface Route {
  id: string;
  code: string;
  name: string;
  description: string;
  direction: "HOME_TO_CAMPUS" | "CAMPUS_TO_HOME" | "CIRCULAR" | "CAMPUS_TO_CAMPUS";
  color: string;
  isActive: boolean;
  stops: RouteStop[];
  totalDistanceKm: number;
  estimatedDurationMins: number;
  campusId?: string;
  originCampusId?: string;
  destinationCampusId?: string;
}

export interface BusSeat {
  id: string;
  busId: number;
  seatNumber: string; // e.g., "1A", "1B", "2A", "2B"
  deck: "LOWER" | "UPPER";
  isAccessible?: boolean;
}

export interface Bus {
  id: number;
  busNumber: number; // e.g. 2, 51
  registrationNo: string; // e.g. "DL-01-AB-1234"
  model: string; // e.g. "Tata Starbus Ultra 40-Seater"
  capacity: number;
  seatLayout: "2x2" | "2x3" | "3x2" | "NONE" | string;
  totalRows?: number; // Configured length (number of seating rows)
  status: VehicleStatus;
  gpsDeviceId: string;
  rfidDeviceId?: string;
  insuranceExpiry: string;
  maintenanceDueDate: string;
  currentRouteId?: string;
  teacherSeatsCount?: number;
}

export interface Shift {
  id: string;
  name: string;
  shiftType: ShiftType;
  direction: TripDirection; // e.g. "HOME_TO_CAMPUS"
  startTime: string; // "07:30"
  endTime: string;   // "09:00"
  bookingCutoffMins: number; // Cutoff prior to departure (e.g. 45 mins)
  isSpecial?: boolean;
  isPlacement?: boolean;
}

export interface SpecialShiftAllocation {
  id: string;
  shiftId: string;
  studentId: string;
  tripId?: string;
  notes?: string;
  allocatedBy?: string;
  createdAt?: string;
}

export type TripDirection = "HOME_TO_CAMPUS" | "CAMPUS_TO_HOME" | "CAMPUS_TO_CAMPUS";
export type TripScheduleType = "EVERY_DAY" | "MON_FRI" | "ONE_DAY" | "CUSTOM";

export interface Trip {
  id: string;
  tripCode: string;
  routeId: string;
  busId: number;
  shiftId: string;
  driverId: string;
  conductorId: string;
  tripDate: string; // YYYY-MM-DD
  status: TripStatus;
  startedAt?: string;
  completedAt?: string;
  delayMinutes: number;
  manifestLocked: boolean;
  manifestLockedAt?: string;
  currentStopIndex: number;
  isSpecial?: boolean;
  facilityType?: "REGULAR" | "PLACEMENT_DRIVE" | "EVENT";
}

export interface Student {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  department: string;
  semester: string;
  primaryStopId: string;
  primaryRouteId: string;
  emergencyContact: {
    name: string | null;
    relationship: string | null;
    phone: string | null;
  } | null;
  campusId?: string;
  /** @deprecated Use campusId instead */
  campus?: string;
  medicalNote?: string;
  transportAccessSuspended: boolean;
  hasActiveSubscription: boolean;
  subscriptionExpiryDate?: string;
  classId?: string;
  className?: string;
  zoneId?: string;
  zoneCode?: string;
  paymentStatus?: "UNPAID" | "PENDING_APPROVAL" | "PARTIALLY_PAID" | "APPROVED" | "REJECTED";
  totalFeeDue?: number;
  totalFeePaid?: number;
  photoUrl?: string;
  photoLocked?: boolean;
  /** Smart Transit: Student home GPS coordinates */
  homeLatitude?: number;
  homeLongitude?: number;
  homeAddress?: string;
  /** Auto-assigned nearest stop based on home location */
  autoAssignedStopId?: string;
  /** Academic Hierarchy (Course -> Branch -> Specialization -> Class) */
  courseId?: string;
  courseCode?: string;
  courseName?: string;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  specializationId?: string;
  specializationCode?: string;
  specializationLabel?: string;
  section?: string;
  /** Official Institutional Student ID (e.g. 230111075) */
  studentIdCode?: string;
  rfidCardId?: string;
}

export interface Guardian {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  relationship: "FATHER" | "MOTHER" | "GUARDIAN";
  linkedStudentIds: string[];
}

export interface Staff {
  id: string;
  userId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  category: "TRANSPORT_OPS" | "DRIVERS" | "CONDUCTORS" | "SUPERVISORS";
  rank: "SENIOR" | "REGULAR" | "PROBATIONARY";
  role: UserRole;
  permissions: string[];
  licenseNo?: string;
  medicalClearanceDate?: string;
  isActive: boolean;
}

export interface Booking {
  id: string;
  bookingCode: string;
  studentId: string;
  tripId: string;
  busId?: number;
  bookingDate?: string;
  boardingStopId: string;
  status: BookingStatus;
  waitlistPosition?: number; // e.g. 1 -> WL-01
  seatNumber?: string;       // e.g. "12B"
  passengerType?: "SEATED" | "STANDING_TILL_MERGE";
  mergeStopId?: string;
  mergeStopName?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  boardedAt?: string;
  roamingStatus?: RoamingStatus;
  runningGraceUntil?: string;
  createdAt: string;
}

export interface BusDepartureAlert {
  id: string;
  tripId: string;
  busId?: number;
  alertType: "BUS_FULL" | "DEPARTURE_CUTOFF" | "MANUAL_RECALL";
  message: string;
  triggeredAt: string;
  triggeredBy: string;
  status: "ACTIVE" | "RESOLVED";
  createdAt?: string;
}

export interface BookingStatusHistory {
  id: string;
  bookingId: string;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  reason: string;
  changedBy: string;
  timestamp: string;
}

export interface LiveBusLocation {
  busId: number;
  tripId: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  headingDeg: number;
  lastPingAt: string;
  currentStopId?: string;
  nextStopId?: string;
  estimatedArrivalNextStopMins: number;
  delayMinutes: number;
}

export interface FleetBusMarkerData {
  busId: number;
  busNumber: number;
  shortLabel: string;
  registrationNo: string;
  routeId?: string;
  routeName?: string;
  tripId?: string;
  tripCode?: string;
  tripStatus?: string;
  latitude: number;
  longitude: number;
  speedKmh: number;
  headingDeg: number;
  state: "CAMPUS_PARKED" | "STANDBY_STARTING_POINT" | "IN_TRANSIT" | "NONE" | string;
  statusText: string;
  driverName?: string;
  conductorName?: string;
  departureTime?: string;
  arrivalTime?: string;
  direction?: TripDirection;
  startingStopName?: string;
  destinationStopName?: string;
}

export type AttendanceLockStatus = "LOCKED" | "UNLOCKED";
export type AttendanceUnlockMethod = "LOCATION_DISTANCE" | "RFID" | "MANUAL_OVERRIDE";

export interface AttendanceLockState {
  studentId: string;
  tripId?: string;
  busId?: number;
  lockStatus: AttendanceLockStatus;
  unlockedBy?: AttendanceUnlockMethod | null;
  unlockedAt?: string | null;
  distanceMeters?: number | null;
  rfidCardId?: string | null;
  allowedThresholdMeters: number;
  canUnlockByLocation?: boolean;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  userId?: string;
  userRole?: "driver" | "conductor" | "student" | string;
  userName?: string;
  tripId: string;
  busId?: number;
  bookingId?: string;
  method: AttendanceMethod | "BUS_QR_SCAN" | "MANUAL_SELECT" | "RFID_VERIFIED" | "QR_SCAN_GPS" | "LOCATION_DISTANCE_UNLOCK" | "RFID_UNLOCK";
  verifiedBy: string;
  signatureToken?: string;
  deviceId?: string;
  status: "BOARDED" | "ABSENT" | "NO_SHOW" | "CHECKED_IN";
  notes?: string;
  timestamp: string;
  lockStatus?: AttendanceLockStatus;
  unlockedBy?: AttendanceUnlockMethod | null;
  distanceMeters?: number | null;
  rfidCardId?: string | null;
  unlockTimestamp?: string | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  durationMonths: number;
  price: number;
  description: string;
  features: string[];
  corridorTier?: string;
  stoppages?: string[];
}

export interface PaymentRecord {
  id: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  planName: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod: "UPI" | "CARD" | "NET_BANKING" | "SCHOLARSHIP_WAIVER";
  transactionRef: string;
  createdAt: string;
}

export interface PaymentSubmission {
  id: string;
  studentId: string;
  studentName: string;
  zoneCode: string;
  amount: number;
  installmentNo: number;
  totalInstallments: number;
  receiptUrl: string;
  transactionId: string;
  autoDetected: boolean;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface TransitZone {
  id?: string;
  code: string;
  name: string;
  corridorDescription: string;
  semesterFee: number;
  installmentsAllowed: number;
  campusId?: string;
  campusName?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Transit zones definition.
 * Primary source of truth is PostgreSQL table `public.transit_zones` synced via `store.getTransitZones()`.
 * The constant below serves as an offline initial fallback before first database sync.
 */
export const TRANSIT_ZONES: TransitZone[] = [
  {
    code: "ZONE_A",
    name: "Zone A: Lamachaur & Kaladhungi Corridor",
    corridorDescription: "Lamachaur Terminal, Amrapali Institute, Kamluvaganja, Bhagwanpur, Fatehpur",
    semesterFee: 14000,
    installmentsAllowed: 3,
  },
  {
    code: "ZONE_B",
    name: "Zone B: Haldwani City & Mukhani Corridor",
    corridorDescription: "Kusumkhera, Mukhani Chauraha, Heera Nagar, Tikonia, Unchapul, Bhakda Laldant",
    semesterFee: 12000,
    installmentsAllowed: 3,
  },
  {
    code: "ZONE_C",
    name: "Zone C: Kathgodam & Bhowali Hills Corridor",
    corridorDescription: "Kathgodam Rly Station, HMT Ranibagh, Jeolikote, Bhowali Chauraha, Panchakki",
    semesterFee: 10000,
    installmentsAllowed: 2,
  },
  {
    code: "ZONE_D",
    name: "Zone D: Campus Local Vicinity",
    corridorDescription: "University Campus Hub, Bhimtal Lake / Daant, Graphic Era IT Park",
    semesterFee: 6000,
    installmentsAllowed: 2,
  },
];

export interface VehicleIssue {
  id: string;
  busId: number;
  busNumber: number;
  reportedBy: string;
  issueType: "DELAY" | "TRAFFIC" | "BREAKDOWN" | "FUEL" | "EMERGENCY" | "TIRE_PUNCTURE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  location?: { latitude: number; longitude: number };
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  reportedAt: string;
  resolvedAt?: string;
}

export interface MaintenanceRecord {
  id: string;
  busId: number;
  busNumber: number;
  serviceType: "PERIODIC_INSPECTION" | "BRAKE_OVERHAUL" | "ENGINE_TUNE" | "TIRE_REPLACEMENT" | "AC_SERVICE";
  cost: number;
  odometerKm: number;
  serviceCenter: string;
  serviceDate: string;
  nextDueKm: number;
  nextDueDate: string;
  notes: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: "CONFIRMATION" | "WAITLIST_PROMOTION" | "DELAY" | "BOARDING" | "PAYMENT" | "SOS" | "INFO";
  isRead: boolean;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  performedBy: string;
  details: string;
  timestamp: string;
}

// ─── Enhancement Phase 3 Types (Database-backed) ───

export interface ClassItem {
  id: string;
  course: string;
  department?: string;
  semester?: string;
  year: string;
  section: string;
  specialization?: string;
  name: string;
  isActive: boolean;
  createdAt?: string;
  studentCount?: number;
  assignedTeachers?: { id: string; fullName: string; email: string; isPrimary: boolean }[];
  shiftSchedule?: Record<string, { enabled?: boolean; days?: Record<string, boolean> }>;
}

export interface ClassTeacher {
  id: string;
  classId: string;
  teacherId: string;
  isPrimary: boolean;
  assignedAt?: string;
}

export interface ClassShiftRule {
  enabled?: boolean;
  days?: Record<string, boolean>;
}

export interface BusMergePoint {
  id: string;
  routeId: string;
  stopId: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

export interface BusMergeSuggestion {
  id: string;
  mergePointId: string;
  routeId: string;
  sourceBusId: number;
  targetBusId: number;
  sourceOccupancy: number;
  targetOccupancy: number;
  targetCapacity: number;
  combinedOccupancy: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "EXECUTED";
  rejectionReason?: string;
  suggestedBy?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt?: string;
}

export interface DispatchConfig {
  id?: string;
  minOccupancyPercent: number;
  maxWaitMinutes: number;
  progressiveDispatchEnabled: boolean;
  updatedAt?: string;
}

export interface AuditLogEntry {
  id: string;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  previousValue?: any;
  newValue?: any;
  reason?: string;
  createdAt: string;
}

export interface TodayBusArrival {
  studentId: string;
  studentName: string;
  classId: string;
  className: string;
  busId: number;
  busNumber: number;
  tripId: string;
  tripCode: string;
  boardingStopId?: string;
  boardingStopName: string;
  boardingTime: string;
  status: "Present";
}

// ─── Maintenance Register Types ───

export type MaintenanceRequestStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface MaintenanceRequest {
  id: string;
  serialNo: number;
  date: string;
  vehicleNo: string;
  busId: number;
  item: string;
  quantity: number;
  rate: number;
  amount: number;
  defectDescription: string;
  defectImageUrls: string[];
  workDoneDescription: string;
  workDoneImageUrls: string[];
  paymentReceiptUrl: string | null;
  paymentTransactionId: string | null;
  status: MaintenanceRequestStatus;
  requestedBy: string;
  requestedByName: string;
  approvedBy: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  remarks: string;
}

// ─── Language & Preferences Types ───

export type SupportedLanguage = "en" | "hi" | "pa" | "bn" | "ta" | "te" | "mr" | "gu" | "kn" | "ml";

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  primaryLanguage: SupportedLanguage;
  secondaryLanguage: SupportedLanguage | null;
}

export type HaltRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

export interface HaltRequest {
  id: string; // usually tripId:studentId
  tripId: string;
  studentId: string;
  studentName: string;
  studentPhoto?: string;
  latitude: number;
  longitude: number;
  status: HaltRequestStatus;
  createdAt: string;
  updatedAt: string;
}

// ─── Smart Transit System Types ───

export type BusReservationStatus = "ASSIGNED" | "SEAT_SELECTED" | "BOARDED" | "ABSENT" | "CANCELLED" | "SWITCHED";
export type BusAssignmentSource = "AI_AUTO" | "MANAGER_OVERRIDE" | "SWITCH_APPROVED" | "MANUAL";
export type SwitchRequestType = "PERMANENT_TRANSFER" | "TEMPORARY_SWAP" | "STOP_CHANGE" | "PREFERENCE_REQUEST";
export type SwitchRequestStatus = "PENDING" | "AUTO_APPROVED" | "NEEDS_REVIEW" | "MANAGER_APPROVED" | "MANAGER_DENIED" | "AUTO_DENIED" | "EXECUTED" | "EXPIRED";
export type SeatSelectionMode = "AT_BOOKING" | "AT_ATTENDANCE";
export type FeasibilityCheck = "PASS" | "WARN" | "FAIL";

/** Bus-level reservation (AI-assigned bus, student picks seat at attendance) */
export interface BusReservation {
  id: string;
  studentId: string;
  tripId?: string;
  busId: number;
  boardingStopId: string;
  shiftId: string;
  reservationDate: string;
  assignedBy: BusAssignmentSource;
  assignmentScore?: number;
  chosenSeat?: string;
  seatChosenAt?: string;
  status: BusReservationStatus;
  boardedAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

/** Switch request with AI evaluation + manager override */
export interface BusSwitchRequest {
  id: string;
  studentId: string;
  currentBusId: number;
  currentStopId: string;
  requestedBusId?: number;
  requestedStopId?: string;
  requestType: SwitchRequestType;
  reason?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  aiCapacityCheck?: FeasibilityCheck;
  aiDistanceCheck?: FeasibilityCheck;
  aiEfficiencyCheck?: FeasibilityCheck;
  aiComplianceCheck?: FeasibilityCheck;
  aiOverallDecision?: string;
  aiReasoning?: string;
  aiAlternativeBusId?: number;
  aiEvaluatedAt?: string;
  managerDecision?: string;
  managerId?: string;
  managerNotes?: string;
  managerDecidedAt?: string;
  status: SwitchRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** AI-generated dynamic route plan */
export interface DynamicRoutePlan {
  id: string;
  planDate: string;
  shiftId: string;
  direction: TripDirection;
  busId: number;
  stopSequence: string[];
  demandPerStop: number[];
  totalDemand: number;
  currentReservations: number;
  totalDistanceKm?: number;
  estimatedDurationMins?: number;
  isConsolidated: boolean;
  mergedFromRoutes: string[];
  status: string;
  createdAt: string;
}

/** Transport admin configurable settings */
export interface TransportSettings {
  id: string;
  maxWalkDistanceKm: number;
  autoAssignmentEnabled: boolean;
  seatSelectionMode: SeatSelectionMode;
  minFillPercent: number;
  maxRideTimeMins: number;
  capacityBufferPercent: number;
  switchAutoApproveBelowPct: number;
  updatedAt?: string;
  updatedBy?: string;
}

/** Result of AI switch request feasibility evaluation */
export interface SwitchEvaluation {
  capacityCheck: FeasibilityCheck;
  distanceCheck: FeasibilityCheck;
  efficiencyCheck: FeasibilityCheck;
  complianceCheck: FeasibilityCheck;
  overallDecision: "AUTO_APPROVED" | "NEEDS_REVIEW" | "AUTO_DENIED";
  reasoning: string;
  alternativeBusId?: string;
}
