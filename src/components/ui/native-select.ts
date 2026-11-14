import { cn } from "@/lib/utils";

/** One look for every native <select> in Rikaz (same height/border/focus ring as <Input>). */
export const SELECT = "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
/** Compact variant for filter bars. */
export const SELECT_SM = "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
export const selectCls = (extra?: string, small = false) => cn(small ? SELECT_SM : SELECT, extra);
