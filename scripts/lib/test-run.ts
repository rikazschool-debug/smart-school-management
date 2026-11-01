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

  /** Remove an organization created by this run, with all school data. Refuses unless every school
   *  of the org was registered by this run. Repeats passes because triggers can re-create derived rows. */
  async purgeOrg(orgId: string) {
    const { data: ss } = await this.admin.from("schools").select("id").eq("org_id", orgId);
    const ids = (ss ?? []).map((x) => x.id as string);
    const foreign = ids.filter((id) => !this.schools.has(id));
    if (foreign.length) throw new Error(`[${this.label} ${this.id}] refusing purge of org ${orgId}: schools not created by this run: ${foreign.join(",")}`);
    const bySchool = ["homework", "files", "post_comments", "classroom_posts", "substitutions", "teacher_absences", "timetable_slots", "timetables", "teacher_unavailability", "supervisor_teachers", "rooms", "periods", "school_day_settings", "file_policies",
      "circulars", "comm_settings", "classrooms", "enrollments", "student_guardians", "teacher_assignments", "courses", "students", "guardians", "teachers", "subjects", "departments", "sections", "grades", "stages", "terms", "academic_years"];
    let last = "";
    for (let pass = 0; pass < 3; pass++) {
      for (const t of ["comm_audit", "message_reports", "conversations", "account_requests", "access_audit", "invitations"]) await this.admin.from(t).delete().eq("org_id", orgId);
      for (const id of ids) for (const t of bySchool) await this.admin.from(t).delete().eq("school_id", id);
      await this.admin.from("memberships").delete().eq("org_id", orgId);
      const r = await this.admin.from("schools").delete().eq("org_id", orgId);
      const o = r.error ? r : await this.admin.from("organizations").delete().eq("id", orgId);
      if (!o.error) { last = ""; break; }
      last = o.error.details ?? o.error.message;
    }
    if (last) console.log(`[cleanup ${this.label} ${this.id}] org ${orgId} not fully removed: ${last}`);
    return !last;
  }
}
