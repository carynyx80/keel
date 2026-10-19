"use client";
/**
 * Live telemetry written by the 3D scene every frame and read by HUD instruments.
 * Kept outside React so the canvas never re-renders the overlay.
 */
export const scope = {
  bearing: 0, // camera azimuth, degrees 0..360
  pitch: 0, // camera elevation, degrees
  range: 0, // camera distance
  sweep: 0, // sonar sweep angle, radians
  dronesOut: 0,
};

/** Agent drones: one per active reader/planner, flying from the bridge to the file it reads. */
export interface Drone {
  id: string;
  target: string | null; // node id
  role: string;
  born: number;
  done: number | null;
}
export const drones = new Map<string, Drone>();

export function launchDrone(id: string, role: string, target: string | null) {
  drones.set(id, { id, role, target, born: performance.now(), done: null });
}
export function recallDrone(id: string) {
  const d = drones.get(id);
  if (d && d.done === null) d.done = performance.now();
}
export function clearDrones() {
  drones.clear();
}
