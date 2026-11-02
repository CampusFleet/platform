import { getStaffServerData } from "@/lib/staff-data";
import LiveFleetTelematicsView from "@/components/transport-manager/LiveFleetTelematicsView";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Bus Fleet Radar | Transport Manager",
  description: "Institutional fleet tracking god-view with live GPS coordinates and conductor console mirroring.",
};

export const dynamic = "force-dynamic";

export default async function TransportManagerLiveFleetPage() {
  const data = await getStaffServerData("/transport-manager/live");

  return (
    <LiveFleetTelematicsView
      initialBuses={data.buses}
      initialTrips={data.trips}
      initialRoutes={data.routes}
      initialShifts={data.shifts}
      initialStaff={data.staff}
      initialBookings={data.bookings}
      initialStudents={data.students}
      initialStops={data.stops}
    />
  );
}
