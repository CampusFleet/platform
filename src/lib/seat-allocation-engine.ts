/**
 * CampusFleet Railway-Inspired Algorithmic Seat Allocation Engine
 * 
 * Inspired by railway Passenger Reservation Systems (IRCTC / European Rail):
 * 1. Companion / Partner Cohesion (PNR Adjacency Rule):
 *    - Prioritizes side-by-side adjacent seating (e.g. 4A & 4B, 4C & 4D).
 *    - Fallbacks: across-aisle pair (4B & 4C) -> tandem row pair (3A & 4A) -> same row zone.
 * 2. Coach Row Zone Optimization:
 *    - FRONT: Easy boarding/egress near driver, low motion sickness.
 *    - MIDDLE: Smoothest ride, lowest chassis vibration & noise over axles.
 *    - BACK: Rear coach group seating.
 * 3. Position Preference:
 *    - WINDOW: Outside wall panoramic seats.
 *    - AISLE: Extra legroom & rapid walkway access.
 * 4. Faculty Safeguards:
 *    - Teacher starting seats strictly protected from non-faculty auto-allocation.
 * 5. Deterministic Coach Load Balancing:
 *    - Distributes passenger mass center-outward when no explicit preference is set.
 */

import { Bus, Student, CommuterSeatPreferences, SeatRowPreference, SeatPositionPreference } from "./types";
import { generateSeatLayout, parseSeatLayout, getTeacherStartingSeats } from "./utils";

export interface ParsedSeat {
  seatCode: string;
  row: number;
  col: string;
}

export interface SeatAllocationResult {
  allocatedSeat: string;
  score: number;
  matchReasons: string[];
  isAdjacentToPartner: boolean;
  partnerSeat?: string | null;
  partnerName?: string | null;
  seatRowZone: "FRONT" | "MIDDLE" | "BACK";
  seatPosition: "WINDOW" | "AISLE" | "MIDDLE_BENCH";
  seatRowNumber: number;
  totalRows: number;
}

export interface AllocateSeatParams {
  bus: Bus;
  student: {
    id: string;
    fullName?: string;
    role?: string;
    seatRowPreference?: SeatRowPreference;
    seatPositionPreference?: SeatPositionPreference;
    preferredPartnerStudentId?: string | null;
    preferredPartnerName?: string | null;
  };
  occupiedSeats?: string[];
  allTripReservations?: {
    studentId?: string;
    student_id?: string;
    studentName?: string;
    chosenSeat?: string | null;
    chosen_seat?: string | null;
    seatNumber?: string | null;
    status?: string;
  }[];
}

/**
 * Parses a seat string into row number and column letter (e.g. "4B" -> { row: 4, col: "B" })
 */
export function parseSeat(seatCode: string): ParsedSeat | null {
  if (!seatCode || typeof seatCode !== "string") return null;
  const match = seatCode.trim().match(/^(\d+)([A-Z]+)$/i);
  if (!match) return null;
  return {
    seatCode: seatCode.trim().toUpperCase(),
    row: parseInt(match[1], 10),
    col: match[2].toUpperCase(),
  };
}

/**
 * Categorizes a row number into Front, Middle, or Back zone of the bus chassis
 */
export function getSeatRowZone(row: number, totalRows: number): "FRONT" | "MIDDLE" | "BACK" {
  const safeTotal = Math.max(totalRows, 2);
  const frontBoundary = Math.max(1, Math.ceil(safeTotal * 0.33));
  const middleBoundary = Math.max(frontBoundary + 1, Math.floor(safeTotal * 0.67));

  if (row <= frontBoundary) return "FRONT";
  if (row <= middleBoundary) return "MIDDLE";
  return "BACK";
}

/**
 * Categorizes a seat position into Window, Aisle, or Middle Bench based on coach layout (e.g. 2x2, 3x2)
 */
