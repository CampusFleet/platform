// @ts-nocheck

import React, { useState, useMemo } from 'react';
import {
  GitBranch, MapPin, Building2, Search, ArrowUp, ArrowDown, X, RotateCcw,
  Route as RouteIcon, Info, ChevronRight, BusFront, Calendar as CalendarIcon,
  Hash, Map as MapIcon, Users, Sliders, Check, Plus, Trash2
} from 'lucide-react';
import { Route, Stop, Campus } from '@/lib/types';
import dynamic from 'next/dynamic';
import { CustomDropdown } from '@/components/common/CustomDropdown';

const CampusFleetMap = dynamic(() => import('@/components/maps/CampusFleetMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-80 rounded-3xl bg-gray-100 dark:bg-gray-800 animate-pulse flex items-center justify-center text-xs text-gray-400 font-bold">
      Loading Corridor GIS Map...
    </div>
  ),
});

export function RouteBuilderModal({
  isRouteBuilderOpen,
  setIsRouteBuilderOpen,
  editingRouteId,
  routeBuilderData,
  setRouteBuilderData,
  insertingAtGapIndex,
  setInsertingAtGapIndex,
  stopPickerSearch,
  setStopPickerSearch,
  activePickerTarget,
  setActivePickerTarget,
  stops,
  campuses,
  handleReverseRoute,
  handleInsertIntermediateStop,
  handleShiftIntermediateUp,
  handleShiftIntermediateDown,
  handleRemoveIntermediateStop,
  handleSaveRoute,
  handleSaveRouteFromBuilder,
  builderStops,
  builderOrderedStopIds,
  builderMetrics,
  asModal = false,
}: any) {
  const saveAction = handleSaveRouteFromBuilder || handleSaveRoute;

  const filteredAvailableStops = stops.filter(
    (s: any) =>
      !routeBuilderData.intermediateStopIds.includes(s.id) &&
      s.id !== routeBuilderData.startStopId &&
      s.id !== routeBuilderData.endStopId &&
      s.name.toLowerCase().includes(stopPickerSearch.toLowerCase())
  );

  if (!isRouteBuilderOpen) return null;

  const content = (
    <div
      className={`w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 flex flex-col justify-between text-gray-900 dark:text-white shadow-2xl overflow-hidden animate-in fade-in ${
        asModal ? "max-h-[92vh]" : ""
      }`}
      style={{ height: asModal ? "min(92vh, 880px)" : "calc(100vh - 120px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
            <GitBranch className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-black text-lg text-gray-900 dark:text-white">
              {editingRouteId ? `Edit Corridor: ${routeBuilderData.name || "Transit Route"}` : "Interactive Route Flowchart Builder"}
            </h3>
            <p className="text-xs text-gray-400">
              Connect origin and destination anchors, insert intermediate stops via flowchart nodes, and verify road geometry
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReverseRoute}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
            title="Invert origin and destination"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
            <span>Reverse Direction</span>
          </button>

          <button
            onClick={() => setIsRouteBuilderOpen(false)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

          {/* Middle Grid: Left side Flowchart, Right side Realtime Map Preview */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-4 flex-1 overflow-hidden min-h-0">
            {/* Left 6 Cols: Flowchart Pipeline */}
            <div className="lg:col-span-6 flex flex-col h-full overflow-hidden space-y-4 min-h-0">
              {/* Route Basic Info Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 text-xs flex-shrink-0">
                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400">Route Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Express Inbound"
                    value={routeBuilderData.name}
                    onChange={e => setRouteBuilderData({ ...routeBuilderData, name: e.target.value })}
                    className="w-full p-1.5 mt-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400">Code</label>
                  <input
                    type="text"
                    required
                    placeholder="RT-105"
                    value={routeBuilderData.code}
                    onChange={e => setRouteBuilderData({ ...routeBuilderData, code: e.target.value })}
                    className="w-full p-1.5 mt-0.5 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 font-mono font-bold outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase text-gray-400">Direction</label>
                  <CustomDropdown
                    value={routeBuilderData.direction}
                    onChange={val => {
                      const newDir = val as any;
                      setRouteBuilderData((prev: any) => {
                        const primary = campuses.find((c: any) => c.isPrimary) || campuses[0];
                        const nonCampusStops = stops;
                        let startId = prev.startStopId;
                        let endId = prev.endStopId;
                        let origCampId = prev.originCampusId;
                        let destCampId = prev.destinationCampusId;

                        if (newDir === "HOME_TO_CAMPUS") {
                          // Destination must be a campus terminal
                          destCampId = destCampId || primary?.id || campuses[0]?.id || "";
                          endId = destCampId;
                          origCampId = undefined;
                          // If start was a campus, reset to first stop
                          if (campuses.some(c => c.id === startId)) {
                            startId = nonCampusStops[0]?.id || "";
                          }
                        } else if (newDir === "CAMPUS_TO_HOME") {
                          // Origin must be a campus terminal
                          origCampId = origCampId || primary?.id || campuses[0]?.id || "";
                          startId = origCampId;
                          destCampId = undefined;
                          // If end was a campus, reset to first stop
                          if (campuses.some(c => c.id === endId)) {
                            endId = nonCampusStops[nonCampusStops.length - 1]?.id || nonCampusStops[0]?.id || "";
                          }
                        } else if (newDir === "CAMPUS_TO_CAMPUS") {
                          origCampId = origCampId || primary?.id || campuses[0]?.id || "";
                          startId = origCampId;
                          const otherCampus = campuses.find(c => c.id !== origCampId) || primary || campuses[0];
                          destCampId = otherCampus?.id || "";
                          endId = destCampId;
                        }

                        return {
                          ...prev,
                          direction: newDir,
                          startStopId: startId,
                          endStopId: endId,
                          originCampusId: origCampId,
                          destinationCampusId: destCampId,
                        };
                      });
                    }}
                    options={[
                      { value: "HOME_TO_CAMPUS", label: "HOME_TO_CAMPUS (Inbound)" },
                      { value: "CAMPUS_TO_HOME", label: "CAMPUS_TO_HOME (Outbound)" },
                      { value: "CAMPUS_TO_CAMPUS", label: "CAMPUS_TO_CAMPUS (Inter-Campus)" },
                      { value: "CIRCULAR", label: "CIRCULAR (Loop)" },
                    ]}
                  />
                </div>
              </div>

              {/* Flowchart Station Nodes List */}
              <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                {/* --- 1. START STOP (ANCHOR 1) --- */}
                {(() => {
                  const isOriginCampus = routeBuilderData.direction === "CAMPUS_TO_HOME" || routeBuilderData.direction === "CAMPUS_TO_CAMPUS";
                  const originCampusObj = campuses.find(c => c.id === routeBuilderData.startStopId || c.id === routeBuilderData.originCampusId);
                  const originStopObj = stops.find(s => s.id === routeBuilderData.startStopId);
                  const displayName = isOriginCampus
                    ? originCampusObj?.name || "Select Origin Campus"
                    : originStopObj?.name || "Select Starting Point";

                  return (
                    <div className="p-3.5 rounded-2xl bg-green-50 dark:bg-green-950/30 border-2 border-green-500/50 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-green-600 text-white font-bold text-xs flex items-center justify-center">
                            {isOriginCampus ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                          </span>
                          <div>
                            <span className="text-[10px] font-black tracking-wider uppercase text-green-700 dark:text-green-400 block">
                              {isOriginCampus ? "Origin Campus Terminal (Departure)" : "Start Stop (Origin Passenger Pickup)"}
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {displayName}
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-950 px-2 py-0.5 rounded-md">
                          0.0 km • 0 min
                        </span>
                      </div>

                      {/* Start Stop Selector (Campuses if Outbound/Inter-Campus, regular stops if Inbound) */}
                      {isOriginCampus ? (
                        <CustomDropdown
                          value={routeBuilderData.startStopId}
                          onChange={val => {
                            setRouteBuilderData(prev => ({
                              ...prev,
                              startStopId: val,
                              originCampusId: val,
                            }));
                          }}
                          placeholder="-- Choose Origin Campus Terminal --"
                          options={[
                            { value: "", label: "-- Choose Origin Campus Terminal --" },
                            ...campuses.map(c => ({
                              value: c.id,
                              label: `${c.name} (${c.code})${c.isPrimary ? " ★ Primary Campus" : ""} ${c.city ? `• ${c.city}` : ""}`,
                            })),
                          ]}
                        />
                      ) : (
                        <CustomDropdown
                          value={routeBuilderData.startStopId}
                          onChange={val => {
                            setRouteBuilderData(prev => ({
                              ...prev,
                              startStopId: val,
                              originCampusId: undefined,
                            }));
                          }}
                          placeholder="-- Choose Origin Passenger Station --"
                          options={[
                            { value: "", label: "-- Choose Origin Passenger Station --" },
                            ...stops.map(st => ({
                              value: st.id,
                              label: `${st.name} (${st.code}) ${st.landmark ? `• ${st.landmark}` : ""}`,
                            })),
                          ]}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* --- CONNECTOR GAP 0 with (+) BUTTON --- */}
                <div className="relative py-1 flex items-center justify-center">
                  <div className="absolute inset-x-12 h-0.5 bg-green-400" />
                  <button
                    type="button"
                    onClick={() => setInsertingAtGapIndex(0)}
                    className="relative z-10 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-full shadow-md flex items-center gap-1.5 transition-all hover:scale-105"
                    title="Insert intermediate stop here"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insert Stop</span>
                  </button>
                </div>

                {/* Popover to insert stop at Gap 0 */}
                {insertingAtGapIndex === 0 && (
                  <div className="p-3 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-2xl shadow-xl space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-blue-600 dark:text-blue-400">Select Stop to Insert Between Origin & Next Stop:</span>
                      <button onClick={() => setInsertingAtGapIndex(null)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search available stops..."
                        value={stopPickerSearch}
                        onChange={e => setStopPickerSearch(e.target.value)}
                        className="w-full pl-8 p-1.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {filteredAvailableStops.length > 0 ? (
                        filteredAvailableStops.map(st => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleInsertIntermediateStop(st.id)}
                            className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl text-xs font-bold flex items-center justify-between transition-colors"
                          >
                            <span>{st.name} <span className="font-mono text-gray-400 font-normal">({st.code})</span></span>
                            <span className="text-[10px] text-blue-600">+ Insert</span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-center text-xs text-gray-400">
                          No matching or unselected stops available.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* --- 2. INTERMEDIATE STOPS (IF ANY) --- */}
                {routeBuilderData.intermediateStopIds.map((stopId, iIdx) => {
                  const stopObj = stops.find(s => s.id === stopId);
                  const stopIndexInRoute = iIdx + 1;
                  const offset = builderMetrics.stopOffsets[stopIndexInRoute] || stopIndexInRoute * 8;
                  const gapIndexAfter = iIdx + 1;

                  return (
                    <React.Fragment key={stopId}>
                      {/* Intermediate Node Card */}
                      <div className="p-3 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 shadow-sm space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                              {stopIndexInRoute + 1}
                            </span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-gray-900 dark:text-white">
                                  {stopObj?.name || "Intermediate Station"}
                                </span>
                                <span className="text-[10px] font-mono text-gray-400">({stopObj?.code})</span>
                              </div>
                              <span className="text-[10px] text-gray-400">{stopObj?.landmark || "Transit Point"}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                              +{offset}m
                            </span>

                            {/* Shift Up/Down & Delete */}
                            <div className="flex items-center gap-0.5 ml-1">
                              <button
                                type="button"
                                disabled={iIdx === 0}
                                onClick={() => handleShiftIntermediateUp(iIdx)}
                                className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                title="Shift earlier in corridor"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={iIdx === routeBuilderData.intermediateStopIds.length - 1}
                                onClick={() => handleShiftIntermediateDown(iIdx)}
                                className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-20 text-gray-600 dark:text-gray-300"
                                title="Shift later in corridor"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveIntermediate(iIdx)}
                                className="p-1 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 text-red-600"
                                title="Remove from this route"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CONNECTOR GAP with (+) BUTTON */}
                      <div className="relative py-1 flex items-center justify-center">
                        <div className="absolute inset-x-12 h-0.5 bg-blue-400" />
                        <button
                          type="button"
                          onClick={() => setInsertingAtGapIndex(gapIndexAfter)}
                          className="relative z-10 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-full shadow-md flex items-center gap-1.5 transition-all hover:scale-105"
                          title="Insert intermediate stop here"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Insert Stop</span>
                        </button>
                      </div>

                      {/* Popover to insert stop at this gap */}
                      {insertingAtGapIndex === gapIndexAfter && (
                        <div className="p-3 bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-2xl shadow-xl space-y-2 animate-in fade-in">
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-blue-600 dark:text-blue-400">Select Stop to Insert:</span>
                            <button onClick={() => setInsertingAtGapIndex(null)} className="text-gray-400 hover:text-gray-600">
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
                            <input
                              type="text"
                              placeholder="Search available stops..."
                              value={stopPickerSearch}
                              onChange={e => setStopPickerSearch(e.target.value)}
                              className="w-full pl-8 p-1.5 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs font-bold outline-none"
                              autoFocus
                            />
                          </div>

                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {filteredAvailableStops.length > 0 ? (
                              filteredAvailableStops.map(st => (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() => handleInsertIntermediateStop(st.id)}
                                  className="w-full text-left p-2 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl text-xs font-bold flex items-center justify-between transition-colors"
                                >
                                  <span>{st.name} <span className="font-mono text-gray-400 font-normal">({st.code})</span></span>
                                  <span className="text-[10px] text-blue-600">+ Insert</span>
                                </button>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-gray-400">
                                No matching unselected stops available.
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* --- 3. END STOP (ANCHOR 2) --- */}
                {(() => {
                  const isDestCampus = routeBuilderData.direction === "HOME_TO_CAMPUS" || routeBuilderData.direction === "CAMPUS_TO_CAMPUS";
                  const destCampusObj = campuses.find(c => c.id === routeBuilderData.endStopId || c.id === routeBuilderData.destinationCampusId);
                  const destStopObj = stops.find(s => s.id === routeBuilderData.endStopId);
                  const displayName = isDestCampus
                    ? destCampusObj?.name || "Select Destination Campus"
                    : destStopObj?.name || "Select Final Drop-off Station";

                  return (
                    <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border-2 border-blue-500/50 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center">
                            {isDestCampus ? <Building2 className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}
                          </span>
                          <div>
                            <span className="text-[10px] font-black tracking-wider uppercase text-blue-700 dark:text-blue-400 block">
                              {isDestCampus ? "Destination Campus Terminal (Arrival)" : "Final Drop-off Stop (Terminal Station)"}
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {displayName}
                            </span>
                          </div>
                        </div>

                        <span className="text-[11px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950 px-2 py-0.5 rounded-md">
                          {builderMetrics.totalDistanceKm} km • ~{builderMetrics.estimatedDurationMins} min
                        </span>
                      </div>

                      {/* End Stop Selector (Campuses if Inbound/Inter-Campus, regular stops if Outbound) */}
                      {isDestCampus ? (
                        <CustomDropdown
                          value={routeBuilderData.endStopId}
                          onChange={val => {
                            setRouteBuilderData(prev => ({
                              ...prev,
                              endStopId: val,
                              destinationCampusId: val,
                            }));
                          }}
                          placeholder="-- Choose Destination Campus Terminal --"
                          options={[
                            { value: "", label: "-- Choose Destination Campus Terminal --" },
                            ...campuses.map(c => ({
                              value: c.id,
                              label: `${c.name} (${c.code})${c.isPrimary ? " ★ Primary Campus" : ""} ${c.city ? `• ${c.city}` : ""}`,
                            })),
                          ]}
                        />
                      ) : (
                        <CustomDropdown
                          value={routeBuilderData.endStopId}
                          onChange={val => {
                            setRouteBuilderData(prev => ({
                              ...prev,
                              endStopId: val,
                              destinationCampusId: undefined,
                            }));
                          }}
                          placeholder="-- Choose Final Drop-off Station --"
                          options={[
                            { value: "", label: "-- Choose Final Drop-off Station --" },
                            ...stops.map(st => ({
                              value: st.id,
                              label: `${st.name} (${st.code}) ${st.landmark ? `• ${st.landmark}` : ""}`,
                            })),
                          ]}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Right 6 Cols: Synchronized Live Road-Snapped Corridor Map Preview */}
            <div className="lg:col-span-6 flex flex-col h-full space-y-3 min-h-0">
              <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 px-4 py-2.5 rounded-2xl text-xs flex-shrink-0">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <span className="font-bold text-gray-700 dark:text-gray-300">Live Road Geometry & Stop Numbers</span>
                </div>
                <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                  {builderStops.length} stops linked
                </span>
              </div>

              <div className="flex-1 rounded-3xl overflow-hidden border border-gray-200 dark:border-gray-800 min-h-[360px] h-full relative flex flex-col">
                <CampusFleetMap
                  stops={builderStops}
                  campuses={campuses}
                  routeCoordinates={builderStops.map(s => [s.latitude, s.longitude])}
                  height="100%"
                />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs p-3 bg-gray-50 dark:bg-gray-800/40 rounded-2xl border border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div>
                  <span className="text-[10px] uppercase text-gray-400 font-bold block">Total Distance</span>
                  <span className="font-black text-sm text-gray-900 dark:text-white font-mono">
                    {builderMetrics.totalDistanceKm} km
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-400 font-bold block">Est. Trip Duration</span>
                  <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono">
                    ~{builderMetrics.estimatedDurationMins} mins
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-gray-400 font-bold block">Intermediate Stops</span>
                  <span className="font-black text-sm text-blue-600 dark:text-blue-400 font-mono">
                    {routeBuilderData.intermediateStopIds.length}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-medium hidden sm:inline">
                Corridor color badge:
              </span>
              <div className="flex items-center gap-1.5">
                {["#2563EB", "#059669", "#7C3AED", "#EA580C", "#E11D48", "#0891B2"].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRouteBuilderData({ ...routeBuilderData, color: c })}
                    className={`w-5 h-5 rounded-full transition-transform ${routeBuilderData.color === c ? "scale-125 ring-2 ring-white shadow" : "opacity-70 hover:opacity-100"
                      }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsRouteBuilderOpen(false)}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold rounded-xl transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveAction}
                disabled={builderStops.length < 2}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all hover:scale-102"
              >
                <Check className="w-4 h-4" />
                <span>{editingRouteId ? "Save Corridor Changes" : "Deploy Corridor Route"}</span>
              </button>
            </div>
          </div>
    </div>
  );

  if (asModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in overflow-y-auto">
        <div className="w-full max-w-7xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
}
