"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { store } from "@/lib/client-store";
import { Bus } from "@/lib/types";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Printer } from "lucide-react";

export default function TransportAdminSeatQRsPage() {
  const params = useParams();
  const router = useRouter();
  const busId = params.busId as string;
  
  const [bus, setBus] = useState<Bus | null>(null);

  useEffect(() => {
    if (busId) {
      const buses = store.getBuses();
      const foundBus = buses.find((b) => b.id === Number(busId));
      if (foundBus) {
        setBus(foundBus);
      }
    }
  }, [busId]);

  if (!bus) {
    return (
      <div className="p-8 text-center text-gray-500">
        Loading bus details...
      </div>
    );
  }

  // Generate an array of seat numbers from 1 to capacity
  const seats = Array.from({ length: bus.capacity }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
      <div className="print:hidden sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                Seat QRs: {bus.busNumber}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {bus.registrationNo} • {bus.capacity} Seats
              </p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-sm"
          >
            <Printer className="w-4 h-4" />
            <span>Print All</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 sm:p-8">
        <div className="print:hidden mb-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-blue-800 dark:text-blue-300 text-sm">
          <strong>Printing Tip:</strong> For best results, print on A4 sticker sheets. Make sure "Background graphics" is enabled and margins are set to minimum in your print dialogue.
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 print:grid-cols-4 print:gap-2 print:p-0">
          {seats.map((seatNumber) => {
            const qrPayload = JSON.stringify({
              type: "SEAT_QR",
              busId: bus.id,
              seatId: seatNumber,
              busNumber: bus.busNumber,
            });

            return (
              <div 
                key={seatNumber}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 flex flex-col items-center text-center shadow-sm print:shadow-none print:border-gray-300 print:rounded-lg print:break-inside-avoid"
              >
                <div className="w-full flex justify-between items-center mb-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {bus.busNumber}
                  </span>
                  <span className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-black px-2 py-0.5 rounded-md print:bg-gray-100 print:text-black">
                    Seat {seatNumber}
                  </span>
                </div>
                
                <div className="bg-white p-2 rounded-xl mb-3 print:p-0">
                  <QRCodeSVG
                    value={qrPayload}
                    size={100}
                    level="H"
                    className="w-full h-auto max-w-[120px]"
                  />
                </div>
                
                <p className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                  Scan with CampusFleet app to board
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
