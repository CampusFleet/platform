import CorridorDetailView from "@/components/transport-admin/routes/corridors/CorridorDetailView";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function CorridorDetailPage({ params }: { params: { id: string } }) {
  const routeId = params?.id ? decodeURIComponent(params.id) : "";

  return (
    <div className="space-y-6 animate-in fade-in pb-12 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <Link 
          href="/transport-admin/routes"
          className="p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Corridor Detail</h1>
          <p className="text-xs text-gray-500 font-mono">Real-time tracking and telemetry</p>
        </div>
      </div>

      <CorridorDetailView routeId={routeId} />
    </div>
  );
}
