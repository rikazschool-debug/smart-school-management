// Scoped cleanup for test runs. Every test run gets a unique id and records
// the users and schools it created. Cleanup deletes notifications/messages only
// when they belong to a recorded user AND a recorded school, prints what it will
// delete first, and aborts if anything in the run's schools belongs to someone
// outside the run (a real user or another run). Never delete by school alone.
import type { SupabaseClient } from "@supabase/supabase-js";

export class TestRun {
  readonly id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  readonly users = new Set<string>();
  readonly schools = new Set<string>();
  constructor(private admin: SupabaseClient, readonly label: string) {}
  addUser(id: string) { this.users.add(id); }
  addSchool(id: string) { this.schools.add(id); }

  /** Rows in the run's schools whose user is not part of this run. */
  async foreignNotifications() {
    if (!this.schools.size) return [];
    const { data, error } = await this.admin.from("notifications").select("id,user_id,school_id").in("school_id", [...this.schools]);
    if (error) throw error;
    return (data ?? []).filter((n) => !this.users.has(n.user_id));
  }

  /** Delete this run's notifications; throws (deletes nothing) if the scope would leak. */
  async deleteNotifications(opts: { allowForeign?: false } = {}) {
    const foreign = await this.foreignNotifications();
    if (foreign.length && opts.allowForeign !== false) {
      throw new Error(`[${this.label} ${this.id}] refusing cleanup: ${foreign.length} notification(s) in run schools belong to users outside the run: ${foreign.slice(0, 5).map((f) => f.id).join(",")}`);
    }
    if (!this.users.size) return 0;
    let q = this.admin.from("notifications").select("id").in("user_id", [...this.users]);
    const { data, error } = await q;
    if (error) throw error;
    // only rows of run users that are in run schools or have no school (personal)
    const all = await this.admin.from("notifications").select("id,school_id").in("id", (data ?? []).map((d) => d.id));
    const ids = (all.data ?? []).filter((n) => n.school_id === null || this.schools.has(n.school_id)).map((n) => n.id);
    console.log(`[cleanup ${this.label} ${this.id}] notifications to delete: ${ids.length}`, ids.slice(0, 10).join(","));
    if (ids.length) {
      const d = await this.admin.from("notifications").delete().in("id", ids);
      if (d.error) throw d.error;
    }
    return ids.length;
  }
}
