import { Suspense } from "react";
import CorridorsManager from "@/components/transport-admin/routes/corridors/CorridorsManager";

export default function TransportManagerRoutesPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm font-semibold text-gray-500">Loading Transit Studio Google Map...</div>}>
      <CorridorsManager />
    </Suspense>
  );
}
