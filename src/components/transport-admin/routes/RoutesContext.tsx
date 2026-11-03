"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { store } from "@/lib/store";
import { Route, Stop, Bus, Campus, Trip, Student, RestZone } from "@/lib/types";

interface RoutesContextValue {
  routes: Route[];
  stops: Stop[];
  buses: Bus[];
  trips: Trip[];
  campuses: Campus[];
  students: Student[];
  restZones: RestZone[];
  selectedRouteId: string;
  setSelectedRouteId: (id: string) => void;
  showToast: (msg: string) => void;
}

const RoutesContext = createContext<RoutesContextValue | undefined>(undefined);

export function RoutesProvider({
  children,
  initialRoutes = [],
  initialStops = [],
  initialBuses = [],
  initialTrips = [],
  initialCampuses = [],
  initialStudents = [],
  initialRestZones = [],
}: {
  children: React.ReactNode;
  initialRoutes?: Route[];
  initialStops?: Stop[];
  initialBuses?: Bus[];
  initialTrips?: Trip[];
  initialCampuses?: Campus[];
  initialStudents?: Student[];
  initialRestZones?: RestZone[];
}) {
  const [routes, setRoutes] = useState<Route[]>(() => initialRoutes.length > 0 ? initialRoutes : store.getRoutes());
  const [stops, setStops] = useState<Stop[]>(() => initialStops.length > 0 ? initialStops : store.getStops());
  const [buses, setBuses] = useState<Bus[]>(() => initialBuses.length > 0 ? initialBuses : store.getBuses());
  const [trips, setTrips] = useState<Trip[]>(() => initialTrips.length > 0 ? initialTrips : store.getTrips());
  const [campuses, setCampuses] = useState<Campus[]>(() => initialCampuses.length > 0 ? initialCampuses : store.getCampuses());
  const [students, setStudents] = useState<Student[]>(() => initialStudents.length > 0 ? initialStudents : store.getStudents());
  const [restZones, setRestZones] = useState<RestZone[]>(initialRestZones);

  const [selectedRouteId, setSelectedRouteId] = useState(routes[0]?.id || "");

  useEffect(() => {
    // If initialRestZones was empty, fetch from database API
    if (restZones.length === 0) {
      fetch("/api/rest-zones")
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.restZones)) {
            setRestZones(data.restZones);
          }
        })
        .catch((err) => console.warn("Failed to load rest zones from DB:", err));
    }
  }, []);

  useEffect(() => {
    const unsub = store.subscribe(() => {
      const r = store.getRoutes();
      setRoutes(r);
      setStops(store.getStops());
      setCampuses(store.getCampuses());
      setBuses(store.getBuses());
      setTrips(store.getTrips());
      setStudents(store.getStudents());
      if (!selectedRouteId && r.length > 0) {
        setSelectedRouteId(r[0].id);
      }
    });
    return unsub;
  }, [selectedRouteId]);

  const showToast = (msg: string) => {
    if (typeof window !== "undefined") {
      alert(msg); // Placeholder for a proper toast if needed
    }
  };

  return (
    <RoutesContext.Provider
      value={{
        routes,
        stops,
        buses,
        trips,
        campuses,
        students,
        restZones,
        selectedRouteId,
        setSelectedRouteId,
        showToast,
      }}
    >
      {children}
    </RoutesContext.Provider>
  );
}

export function useRoutesContext() {
  const context = useContext(RoutesContext);
  if (context === undefined) {
    throw new Error("useRoutesContext must be used within a RoutesProvider");
  }
  return context;
}
