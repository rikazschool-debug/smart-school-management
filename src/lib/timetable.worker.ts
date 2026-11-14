/// <reference lib="webworker" />
// Runs the solver off the main thread so the page never freezes; the page cancels by terminating the worker.
import { solve, type SolveOptions } from "./timetable-solver";
import type { TTInput } from "./timetable-model";

self.onmessage = (e: MessageEvent<{ input: TTInput; opt: Omit<SolveOptions, "onProgress"> }>) => {
  try {
    const res = solve(e.data.input, { ...e.data.opt, onProgress: (p) => (self as unknown as Worker).postMessage({ type: "progress", ...p }) });
    (self as unknown as Worker).postMessage({ type: "result", res });
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: String((err as Error)?.message ?? err) });
  }
};
