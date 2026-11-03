import { Stop, Route, TransitZone, Campus, Student } from "@/lib/types";

export interface AddressSuggestion {
  formattedAddress: string;
  mainText: string;
  secondaryText: string;
  latitude: number;
  longitude: number;
  provider?: string;
}

export interface RegionalLandmark {
  name: string;
  query: string;
  lat: number;
  lng: number;
}

export interface OnboardingAcademicData {
  courses: any[];
  branches: any[];
  specializations: any[];
  sections: any[];
  classes: any[];
}

export interface OnboardingToast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title?: string;
  message: string;
}

export interface StepHomeAndRouteProps {
  homeAddress: string;
  addressSearchQuery: string;
  isGeocodingAddress: boolean;
  isResolvingAddress: boolean;
  searchSuggestions: AddressSuggestion[];
  isSearchingSuggestions: boolean;
  showSuggestionsDropdown: boolean;
  fuzzySuggestions: AddressSuggestion[];
  fuzzyNotice: string | null;
  regionalLandmarks: RegionalLandmark[];
  homeLat: number;
  homeLng: number;
  stopsForMap: Stop[];
  assignedStop: Stop | undefined;
  primaryStopId: string;
  selectedZoneCode: string;
  assignedRouteName: string;
  walkingDistanceMeters: number;
  walkingTimeMins: number;
  isOutOfServiceArea: boolean;
  serviceAreaWarning: string | null;
  showAllStopsPicker: boolean;
  stopSearchQuery: string;
  availableStopsForCampus: Stop[];
  isDetectingGPS: boolean;
  onAddressInputChange: (val: string) => void;
  onSearchAddress: (e?: React.FormEvent) => void;
  onClearAddress: () => void;
  onSelectSuggestion: (item: AddressSuggestion) => void;
  onDetectGPS: () => void;
  onMapLocationSelect: (lat: number, lng: number) => void;
  onToggleAllStopsPicker: () => void;
  onStopSearchQueryChange: (query: string) => void;
  onSelectPickupStop: (stopId: string, stopZoneCode?: string, stopName?: string) => void;
  onContinue: () => void;
}

export interface StepProfileAndIdProps {
  fullName: string;
  phone: string;
  studentIdCode: string;
  campusId: string;
  campusOptions: { value: string; label: string }[];
  isCampusLocked: boolean;
  courseOptions: { value: string; label: string }[];
  selectedCourseId: string;
  branchOptions: { value: string; label: string }[];
  selectedBranchId: string;
  specializationOptions: { value: string; label: string }[];
  selectedSpecializationId: string;
  semesterOptions: { value: string; label: string }[];
  selectedYear: string;
  sectionOptions: { value: string; label: string }[];
  selectedSection: string;
  currentMatchedClass: any;
  emergencyName: string;
  emergencyPhone: string;
  photoUrl: string;
  localPreviewUrl: string;
  isUploadingPhoto: boolean;
  isPhotoLocked: boolean;
  imageLoadFailed: boolean;
  onFullNameChange: (val: string) => void;
  onPhoneChange: (val: string) => void;
  onStudentIdCodeChange: (val: string) => void;
  onCampusChange: (campusId: string) => void;
  onCourseChange: (courseId: string) => void;
  onBranchChange: (branchId: string) => void;
  onSpecializationChange: (specializationId: string) => void;
  onSemesterChange: (semester: string) => void;
  onSectionChange: (section: string) => void;
  onEmergencyNameChange: (val: string) => void;
  onEmergencyPhoneChange: (val: string) => void;
  onPhotoFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearPhoto: () => void;
  onBack: () => void;
  onContinue: () => void;
}

export interface StepActivatePassProps {
  fullName: string;
  studentIdCode: string;
  assignedStop: Stop | undefined;
  selectedZoneCode: string;
  semesterFee: number;
  isSubmitting: boolean;
  isRazorpayLoading: boolean;
  onSaveAndCheckout: () => void;
  onBack: () => void;
}