export function getSeatPosition(
  seatCode: string,
  layoutStr: string = "2x2"
): "WINDOW" | "AISLE" | "MIDDLE_BENCH" {
  const parsed = parseSeat(seatCode);
  if (!parsed) return "WINDOW";

  const { left, right } = parseSeatLayout(layoutStr);
  if (left <= 0 || right <= 0) {
    // Default 2x2 assumption
    if (parsed.col === "A" || parsed.col === "D") return "WINDOW";
    if (parsed.col === "M") return "MIDDLE_BENCH";
    return "AISLE";
  }

  const leftCols = Array.from({ length: left }, (_, i) => String.fromCharCode(65 + i));
  const rightCols = Array.from({ length: right }, (_, i) => String.fromCharCode(65 + left + i));

  if (parsed.col === "M") return "MIDDLE_BENCH";

  // Left window = First left col; Right window = Last right col
  const isLeftWindow = parsed.col === leftCols[0];
  const isRightWindow = parsed.col === rightCols[rightCols.length - 1];
  if (isLeftWindow || isRightWindow) return "WINDOW";

  // Left aisle = Last left col; Right aisle = First right col
  const isLeftAisle = parsed.col === leftCols[leftCols.length - 1];
  const isRightAisle = parsed.col === rightCols[0];
  if (isLeftAisle || isRightAisle) return "AISLE";

  // Default interior middle seat (in 3x2 or 3x3 layouts)
  return "AISLE";
}

/**
 * Checks if two seats are physically adjacent on the bus (side-by-side or across aisle)
 */
export function areSeatsAdjacent(
  seatA: string,
  seatB: string,
  layoutStr: string = "2x2"
): boolean {
  const pA = parseSeat(seatA);
  const pB = parseSeat(seatB);
  if (!pA || !pB) return false;
  if (pA.seatCode === pB.seatCode) return false;

  // Must be in the same row
  if (pA.row !== pB.row) return false;

  const { left, right } = parseSeatLayout(layoutStr);
  const safeLeft = left > 0 ? left : 2;
  const safeRight = right > 0 ? right : 2;

  const leftCols = Array.from({ length: safeLeft }, (_, i) => String.fromCharCode(65 + i));
  const rightCols = Array.from({ length: safeRight }, (_, i) => String.fromCharCode(65 + safeLeft + i));

  // 1. Same side adjacent pair (e.g. A & B, or C & D in 2x2)
  const idxAInLeft = leftCols.indexOf(pA.col);
  const idxBInLeft = leftCols.indexOf(pB.col);
  if (idxAInLeft !== -1 && idxBInLeft !== -1 && Math.abs(idxAInLeft - idxBInLeft) === 1) {
    return true;
  }

  const idxAInRight = rightCols.indexOf(pA.col);
  const idxBInRight = rightCols.indexOf(pB.col);
  if (idxAInRight !== -1 && idxBInRight !== -1 && Math.abs(idxAInRight - idxBInRight) === 1) {
    return true;
  }

  // 2. Across-the-aisle adjacent pair (e.g. B & C in 2x2)
  const isLeftAisleA = idxAInLeft === leftCols.length - 1;
  const isRightAisleB = idxBInRight === 0;
  if (isLeftAisleA && isRightAisleB) return true;

  const isLeftAisleB = idxBInLeft === leftCols.length - 1;
  const isRightAisleA = idxAInRight === 0;
  if (isLeftAisleB && isRightAisleA) return true;

  // 3. Middle rear bench adjacency with M
  if (pA.col === "M" && (isLeftAisleB || isRightAisleB)) return true;
  if (pB.col === "M" && (isLeftAisleA || isRightAisleA)) return true;

  return false;
}

/**
 * Calculates companion proximity score between candidate seat and partner's seat
 */
export function calculatePartnerProximity(
  candidateSeat: string,
  partnerSeat: string,
  layoutStr: string = "2x2",
  totalRows: number = 10
): { score: number; relation: string; isAdjacent: boolean } {
  const pCand = parseSeat(candidateSeat);
  const pPart = parseSeat(partnerSeat);
  if (!pCand || !pPart) {
    return { score: 0, relation: "NONE", isAdjacent: false };
  }
  if (pCand.seatCode === pPart.seatCode) {
    return { score: -9999, relation: "SAME_SEAT_OCCUPIED", isAdjacent: false };
  }

  // Same row checks
  if (pCand.row === pPart.row) {
    // Immediate side-by-side on same side
    const { left } = parseSeatLayout(layoutStr);
    const safeLeft = left > 0 ? left : 2;
    const isCandLeft = pCand.col.charCodeAt(0) - 65 < safeLeft;
    const isPartLeft = pPart.col.charCodeAt(0) - 65 < safeLeft;

    if (isCandLeft === isPartLeft) {
      // Top Priority: Exact Side-by-Side Companion Seating (+250)
      return { score: 250, relation: "SIDE_BY_SIDE", isAdjacent: true };
    }
    // High Priority: Across the Aisle Companion Seating (+180)
    return { score: 180, relation: "ACROSS_AISLE", isAdjacent: true };
  }

  // Adjacent consecutive rows
  if (Math.abs(pCand.row - pPart.row) === 1) {
    // Same column tandem (directly in front or behind)
    if (pCand.col === pPart.col) {
      return { score: 70, relation: "TANDEM_ROW", isAdjacent: false };
    }
    // Adjacent column in adjacent row
    return { score: 50, relation: "BAY_COMPANION", isAdjacent: false };
  }

  // Same coach zone
  const zoneCand = getSeatRowZone(pCand.row, totalRows);
  const zonePart = getSeatRowZone(pPart.row, totalRows);
  if (zoneCand === zonePart) {
    return { score: 20, relation: "SAME_ROW_ZONE", isAdjacent: false };
  }

  return { score: 5, relation: "DIFFERENT_ZONE", isAdjacent: false };
}

/**
 * Finds all contiguous adjacent pairs among available seats
 */
export function findAdjacentPairs(
  availableSeats: string[],
  layoutStr: string = "2x2"
): [string, string][] {
  const pairs: [string, string][] = [];
  const set = new Set(availableSeats);

  for (let i = 0; i < availableSeats.length; i++) {
    for (let j = i + 1; j < availableSeats.length; j++) {
      const sA = availableSeats[i];
      const sB = availableSeats[j];
      if (areSeatsAdjacent(sA, sB, layoutStr)) {
        pairs.push([sA, sB]);
      }
    }
  }

  return pairs;
}

/**
 * Core Railway-Inspired Algorithmic Seat Allocation Engine
 */
export function allocateSeatWithPreferences(params: AllocateSeatParams): SeatAllocationResult {
  const { bus, student, occupiedSeats = [], allTripReservations = [] } = params;

  const capacity = Number(bus.capacity || 40);
  const layout = bus.seatLayout || "2x2";
  const customRows = bus.totalRows;

  // 1. Generate all seat codes
  const allSeats = generateSeatLayout(capacity, layout, customRows);
  if (allSeats.length === 0) {
    return {
      allocatedSeat: "1A",
      score: 0,
      matchReasons: ["Default chassis fallback"],
      isAdjacentToPartner: false,
      seatRowZone: "FRONT",
      seatPosition: "WINDOW",
      seatRowNumber: 1,
      totalRows: 1,
    };
  }

  // Determine total rows in coach
  let maxRow = 1;
  allSeats.forEach((s) => {
    const p = parseSeat(s);
    if (p && p.row > maxRow) maxRow = p.row;
  });
  const totalRows = maxRow;

  // 2. Identify faculty reserve seats
  const nTeachers =
    typeof (bus as any).teacherSeatsCount === "number"
      ? (bus as any).teacherSeatsCount
      : typeof (bus as any).teacher_seats_count === "number"
      ? (bus as any).teacher_seats_count
      : 0;
  const teacherReserved = nTeachers > 0 ? getTeacherStartingSeats(allSeats, nTeachers) : [];

  const isFacultyUser = Boolean(
    student.role === "teacher" ||
    student.role === "faculty" ||
    student.role === "staff" ||
    (student as any).userRole === "teacher" ||
    (student as any).userRole === "faculty"
  );

  // 3. Compute available candidate seats
  const occupiedSet = new Set(occupiedSeats.map((s) => s.trim().toUpperCase()));
  const candidateSeats = allSeats.filter((seat) => {
    const s = seat.toUpperCase();
    if (occupiedSet.has(s)) return false;
    // Teacher reserved seat exclusion for non-faculty
    if (!isFacultyUser && teacherReserved.includes(seat)) return false;
    return true;
  });

  if (candidateSeats.length === 0) {
    // Bus is 100% full, return last seat with standby status
    return {
      allocatedSeat: allSeats[0],
      score: 0,
      matchReasons: ["Coach at 100% capacity - Standby allocation"],
      isAdjacentToPartner: false,
      seatRowZone: "FRONT",
      seatPosition: "WINDOW",
      seatRowNumber: 1,
      totalRows,
    };
  }

  // 4. Resolve Seat Preferences
  const prefRow: SeatRowPreference = student.seatRowPreference || "NO_PREFERENCE";
  const prefPos: SeatPositionPreference = student.seatPositionPreference || "NO_PREFERENCE";
  const partnerId = student.preferredPartnerStudentId;

  // 5. Look up Partner's existing seat on this trip if specified
  let partnerSeat: string | null = null;
  let partnerName: string | null = student.preferredPartnerName || null;

  if (partnerId) {
    const foundPartnerRes = allTripReservations.find(
      (r) =>
        (r.studentId === partnerId || r.student_id === partnerId || (r as any).userId === partnerId) &&
        (r.chosenSeat || r.chosen_seat || r.seatNumber) &&
        r.status !== "CANCELLED"
    );

    if (foundPartnerRes) {
      partnerSeat = (foundPartnerRes.chosenSeat || foundPartnerRes.chosen_seat || foundPartnerRes.seatNumber || "").toUpperCase();
      if (!partnerName && foundPartnerRes.studentName) {
        partnerName = foundPartnerRes.studentName;
      }
    }
  }

  // 6. Score each candidate seat
  let bestSeat = candidateSeats[0];
  let highestScore = -999999;
  let bestReasons: string[] = [];
  let isBestAdjacent = false;

  const middleRowTarget = Math.round(totalRows / 2);

  for (const seat of candidateSeats) {
    const parsed = parseSeat(seat);
    if (!parsed) continue;

    let score = 0;
    const reasons: string[] = [];
    let isAdjacent = false;

    // A. Companion / Partner Matching (Weight: Up to 100 points)
    if (partnerSeat) {
      const prox = calculatePartnerProximity(seat, partnerSeat, layout, totalRows);
      score += prox.score;
      if (prox.isAdjacent) {
        isAdjacent = true;
        reasons.push(
          prox.relation === "SIDE_BY_SIDE"
            ? `Seated side-by-side with partner ${partnerName || "peer"} (${partnerSeat})`
            : `Seated across the aisle from partner ${partnerName || "peer"} (${partnerSeat})`
        );
      } else if (prox.score >= 40) {
        reasons.push(`Seated in companion bay with partner (${partnerSeat})`);
      }
    }

    // B. Row Zone Preference Matching (Weight: Up to 40 points)
    const rowZone = getSeatRowZone(parsed.row, totalRows);
    if (prefRow !== "NO_PREFERENCE") {
      if (rowZone === prefRow) {
        score += 40;
        reasons.push(`Matches ${prefRow.toLowerCase()} row preference (Row ${parsed.row})`);
      } else {
        // Penalty for opposite zone
        score -= 20;
      }
    } else {
      score += 15; // Neutral baseline
    }

    // C. Position Preference (Window vs. Aisle) (Weight: Up to 30 points)
    const seatPos = getSeatPosition(seat, layout);
    if (prefPos !== "NO_PREFERENCE") {
      if (seatPos === prefPos) {
        score += 30;
        reasons.push(`Matches ${prefPos.toLowerCase()} seat preference`);
      } else if (seatPos === "MIDDLE_BENCH") {
        score -= 10;
      } else {
        score -= 10;
      }
    } else {
      score += 10; // Neutral baseline
    }

    // D. Dynamic Coach Center-Outward Balancing (Railway Physics Heuristic)
    // Minimizes axle vibration; fills comfortably from center-outward when no partner is set
    if (!partnerSeat) {
      const distFromCenter = Math.abs(parsed.row - middleRowTarget);
      const balanceBonus = Math.max(0, 10 - distFromCenter);
      score += balanceBonus;
    }

    // Faculty priority for Row 1
    if (isFacultyUser && parsed.row === 1) {
      score += 50;
      reasons.push("Faculty front row priority allocation");
    }

    if (score > highestScore) {
      highestScore = score;
      bestSeat = seat;
      bestReasons = reasons;
      isBestAdjacent = isAdjacent;
    }
  }

  const bestParsed = parseSeat(bestSeat) || { row: 1, col: "A", seatCode: bestSeat };
  const finalZone = getSeatRowZone(bestParsed.row, totalRows);
  const finalPos = getSeatPosition(bestSeat, layout);

  if (bestReasons.length === 0) {
    bestReasons.push(`Auto-assigned optimal seat in ${finalZone.toLowerCase()} section`);
  }

  return {
    allocatedSeat: bestSeat,
    score: highestScore,
    matchReasons: bestReasons,
    isAdjacentToPartner: isBestAdjacent,
    partnerSeat,
    partnerName,
    seatRowZone: finalZone,
    seatPosition: finalPos,
    seatRowNumber: bestParsed.row,
    totalRows,
  };
}

export interface PartnerPairResult {
  seatA: string;
  seatB: string;
  relation: "SIDE_BY_SIDE" | "ACROSS_AISLE" | "TANDEM_ROW" | "SEPARATE";
  isAdjacent: boolean;
  rowZone: "FRONT" | "MIDDLE" | "BACK";
  matchReasons: string[];
}

/**
 * Allocates a contiguous adjacent pair of seats for two accepted partners on the same bus trip
 */
export function allocateAdjacentPairForPartners(
  bus: Bus,
  studentA: {
    id: string;
    role?: string;
    seatRowPreference?: SeatRowPreference;
    seatPositionPreference?: SeatPositionPreference;
    currentSeat?: string | null;
  },
  studentB: {
    id: string;
    role?: string;
    seatRowPreference?: SeatRowPreference;
    seatPositionPreference?: SeatPositionPreference;
    currentSeat?: string | null;
  },
  occupiedSeats: string[] = []
): PartnerPairResult {
  const capacity = Number(bus.capacity || 40);
  const layout = bus.seatLayout || "2x2";
  const customRows = bus.totalRows;

  const allSeats = generateSeatLayout(capacity, layout, customRows);
  let maxRow = 1;
  allSeats.forEach((s) => {
    const p = parseSeat(s);
    if (p && p.row > maxRow) maxRow = p.row;
  });
  const totalRows = maxRow;

  const nTeachers =
    typeof (bus as any).teacherSeatsCount === "number"
      ? (bus as any).teacherSeatsCount
      : typeof (bus as any).teacher_seats_count === "number"
      ? (bus as any).teacher_seats_count
      : 0;
  const teacherReserved = nTeachers > 0 ? getTeacherStartingSeats(allSeats, nTeachers) : [];

  const isFacultyA = Boolean(studentA.role === "teacher" || studentA.role === "faculty");
  const isFacultyB = Boolean(studentB.role === "teacher" || studentB.role === "faculty");

  // Allow seats currently held by Student A or Student B to be part of the pair re-allocation
  const studentSeats = new Set([
    studentA.currentSeat?.trim().toUpperCase(),
    studentB.currentSeat?.trim().toUpperCase(),
  ].filter(Boolean));

  const occupiedSet = new Set(
    occupiedSeats
      .map((s) => s.trim().toUpperCase())
      .filter((s) => !studentSeats.has(s))
  );

  const availableCandidateSeats = allSeats.filter((seat) => {
    const s = seat.toUpperCase();
    if (occupiedSet.has(s)) return false;
    if (!isFacultyA && !isFacultyB && teacherReserved.includes(seat)) return false;
    return true;
  });

  if (availableCandidateSeats.length < 2) {
    const fallbackA = availableCandidateSeats[0] || allSeats[0];
    const fallbackB = availableCandidateSeats[1] || allSeats[1] || allSeats[0];
    return {
      seatA: fallbackA,
      seatB: fallbackB,
      relation: "SEPARATE",
      isAdjacent: false,
      rowZone: "MIDDLE",
      matchReasons: ["Coach near capacity; partial allocation applied"],
    };
  }

  // Desired Row Zone consensus
  const targetRowZone: SeatRowPreference =
    studentA.seatRowPreference && studentA.seatRowPreference !== "NO_PREFERENCE"
      ? studentA.seatRowPreference
      : studentB.seatRowPreference && studentB.seatRowPreference !== "NO_PREFERENCE"
      ? studentB.seatRowPreference
      : "MIDDLE";

  // Check 1: Can Student A keep their current seat and Student B take an adjacent seat?
  if (studentA.currentSeat && availableCandidateSeats.includes(studentA.currentSeat)) {
    const curA = studentA.currentSeat;
    const candidatesForB = availableCandidateSeats.filter((s) => s !== curA);
    const adjacentSide = candidatesForB.find(
      (s) => areSeatsAdjacent(curA, s, layout) && calculatePartnerProximity(curA, s, layout, totalRows).relation === "SIDE_BY_SIDE"
    );
    if (adjacentSide) {
      const p = parseSeat(curA)!;
      return {
        seatA: curA,
        seatB: adjacentSide,
        relation: "SIDE_BY_SIDE",
        isAdjacent: true,
        rowZone: getSeatRowZone(p.row, totalRows),
        matchReasons: [`Seated side-by-side in Row ${p.row} (${curA} & ${adjacentSide})`],
      };
    }
  }

  // Check 2: Can Student B keep their current seat and Student A take an adjacent seat?
  if (studentB.currentSeat && availableCandidateSeats.includes(studentB.currentSeat)) {
    const curB = studentB.currentSeat;
    const candidatesForA = availableCandidateSeats.filter((s) => s !== curB);
    const adjacentSide = candidatesForA.find(
      (s) => areSeatsAdjacent(curB, s, layout) && calculatePartnerProximity(curB, s, layout, totalRows).relation === "SIDE_BY_SIDE"
    );
    if (adjacentSide) {
      const p = parseSeat(curB)!;
      return {
        seatA: adjacentSide,
        seatB: curB,
        relation: "SIDE_BY_SIDE",
        isAdjacent: true,
        rowZone: getSeatRowZone(p.row, totalRows),
        matchReasons: [`Seated side-by-side in Row ${p.row} (${adjacentSide} & ${curB})`],
      };
    }
  }

  // Check 3: Find all contiguous adjacent pairs among all available seats
  const adjacentPairs = findAdjacentPairs(availableCandidateSeats, layout);

  let bestPair: [string, string] | null = null;
  let bestScore = -999999;
  let bestRelation: "SIDE_BY_SIDE" | "ACROSS_AISLE" = "SIDE_BY_SIDE";

  for (const [s1, s2] of adjacentPairs) {
    const p1 = parseSeat(s1)!;
    const prox = calculatePartnerProximity(s1, s2, layout, totalRows);
    let pairScore = prox.score;

    const rowZone = getSeatRowZone(p1.row, totalRows);
    if (rowZone === targetRowZone) {
      pairScore += 60; // Preferred zone match
    }

    // Assign window seat to the student who prefers window
    let candidateA = s1;
    let candidateB = s2;
    const pos1 = getSeatPosition(s1, layout);
    const pos2 = getSeatPosition(s2, layout);

    if (studentA.seatPositionPreference === "WINDOW" && pos2 === "WINDOW" && pos1 !== "WINDOW") {
      candidateA = s2;
      candidateB = s1;
    } else if (studentB.seatPositionPreference === "WINDOW" && pos1 === "WINDOW" && pos2 !== "WINDOW") {
      candidateA = s2;
      candidateB = s1;
    }

    if (pairScore > bestScore) {
      bestScore = pairScore;
      bestPair = [candidateA, candidateB];
      bestRelation = prox.relation === "SIDE_BY_SIDE" ? "SIDE_BY_SIDE" : "ACROSS_AISLE";
    }
  }

  if (bestPair) {
    const p = parseSeat(bestPair[0])!;
    const rowZone = getSeatRowZone(p.row, totalRows);
    return {
      seatA: bestPair[0],
      seatB: bestPair[1],
      relation: bestRelation,
      isAdjacent: true,
      rowZone,
      matchReasons: [
        bestRelation === "SIDE_BY_SIDE"
          ? `Allocated side-by-side partner pair in Row ${p.row} (${bestPair[0]} & ${bestPair[1]})`
          : `Allocated across-aisle partner pair in Row ${p.row} (${bestPair[0]} & ${bestPair[1]})`,
      ],
    };
  }

  // Fallback: Pair in consecutive tandem rows (same column)
  for (const s1 of availableCandidateSeats) {
    const p1 = parseSeat(s1)!;
    const tandem = availableCandidateSeats.find((s2) => {
      const p2 = parseSeat(s2);
      return p2 && Math.abs(p1.row - p2.row) === 1 && p1.col === p2.col;
    });
    if (tandem) {
      const rowZone = getSeatRowZone(p1.row, totalRows);
      return {
        seatA: s1,
        seatB: tandem,
        relation: "TANDEM_ROW",
        isAdjacent: false,
        rowZone,
        matchReasons: [`Allocated consecutive row pair (${s1} & ${tandem})`],
      };
    }
  }

  // Ultimate fallback
  return {
    seatA: availableCandidateSeats[0],
    seatB: availableCandidateSeats[1] || availableCandidateSeats[0],
    relation: "SEPARATE",
    isAdjacent: false,
    rowZone: "MIDDLE",
    matchReasons: ["Allocated closest available individual seats on coach"],
  };
}
