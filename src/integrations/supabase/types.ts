export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_current: boolean
          name: string
          school_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_current?: boolean
          name: string
          school_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_current?: boolean
          name?: string
          school_id?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      access_audit: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          org_id: string
          reason: string | null
          school_id: string | null
          target_invitation: string | null
          target_membership: string | null
          target_user: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          org_id: string
          reason?: string | null
          school_id?: string | null
          target_invitation?: string | null
          target_membership?: string | null
          target_user?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          org_id?: string
          reason?: string | null
          school_id?: string | null
          target_invitation?: string | null
          target_membership?: string | null
          target_user?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_audit_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      account_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          full_name: string | null
          id: string
          invitation_id: string | null
          kind: string
          note: string | null
          org_id: string
          record_id: string
          requested_by: string
          school_id: string
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          invitation_id?: string | null
          kind: string
          note?: string | null
          org_id: string
          record_id: string
          requested_by: string
          school_id: string
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invitation_id?: string | null
          kind?: string
          note?: string | null
          org_id?: string
          record_id?: string
          requested_by?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_requests_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_decisions: {
        Row: {
          assignee: string
          body: string
          client_id: string | null
          created_at: string
          created_by: string
          due_date: string
          id: string
          meeting_id: string
          minutes_id: string | null
          priority: string
          school_id: string
          task_id: string
        }
        Insert: {
          assignee: string
          body: string
          client_id?: string | null
          created_at?: string
          created_by?: string
          due_date: string
          id?: string
          meeting_id: string
          minutes_id?: string | null
          priority?: string
          school_id: string
          task_id: string
        }
        Update: {
          assignee?: string
          body?: string
          client_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string
          id?: string
          meeting_id?: string
          minutes_id?: string | null
          priority?: string
          school_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_decisions_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "adm_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_decisions_minutes_id_fkey"
            columns: ["minutes_id"]
            isOneToOne: false
            referencedRelation: "adm_minutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_decisions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_decisions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "adm_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_assignments: {
        Row: {
          ack_at: string | null
          cancel_reason: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          date: string
          end_time: string
          exec_at: string | null
          exec_note: string | null
          exec_status: string
          id: string
          post_id: string
          rev: number
          roster_id: string
          school_id: string
          source: string
          start_time: string
          status: string
          substitute_for: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ack_at?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          end_time: string
          exec_at?: string | null
          exec_note?: string | null
          exec_status?: string
          id?: string
          post_id: string
          rev?: number
          roster_id: string
          school_id: string
          source?: string
          start_time: string
          status?: string
          substitute_for?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ack_at?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          end_time?: string
          exec_at?: string | null
          exec_note?: string | null
          exec_status?: string
          id?: string
          post_id?: string
          rev?: number
          roster_id?: string
          school_id?: string
          source?: string
          start_time?: string
          status?: string
          substitute_for?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_assignments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "adm_duty_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_duty_assignments_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "adm_duty_rosters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_duty_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_duty_assignments_substitute_for_fkey"
            columns: ["substitute_for"]
            isOneToOne: false
            referencedRelation: "adm_duty_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_changes: {
        Row: {
          assignment_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          kind: string
          reason: string
          school_id: string
          status: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind: string
          reason: string
          school_id: string
          status?: string
          user_id?: string
        }
        Update: {
          assignment_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          kind?: string
          reason?: string
          school_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_changes_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "adm_duty_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_duty_changes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_exempt: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string
          school_id: string
          until: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason: string
          school_id: string
          until?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string
          school_id?: string
          until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_exempt_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_posts: {
        Row: {
          active: boolean
          created_at: string
          days: number[]
          eligible_roles: string[]
          end_time: string
          id: string
          kind: string
          name: string
          required: number
          school_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days?: number[]
          eligible_roles?: string[]
          end_time: string
          id?: string
          kind?: string
          name: string
          required?: number
          school_id: string
          start_time: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days?: number[]
          eligible_roles?: string[]
          end_time?: string
          id?: string
          kind?: string
          name?: string
          required?: number
          school_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_posts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_rosters: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string | null
          id: string
          published_at: string | null
          published_by: string | null
          report: Json
          rev: number
          school_id: string
          status: string
          updated_at: string
          version: number
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          report?: Json
          rev?: number
          school_id: string
          status?: string
          updated_at?: string
          version?: number
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          report?: Json
          rev?: number
          school_id?: string
          status?: string
          updated_at?: string
          version?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_rosters_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_settings: {
        Row: {
          load_weeks: number
          max_per_week: number
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          load_weeks?: number
          max_per_week?: number
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          load_weeks?: number
          max_per_week?: number
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_duty_snapshots: {
        Row: {
          data: Json
          published_at: string
          published_by: string | null
          roster_id: string
          version: number
        }
        Insert: {
          data: Json
          published_at?: string
          published_by?: string | null
          roster_id: string
          version: number
        }
        Update: {
          data?: Json
          published_at?: string
          published_by?: string | null
          roster_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "adm_duty_snapshots_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "adm_duty_rosters"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_events: {
        Row: {
          action: string
          actor: string | null
          client_id: string | null
          created_at: string
          details: Json
          entity: string
          entity_id: string
          id: string
          school_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          entity: string
          entity_id: string
          id?: string
          school_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          client_id?: string | null
          created_at?: string
          details?: Json
          entity?: string
          entity_id?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_forms: {
        Row: {
          allow_files: boolean
          audience: string[]
          created_at: string
          created_by: string
          description: string | null
          fields: Json
          handler_user: string
          id: string
          name: string
          purpose: string | null
          root_id: string
          school_id: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          allow_files?: boolean
          audience?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          fields?: Json
          handler_user: string
          id?: string
          name: string
          purpose?: string | null
          root_id: string
          school_id: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          allow_files?: boolean
          audience?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          fields?: Json
          handler_user?: string
          id?: string
          name?: string
          purpose?: string | null
          root_id?: string
          school_id?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "adm_forms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_meeting_members: {
        Row: {
          attendance_note: string | null
          attended: boolean | null
          ban_rule: string | null
          banned: boolean
          can_share: boolean
          hand_at: string | null
          host_muted: boolean
          marked_at: string | null
          marked_by: string | null
          meeting_id: string
          mic_req_at: string | null
          mute_rule: string | null
          rsvp: string
          rsvp_at: string | null
          rsvp_note: string | null
          school_id: string | null
          share_req_at: string | null
          user_id: string
        }
        Insert: {
          attendance_note?: string | null
          attended?: boolean | null
          ban_rule?: string | null
          banned?: boolean
          can_share?: boolean
          hand_at?: string | null
          host_muted?: boolean
          marked_at?: string | null
          marked_by?: string | null
          meeting_id: string
          mic_req_at?: string | null
          mute_rule?: string | null
          rsvp?: string
          rsvp_at?: string | null
          rsvp_note?: string | null
          school_id?: string | null
          share_req_at?: string | null
          user_id: string
        }
        Update: {
          attendance_note?: string | null
          attended?: boolean | null
          ban_rule?: string | null
          banned?: boolean
          can_share?: boolean
          hand_at?: string | null
          host_muted?: boolean
          marked_at?: string | null
          marked_by?: string | null
          meeting_id?: string
          mic_req_at?: string | null
          mute_rule?: string | null
          rsvp?: string
          rsvp_at?: string | null
          rsvp_note?: string | null
          school_id?: string | null
          share_req_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_meeting_members_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "adm_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_meeting_members_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_meeting_presence: {
        Row: {
          first_joined_at: string
          joins: number
          last_seen_at: string
          left_at: string | null
          meeting_id: string
          uid: number
          user_id: string
        }
        Insert: {
          first_joined_at?: string
          joins?: number
          last_seen_at?: string
          left_at?: string | null
          meeting_id: string
          uid: number
          user_id: string
        }
        Update: {
          first_joined_at?: string
          joins?: number
          last_seen_at?: string
          left_at?: string | null
          meeting_id?: string
          uid?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_meeting_presence_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "adm_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_meeting_revocations: {
        Row: {
          attempts: number
          created_at: string
          done_at: string | null
          error: string | null
          id: string
          kind: string
          meeting_id: string
          rule_id: string | null
          uid: number | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          done_at?: string | null
          error?: string | null
          id?: string
          kind: string
          meeting_id: string
          rule_id?: string | null
          uid?: number | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          done_at?: string | null
          error?: string | null
          id?: string
          kind?: string
          meeting_id?: string
          rule_id?: string | null
          uid?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adm_meeting_revocations_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "adm_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_meetings: {
        Row: {
          agenda: string | null
          cancel_reason: string | null
          client_id: string | null
          created_at: string
          department_id: string | null
          duration_min: number
          id: string
          link: string | null
          live_ended_at: string | null
          live_started_at: string | null
          live_status: string
          location: string | null
          minutes_writer: string | null
          mode: string
          needs_rsvp: boolean
          org_id: string
          organizer: string
          privacy: string
          purpose: string | null
          rev: number
          school_id: string
          scope: string
          screen_sharer: string | null
          screen_since: string | null
          sent_at: string | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agenda?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          created_at?: string
          department_id?: string | null
          duration_min?: number
          id?: string
          link?: string | null
          live_ended_at?: string | null
          live_started_at?: string | null
          live_status?: string
          location?: string | null
          minutes_writer?: string | null
          mode?: string
          needs_rsvp?: boolean
          org_id: string
          organizer?: string
          privacy?: string
          purpose?: string | null
          rev?: number
          school_id: string
          scope?: string
          screen_sharer?: string | null
          screen_since?: string | null
          sent_at?: string | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agenda?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          created_at?: string
          department_id?: string | null
          duration_min?: number
          id?: string
          link?: string | null
          live_ended_at?: string | null
          live_started_at?: string | null
          live_status?: string
          location?: string | null
          minutes_writer?: string | null
          mode?: string
          needs_rsvp?: boolean
          org_id?: string
          organizer?: string
          privacy?: string
          purpose?: string | null
          rev?: number
          school_id?: string
          scope?: string
          screen_sharer?: string | null
          screen_since?: string | null
          sent_at?: string | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_meetings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_meetings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_minutes: {
        Row: {
          absent: string[]
          based_on: string | null
          change_note: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          meeting_id: string
          notes: string | null
          present: string[]
          rev: number
          saved_at: string
          school_id: string
          status: string
          topics: Json
          version: number
          written_by: string | null
        }
        Insert: {
          absent?: string[]
          based_on?: string | null
          change_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          meeting_id: string
          notes?: string | null
          present?: string[]
          rev?: number
          saved_at?: string
          school_id: string
          status?: string
          topics?: Json
          version: number
          written_by?: string | null
        }
        Update: {
          absent?: string[]
          based_on?: string | null
          change_note?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          meeting_id?: string
          notes?: string | null
          present?: string[]
          rev?: number
          saved_at?: string
          school_id?: string
          status?: string
          topics?: Json
          version?: number
          written_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "adm_minutes_based_on_fkey"
            columns: ["based_on"]
            isOneToOne: false
            referencedRelation: "adm_minutes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_minutes_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "adm_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_minutes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_requests: {
        Row: {
          answers: Json
          closed_at: string | null
          created_at: string
          fields: Json
          form_id: string
          form_name: string
          form_version: number
          handler_note: string | null
          handler_user: string
          id: string
          rev: number
          school_id: string
          status: string
          submitted_at: string | null
          submitted_by: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          closed_at?: string | null
          created_at?: string
          fields: Json
          form_id: string
          form_name: string
          form_version: number
          handler_note?: string | null
          handler_user: string
          id?: string
          rev?: number
          school_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          closed_at?: string | null
          created_at?: string
          fields?: Json
          form_id?: string
          form_name?: string
          form_version?: number
          handler_note?: string | null
          handler_user?: string
          id?: string
          rev?: number
          school_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_requests_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "adm_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      adm_tasks: {
        Row: {
          acknowledged_at: string | null
          assignee: string
          assigner: string
          blocked_at: string | null
          blocked_reason: string | null
          client_id: string | null
          created_at: string
          decision_id: string | null
          department_id: string | null
          description: string | null
          done_at: string | null
          due_date: string
          id: string
          needs_confirmation: boolean
          participants: string[]
          priority: string
          progress: number
          proof_required: string | null
          rev: number
          school_id: string
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          assignee: string
          assigner?: string
          blocked_at?: string | null
          blocked_reason?: string | null
          client_id?: string | null
          created_at?: string
          decision_id?: string | null
          department_id?: string | null
          description?: string | null
          done_at?: string | null
          due_date: string
          id?: string
          needs_confirmation?: boolean
          participants?: string[]
          priority?: string
          progress?: number
          proof_required?: string | null
          rev?: number
          school_id: string
          start_date?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          assignee?: string
          assigner?: string
          blocked_at?: string | null
          blocked_reason?: string | null
          client_id?: string | null
          created_at?: string
          decision_id?: string | null
          department_id?: string | null
          description?: string | null
          done_at?: string | null
          due_date?: string
          id?: string
          needs_confirmation?: boolean
          participants?: string[]
          priority?: string
          progress?: number
          proof_required?: string | null
          rev?: number
          school_id?: string
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "adm_tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adm_tasks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          day_id: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          new_late: number | null
          new_status: string
          old_late: number | null
          old_status: string
          reason: string
          requested_at: string
          requested_by: string
          school_id: string
          status: string
        }
        Insert: {
          day_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          new_late?: number | null
          new_status: string
          old_late?: number | null
          old_status: string
          reason: string
          requested_at?: string
          requested_by: string
          school_id: string
          status?: string
        }
        Update: {
          day_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          new_late?: number | null
          new_status?: string
          old_late?: number | null
          old_status?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "attendance_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_days: {
        Row: {
          created_at: string
          date: string
          escalated_at: string | null
          escalated_by: string | null
          escalation_note: string | null
          first_in_at: string | null
          id: string
          late_minutes: number
          note: string | null
          policy_id: string | null
          recorded_by: string | null
          school_id: string
          source: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          first_in_at?: string | null
          id?: string
          late_minutes?: number
          note?: string | null
          policy_id?: string | null
          recorded_by?: string | null
          school_id: string
          source: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          escalated_at?: string | null
          escalated_by?: string | null
          escalation_note?: string | null
          first_in_at?: string | null
          id?: string
          late_minutes?: number
          note?: string | null
          policy_id?: string | null
          recorded_by?: string | null
          school_id?: string
          source?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_days_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "attendance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_days_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_events: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: string
          reason: string | null
          school_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          reason?: string | null
          school_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          reason?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_policies: {
        Row: {
          absence_review_at: string
          approver_roles: Database["public"]["Enums"]["app_role"][]
          arrival_open: string
          call_point: string
          created_at: string
          created_by: string | null
          day_end: string
          day_start: string
          effective_from: string
          extra_days: string[]
          grace_minutes: number
          guardian_cancel_until: string
          holidays: string[]
          id: string
          late_from: string
          notify_arrival: boolean
          org_id: string
          principal_editable: string[]
          school_id: string | null
          study_days: number[]
          version: number
        }
        Insert: {
          absence_review_at?: string
          approver_roles?: Database["public"]["Enums"]["app_role"][]
          arrival_open?: string
          call_point?: string
          created_at?: string
          created_by?: string | null
          day_end?: string
          day_start?: string
          effective_from: string
          extra_days?: string[]
          grace_minutes?: number
          guardian_cancel_until?: string
          holidays?: string[]
          id?: string
          late_from?: string
          notify_arrival?: boolean
          org_id: string
          principal_editable?: string[]
          school_id?: string | null
          study_days?: number[]
          version?: number
        }
        Update: {
          absence_review_at?: string
          approver_roles?: Database["public"]["Enums"]["app_role"][]
          arrival_open?: string
          call_point?: string
          created_at?: string
          created_by?: string | null
          day_end?: string
          day_start?: string
          effective_from?: string
          extra_days?: string[]
          grace_minutes?: number
          guardian_cancel_until?: string
          holidays?: string[]
          id?: string
          late_from?: string
          notify_arrival?: boolean
          org_id?: string
          principal_editable?: string[]
          school_id?: string | null
          study_days?: number[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "attendance_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_tick_runs: {
        Row: {
          added: number
          attempts: number
          cutoff: string | null
          date: string
          error: string | null
          id: string
          ran_at: string
          removed: number
          school_id: string
          status: string
        }
        Insert: {
          added?: number
          attempts?: number
          cutoff?: string | null
          date: string
          error?: string | null
          id?: string
          ran_at?: string
          removed?: number
          school_id: string
          status: string
        }
        Update: {
          added?: number
          attempts?: number
          cutoff?: string | null
          date?: string
          error?: string | null
          id?: string
          ran_at?: string
          removed?: number
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_tick_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      authorized_pickups: {
        Row: {
          active: boolean
          added_by: string | null
          created_at: string
          full_name: string
          id: string
          national_id: string | null
          phone: string | null
          relationship: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          full_name: string
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          active?: boolean
          added_by?: string | null
          created_at?: string
          full_name?: string
          id?: string
          national_id?: string | null
          phone?: string | null
          relationship?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "authorized_pickups_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorized_pickups_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      call_queue: {
        Row: {
          announce: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          pickup_id: string
          played_at: string | null
          played_by: string | null
          school_id: string
          status: string
        }
        Insert: {
          announce: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          pickup_id: string
          played_at?: string | null
          played_by?: string | null
          school_id: string
          status?: string
        }
        Update: {
          announce?: string
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          pickup_id?: string
          played_at?: string | null
          played_by?: string | null
          school_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_queue_pickup_id_fkey"
            columns: ["pickup_id"]
            isOneToOne: true
            referencedRelation: "pickup_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_queue_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      circular_acks: {
        Row: {
          acked_at: string
          circular_id: string
          id: string
          user_id: string
          version: number
        }
        Insert: {
          acked_at?: string
          circular_id: string
          id?: string
          user_id: string
          version: number
        }
        Update: {
          acked_at?: string
          circular_id?: string
          id?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "circular_acks_circular_id_fkey"
            columns: ["circular_id"]
            isOneToOne: false
            referencedRelation: "circulars"
            referencedColumns: ["id"]
          },
        ]
      }
      circular_recipients: {
        Row: {
          ack_required_version: number | null
          added_at: string
          added_by: string | null
          added_reason: string
          circular_id: string
          first_version: number
          opened_at: string | null
          roles: string | null
          school_id: string | null
          user_id: string
        }
        Insert: {
          ack_required_version?: number | null
          added_at?: string
          added_by?: string | null
          added_reason?: string
          circular_id: string
          first_version: number
          opened_at?: string | null
          roles?: string | null
          school_id?: string | null
          user_id: string
        }
        Update: {
          ack_required_version?: number | null
          added_at?: string
          added_by?: string | null
          added_reason?: string
          circular_id?: string
          first_version?: number
          opened_at?: string | null
          roles?: string | null
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circular_recipients_circular_id_fkey"
            columns: ["circular_id"]
            isOneToOne: false
            referencedRelation: "circulars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circular_recipients_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      circular_versions: {
        Row: {
          ack_due: string | null
          audience: Json
          body: string
          circular_id: string
          id: string
          published_at: string
          published_by: string
          publisher_label: string | null
          requires_ack: boolean
          scope: string | null
          target_schools: string[] | null
          title: string
          version: number
        }
        Insert: {
          ack_due?: string | null
          audience: Json
          body: string
          circular_id: string
          id?: string
          published_at?: string
          published_by: string
          publisher_label?: string | null
          requires_ack: boolean
          scope?: string | null
          target_schools?: string[] | null
          title: string
          version: number
        }
        Update: {
          ack_due?: string | null
          audience?: Json
          body?: string
          circular_id?: string
          id?: string
          published_at?: string
          published_by?: string
          publisher_label?: string | null
          requires_ack?: boolean
          scope?: string | null
          target_schools?: string[] | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "circular_versions_circular_id_fkey"
            columns: ["circular_id"]
            isOneToOne: false
            referencedRelation: "circulars"
            referencedColumns: ["id"]
          },
        ]
      }
      circulars: {
        Row: {
          ack_due: string | null
          audience: Json
          body: string
          created_at: string
          created_by: string
          id: string
          org_id: string
          priority: string
          published_at: string | null
          publisher_label: string
          requires_ack: boolean
          school_id: string
          scope: string
          status: string
          target_schools: string[]
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          ack_due?: string | null
          audience?: Json
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          org_id: string
          priority?: string
          published_at?: string | null
          publisher_label?: string
          requires_ack?: boolean
          school_id: string
          scope?: string
          status?: string
          target_schools?: string[]
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          ack_due?: string | null
          audience?: Json
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          priority?: string
          published_at?: string | null
          publisher_label?: string
          requires_ack?: boolean
          school_id?: string
          scope?: string
          status?: string
          target_schools?: string[]
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "circulars_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circulars_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classroom_posts: {
        Row: {
          audience: string
          author_user_id: string
          body: string
          classroom_id: string
          comments_enabled: boolean
          created_at: string
          id: string
          pinned: boolean
          published_at: string | null
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_user_id?: string
          body?: string
          classroom_id: string
          comments_enabled?: boolean
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_user_id?: string
          body?: string
          classroom_id?: string
          comments_enabled?: boolean
          created_at?: string
          id?: string
          pinned?: boolean
          published_at?: string | null
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classroom_posts_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classroom_posts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classrooms: {
        Row: {
          course_id: string
          created_at: string
          id: string
          school_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          school_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          school_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classrooms_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classrooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanup_alerts: {
        Row: {
          channel: string
          details: Json
          id: string
          kind: string
          last_checked_at: string
          opened_at: string
          resolved_at: string | null
        }
        Insert: {
          channel?: string
          details?: Json
          id?: string
          kind: string
          last_checked_at?: string
          opened_at?: string
          resolved_at?: string | null
        }
        Update: {
          channel?: string
          details?: Json
          id?: string
          kind?: string
          last_checked_at?: string
          opened_at?: string
          resolved_at?: string | null
        }
        Relationships: []
      }
      comm_audit: {
        Row: {
          action: string
          actor: string | null
          circular_id: string | null
          conversation_id: string | null
          created_at: string
          details: Json
          id: string
          org_id: string
          school_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          circular_id?: string | null
          conversation_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          org_id: string
          school_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          circular_id?: string | null
          conversation_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          org_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comm_audit_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      comm_settings: {
        Row: {
          dept_head_groups: boolean
          edit_window_minutes: number
          family_admin_roles: Database["public"]["Enums"]["app_role"][]
          report_reviewer_roles: Database["public"]["Enums"]["app_role"][]
          school_id: string
          staff_direct_enabled: boolean
          updated_at: string
        }
        Insert: {
          dept_head_groups?: boolean
          edit_window_minutes?: number
          family_admin_roles?: Database["public"]["Enums"]["app_role"][]
          report_reviewer_roles?: Database["public"]["Enums"]["app_role"][]
          school_id: string
          staff_direct_enabled?: boolean
          updated_at?: string
        }
        Update: {
          dept_head_groups?: boolean
          edit_window_minutes?: number
          family_admin_roles?: Database["public"]["Enums"]["app_role"][]
          report_reviewer_roles?: Database["public"]["Enums"]["app_role"][]
          school_id?: string
          staff_direct_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comm_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          added_by: string | null
          archived: boolean
          conversation_id: string
          id: string
          joined_at: string
          last_read_seq: number
          left_at: string | null
          left_reason: string | null
          muted: boolean
          role: string
          source: string
          updated_at: string
          user_id: string
          visible_from: string
        }
        Insert: {
          added_by?: string | null
          archived?: boolean
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_seq?: number
          left_at?: string | null
          left_reason?: string | null
          muted?: boolean
          role?: string
          source?: string
          updated_at?: string
          user_id: string
          visible_from?: string
        }
        Update: {
          added_by?: string | null
          archived?: boolean
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_seq?: number
          left_at?: string | null
          left_reason?: string | null
          muted?: boolean
          role?: string
          source?: string
          updated_at?: string
          user_id?: string
          visible_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          allow_attachments: boolean
          allow_replies: boolean
          course_id: string | null
          created_at: string
          created_by: string
          dedupe_key: string | null
          department_id: string | null
          description: string | null
          expires_at: string | null
          group_type: string | null
          guardian_id: string | null
          history_policy: string
          id: string
          kind: string
          last_message_at: string | null
          last_seq: number
          membership_mode: string
          org_id: string
          post_policy: string
          school_id: string | null
          section_id: string | null
          staff_kind: string | null
          staff_user_id: string | null
          status: string
          student_id: string | null
          title: string
          updated_at: string
          year_id: string | null
        }
        Insert: {
          allow_attachments?: boolean
          allow_replies?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          department_id?: string | null
          description?: string | null
          expires_at?: string | null
          group_type?: string | null
          guardian_id?: string | null
          history_policy?: string
          id?: string
          kind: string
          last_message_at?: string | null
          last_seq?: number
          membership_mode?: string
          org_id: string
          post_policy?: string
          school_id?: string | null
          section_id?: string | null
          staff_kind?: string | null
          staff_user_id?: string | null
          status?: string
          student_id?: string | null
          title?: string
          updated_at?: string
          year_id?: string | null
        }
        Update: {
          allow_attachments?: boolean
          allow_replies?: boolean
          course_id?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          department_id?: string | null
          description?: string | null
          expires_at?: string | null
          group_type?: string | null
          guardian_id?: string | null
          history_policy?: string
          id?: string
          kind?: string
          last_message_at?: string | null
          last_seq?: number
          membership_mode?: string
          org_id?: string
          post_policy?: string
          school_id?: string | null
          section_id?: string | null
          staff_kind?: string | null
          staff_user_id?: string | null
          status?: string
          student_id?: string | null
          title?: string
          updated_at?: string
          year_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          created_at: string
          daily_max: number | null
          day_prefs: number[] | null
          id: string
          needs_double: boolean
          room_kind: string | null
          school_id: string
          section_id: string
          subject_id: string
          term_id: string | null
          updated_at: string
          weekly_periods: number
          year_id: string
        }
        Insert: {
          created_at?: string
          daily_max?: number | null
          day_prefs?: number[] | null
          id?: string
          needs_double?: boolean
          room_kind?: string | null
          school_id: string
          section_id: string
          subject_id: string
          term_id?: string | null
          updated_at?: string
          weekly_periods?: number
          year_id: string
        }
        Update: {
          created_at?: string
          daily_max?: number | null
          day_prefs?: number[] | null
          id?: string
          needs_double?: boolean
          room_kind?: string | null
          school_id?: string
          section_id?: string
          subject_id?: string
          term_id?: string | null
          updated_at?: string
          weekly_periods?: number
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          school_id: string
          section_id: string
          start_date: string
          status: string
          student_id: string
          updated_at: string
          year_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          school_id: string
          section_id: string
          start_date?: string
          status?: string
          student_id: string
          updated_at?: string
          year_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          school_id?: string
          section_id?: string
          start_date?: string
          status?: string
          student_id?: string
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      file_cleanup_config: {
        Row: {
          id: boolean
          max_attempts: number
          retention_minutes: number
          updated_at: string
        }
        Insert: {
          id?: boolean
          max_attempts?: number
          retention_minutes?: number
          updated_at?: string
        }
        Update: {
          id?: boolean
          max_attempts?: number
          retention_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      file_cleanup_runs: {
        Row: {
          channel: string
          delete_requests: number
          failed: number
          finished_at: string | null
          id: string
          marked: number
          note: string | null
          rows_removed: number
          skipped_linked: number
          started_at: string
          status: string
        }
        Insert: {
          channel?: string
          delete_requests?: number
          failed?: number
          finished_at?: string | null
          id?: string
          marked?: number
          note?: string | null
          rows_removed?: number
          skipped_linked?: number
          started_at?: string
          status?: string
        }
        Update: {
          channel?: string
          delete_requests?: number
          failed?: number
          finished_at?: string | null
          id?: string
          marked?: number
          note?: string | null
          rows_removed?: number
          skipped_linked?: number
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      file_policies: {
        Row: {
          allowed_types: string[]
          max_bytes: number
          school_id: string
          updated_at: string
        }
        Insert: {
          allowed_types?: string[]
          max_bytes?: number
          school_id: string
          updated_at?: string
        }
        Update: {
          allowed_types?: string[]
          max_bytes?: number
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          category: string | null
          cleanup_attempts: number
          cleanup_error: string | null
          cleanup_last_at: string | null
          created_at: string
          description: string | null
          id: string
          mime_type: string
          name: string
          school_id: string
          size_bytes: number
          source_id: string
          source_type: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          category?: string | null
          cleanup_attempts?: number
          cleanup_error?: string | null
          cleanup_last_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mime_type: string
          name: string
          school_id: string
          size_bytes: number
          source_id: string
          source_type: string
          storage_path: string
          uploaded_by?: string
        }
        Update: {
          category?: string | null
          cleanup_attempts?: number
          cleanup_error?: string | null
          cleanup_last_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mime_type?: string
          name?: string
          school_id?: string
          size_bytes?: number
          source_id?: string
          source_type?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_movements: {
        Row: {
          at: string
          by_user: string | null
          date: string
          id: string
          kind: string
          note: string | null
          pickup_id: string | null
          school_id: string
          student_id: string
        }
        Insert: {
          at?: string
          by_user?: string | null
          date: string
          id?: string
          kind: string
          note?: string | null
          pickup_id?: string | null
          school_id: string
          student_id: string
        }
        Update: {
          at?: string
          by_user?: string | null
          date?: string
          id?: string
          kind?: string
          note?: string | null
          pickup_id?: string | null
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_movements_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_movements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_corrections: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          evidence: string | null
          gradebook_id: string
          id: string
          item_id: string
          new_score: number | null
          new_status: string
          old_score: number | null
          old_status: string | null
          reason: string
          requested_at: string
          requested_by: string | null
          status: string
          student_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: string | null
          gradebook_id: string
          id?: string
          item_id: string
          new_score?: number | null
          new_status: string
          old_score?: number | null
          old_status?: string | null
          reason: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          student_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          evidence?: string | null
          gradebook_id?: string
          id?: string
          item_id?: string
          new_score?: number | null
          new_status?: string
          old_score?: number | null
          old_status?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string | null
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_corrections_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_corrections_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "grade_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_exceptions: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          gradebook_id: string
          id: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          student_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          gradebook_id: string
          id?: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          student_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          gradebook_id?: string
          id?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grade_exceptions_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_exceptions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_periods: {
        Row: {
          approve_by: string | null
          created_at: string
          created_by: string | null
          entry_end: string
          entry_start: string
          id: string
          name: string
          publish_by: string | null
          review_by: string | null
          school_id: string
          status: string
          status_reason: string | null
          submit_by: string | null
          term_id: string | null
          updated_at: string
          year_id: string
        }
        Insert: {
          approve_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_end: string
          entry_start: string
          id?: string
          name: string
          publish_by?: string | null
          review_by?: string | null
          school_id: string
          status?: string
          status_reason?: string | null
          submit_by?: string | null
          term_id?: string | null
          updated_at?: string
          year_id: string
        }
        Update: {
          approve_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_end?: string
          entry_start?: string
          id?: string
          name?: string
          publish_by?: string | null
          review_by?: string | null
          school_id?: string
          status?: string
          status_reason?: string | null
          submit_by?: string | null
          term_id?: string | null
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_periods_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_periods_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_plan_items: {
        Row: {
          id: string
          max_score: number
          name: string
          plan_id: string
          sort_order: number
          source: string
          weight: number
        }
        Insert: {
          id?: string
          max_score: number
          name: string
          plan_id: string
          sort_order?: number
          source?: string
          weight: number
        }
        Update: {
          id?: string
          max_score?: number
          name?: string
          plan_id?: string
          sort_order?: number
          source?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "grade_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_plans: {
        Row: {
          absent_policy: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          decimals: number
          description: string
          effective_from: string
          exempt_policy: string
          grade_id: string | null
          id: string
          name: string
          root_id: string | null
          rounding: string
          school_id: string
          scope: string
          status: string
          subject_id: string | null
          term_id: string | null
          total: number
          updated_at: string
          version: number
          year_id: string
        }
        Insert: {
          absent_policy?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          decimals?: number
          description?: string
          effective_from?: string
          exempt_policy?: string
          grade_id?: string | null
          id?: string
          name: string
          root_id?: string | null
          rounding?: string
          school_id: string
          scope?: string
          status?: string
          subject_id?: string | null
          term_id?: string | null
          total?: number
          updated_at?: string
          version?: number
          year_id: string
        }
        Update: {
          absent_policy?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          decimals?: number
          description?: string
          effective_from?: string
          exempt_policy?: string
          grade_id?: string | null
          id?: string
          name?: string
          root_id?: string | null
          rounding?: string
          school_id?: string
          scope?: string
          status?: string
          subject_id?: string | null
          term_id?: string | null
          total?: number
          updated_at?: string
          version?: number
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grade_plans_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_plans_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_plans_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      grade_results: {
        Row: {
          change_note: string | null
          complete: boolean
          gradebook_id: string
          id: string
          items: Json
          max_total: number | null
          note: string | null
          period_name: string | null
          published_at: string
          school_id: string
          section_name: string | null
          student_id: string
          student_name: string
          subject_name: string | null
          superseded_at: string | null
          total: number | null
          version: number
        }
        Insert: {
          change_note?: string | null
          complete?: boolean
          gradebook_id: string
          id?: string
          items?: Json
          max_total?: number | null
          note?: string | null
          period_name?: string | null
          published_at?: string
          school_id: string
          section_name?: string | null
          student_id: string
          student_name: string
          subject_name?: string | null
          superseded_at?: string | null
          total?: number | null
          version: number
        }
        Update: {
          change_note?: string | null
          complete?: boolean
          gradebook_id?: string
          id?: string
          items?: Json
          max_total?: number | null
          note?: string | null
          period_name?: string | null
          published_at?: string
          school_id?: string
          section_name?: string | null
          student_id?: string
          student_name?: string
          subject_name?: string | null
          superseded_at?: string | null
          total?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "grade_results_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grade_results_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebook_entries: {
        Row: {
          entered_at: string
          entered_by: string | null
          gradebook_id: string
          homework_ids: string[] | null
          hw_method: string | null
          hw_source: Json | null
          id: string
          item_id: string
          score: number | null
          source: string
          status: string
          student_id: string
        }
        Insert: {
          entered_at?: string
          entered_by?: string | null
          gradebook_id: string
          homework_ids?: string[] | null
          hw_method?: string | null
          hw_source?: Json | null
          id?: string
          item_id: string
          score?: number | null
          source?: string
          status?: string
          student_id: string
        }
        Update: {
          entered_at?: string
          entered_by?: string | null
          gradebook_id?: string
          homework_ids?: string[] | null
          hw_method?: string | null
          hw_source?: Json | null
          id?: string
          item_id?: string
          score?: number | null
          source?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradebook_entries_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebook_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "grade_plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebook_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebook_events: {
        Row: {
          action: string
          actor: string | null
          at: string
          details: Json
          gradebook_id: string
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          details?: Json
          gradebook_id: string
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          details?: Json
          gradebook_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradebook_events_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebook_import_batches: {
        Row: {
          batch_key: string
          gradebook_id: string
          imported_at: string
          imported_by: string | null
          row_count: number
        }
        Insert: {
          batch_key: string
          gradebook_id: string
          imported_at?: string
          imported_by?: string | null
          row_count: number
        }
        Update: {
          batch_key?: string
          gradebook_id?: string
          imported_at?: string
          imported_by?: string | null
          row_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "gradebook_import_batches_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebook_notes: {
        Row: {
          gradebook_id: string
          note: string
          student_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          gradebook_id: string
          note: string
          student_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          gradebook_id?: string
          note?: string
          student_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gradebook_notes_gradebook_id_fkey"
            columns: ["gradebook_id"]
            isOneToOne: false
            referencedRelation: "gradebooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebook_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      gradebooks: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_revision: number | null
          course_id: string
          created_at: string
          id: string
          last_saved_at: string | null
          last_saved_by: string | null
          period_id: string
          plan_id: string
          published_at: string | null
          reopen_reason: string | null
          reopen_until: string | null
          result_version: number
          return_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_revision: number | null
          revision: number
          school_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          submitted_revision: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_revision?: number | null
          course_id: string
          created_at?: string
          id?: string
          last_saved_at?: string | null
          last_saved_by?: string | null
          period_id: string
          plan_id: string
          published_at?: string | null
          reopen_reason?: string | null
          reopen_until?: string | null
          result_version?: number
          return_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_revision?: number | null
          revision?: number
          school_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_revision?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_revision?: number | null
          course_id?: string
          created_at?: string
          id?: string
          last_saved_at?: string | null
          last_saved_by?: string | null
          period_id?: string
          plan_id?: string
          published_at?: string | null
          reopen_reason?: string | null
          reopen_until?: string | null
          result_version?: number
          return_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_revision?: number | null
          revision?: number
          school_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          submitted_revision?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gradebooks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "grade_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "grade_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gradebooks_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          phone: string | null
          school_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          phone?: string | null
          school_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          phone?: string | null
          school_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      homework: {
        Row: {
          allow_resubmit: boolean
          audience: string
          available_from: string
          cancel_reason: string | null
          closed_at: string | null
          copied_from: string | null
          course_id: string
          created_at: string
          created_by: string
          criteria: Json
          due_at: string
          file_max_bytes: number | null
          file_types: string[] | null
          grading_notes: string | null
          id: string
          instructions: string
          join_days: number
          join_policy: string
          kind: string
          late_policy: string
          late_until: string | null
          max_attempts: number
          max_score: number | null
          published_at: string | null
          remind_hours: number | null
          school_id: string
          section_id: string
          selected_students: string[]
          status: string
          submission_types: string[]
          term_id: string | null
          title: string
          updated_at: string
          version: number
          year_id: string
        }
        Insert: {
          allow_resubmit?: boolean
          audience?: string
          available_from?: string
          cancel_reason?: string | null
          closed_at?: string | null
          copied_from?: string | null
          course_id: string
          created_at?: string
          created_by: string
          criteria?: Json
          due_at: string
          file_max_bytes?: number | null
          file_types?: string[] | null
          grading_notes?: string | null
          id?: string
          instructions?: string
          join_days?: number
          join_policy?: string
          kind?: string
          late_policy?: string
          late_until?: string | null
          max_attempts?: number
          max_score?: number | null
          published_at?: string | null
          remind_hours?: number | null
          school_id: string
          section_id: string
          selected_students?: string[]
          status?: string
          submission_types?: string[]
          term_id?: string | null
          title: string
          updated_at?: string
          version?: number
          year_id: string
        }
        Update: {
          allow_resubmit?: boolean
          audience?: string
          available_from?: string
          cancel_reason?: string | null
          closed_at?: string | null
          copied_from?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          criteria?: Json
          due_at?: string
          file_max_bytes?: number | null
          file_types?: string[] | null
          grading_notes?: string | null
          id?: string
          instructions?: string
          join_days?: number
          join_policy?: string
          kind?: string
          late_policy?: string
          late_until?: string | null
          max_attempts?: number
          max_score?: number | null
          published_at?: string | null
          remind_hours?: number | null
          school_id?: string
          section_id?: string
          selected_students?: string[]
          status?: string
          submission_types?: string[]
          term_id?: string | null
          title?: string
          updated_at?: string
          version?: number
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_attempts: {
        Row: {
          attempt_no: number
          body: string
          client_id: string | null
          due_applied: string
          homework_id: string
          homework_version: number
          id: string
          is_late: boolean
          kind: string
          link_url: string | null
          note: string | null
          recorded_by: string | null
          student_id: string
          submission_id: string
          submitted_at: string
        }
        Insert: {
          attempt_no: number
          body?: string
          client_id?: string | null
          due_applied: string
          homework_id: string
          homework_version: number
          id?: string
          is_late: boolean
          kind?: string
          link_url?: string | null
          note?: string | null
          recorded_by?: string | null
          student_id: string
          submission_id: string
          submitted_at?: string
        }
        Update: {
          attempt_no?: number
          body?: string
          client_id?: string | null
          due_applied?: string
          homework_id?: string
          homework_version?: number
          id?: string
          is_late?: boolean
          kind?: string
          link_url?: string | null
          note?: string | null
          recorded_by?: string | null
          student_id?: string
          submission_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_attempts_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_attempts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_drafts: {
        Row: {
          body: string
          link_url: string | null
          submission_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          link_url?: string | null
          submission_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          link_url?: string | null
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_drafts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          homework_id: string
          id: string
          student_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          homework_id: string
          id?: string
          student_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          homework_id?: string
          id?: string
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "homework_events_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_grade_history: {
        Row: {
          actor: string
          created_at: string
          grade_id: string
          id: string
          new_feedback: string | null
          new_score: number | null
          old_feedback: string | null
          old_score: number | null
          reason: string
        }
        Insert: {
          actor: string
          created_at?: string
          grade_id: string
          id?: string
          new_feedback?: string | null
          new_score?: number | null
          old_feedback?: string | null
          old_score?: number | null
          reason: string
        }
        Update: {
          actor?: string
          created_at?: string
          grade_id?: string
          id?: string
          new_feedback?: string | null
          new_score?: number | null
          old_feedback?: string | null
          old_score?: number | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_grade_history_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "homework_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_grades: {
        Row: {
          attempt_no: number
          criteria_scores: Json
          feedback: string | null
          graded_at: string
          graded_by: string
          homework_id: string
          id: string
          needs_review: boolean
          published_at: string | null
          rev: number
          revealed_at: string | null
          revealed_by: string | null
          rubric_version: number
          score: number | null
          status: string
          student_id: string
          submission_id: string
        }
        Insert: {
          attempt_no: number
          criteria_scores?: Json
          feedback?: string | null
          graded_at?: string
          graded_by: string
          homework_id: string
          id?: string
          needs_review?: boolean
          published_at?: string | null
          rev?: number
          revealed_at?: string | null
          revealed_by?: string | null
          rubric_version: number
          score?: number | null
          status?: string
          student_id: string
          submission_id: string
        }
        Update: {
          attempt_no?: number
          criteria_scores?: Json
          feedback?: string | null
          graded_at?: string
          graded_by?: string
          homework_id?: string
          id?: string
          needs_review?: boolean
          published_at?: string | null
          rev?: number
          revealed_at?: string | null
          revealed_by?: string | null
          rubric_version?: number
          score?: number | null
          status?: string
          student_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_grades_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_grades_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submission_files: {
        Row: {
          attempt_no: number | null
          file_id: string
          submission_id: string
        }
        Insert: {
          attempt_no?: number | null
          file_id: string
          submission_id: string
        }
        Update: {
          attempt_no?: number | null
          file_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submission_files_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submission_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "homework_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_submissions: {
        Row: {
          attempt_count: number
          homework_id: string
          id: string
          last_submitted_at: string | null
          returned_at: string | null
          returned_by: string | null
          returned_reason: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          homework_id: string
          id?: string
          last_submitted_at?: string | null
          returned_at?: string | null
          returned_by?: string | null
          returned_reason?: string | null
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          homework_id?: string
          id?: string
          last_submitted_at?: string | null
          returned_at?: string | null
          returned_by?: string | null
          returned_reason?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_submissions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_targets: {
        Row: {
          added_at: string
          extend_reason: string | null
          extended_due: string | null
          homework_id: string
          join_status: string | null
          joined_at: string | null
          removed_at: string | null
          removed_reason: string | null
          reopened: boolean
          school_id: string
          student_id: string
        }
        Insert: {
          added_at?: string
          extend_reason?: string | null
          extended_due?: string | null
          homework_id: string
          join_status?: string | null
          joined_at?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          reopened?: boolean
          school_id: string
          student_id: string
        }
        Update: {
          added_at?: string
          extend_reason?: string | null
          extended_due?: string | null
          homework_id?: string
          join_status?: string | null
          joined_at?: string | null
          removed_at?: string | null
          removed_reason?: string | null
          reopened?: boolean
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homework_targets_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_targets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homework_targets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      homework_versions: {
        Row: {
          change_note: string | null
          changed_by: string
          created_at: string
          homework_id: string
          id: string
          snapshot: Json
          version: number
        }
        Insert: {
          change_note?: string | null
          changed_by: string
          created_at?: string
          homework_id: string
          id?: string
          snapshot: Json
          version: number
        }
        Update: {
          change_note?: string | null
          changed_by?: string
          created_at?: string
          homework_id?: string
          id?: string
          snapshot?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "homework_versions_homework_id_fkey"
            columns: ["homework_id"]
            isOneToOne: false
            referencedRelation: "homework"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          department_id: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          needs_review: boolean
          org_id: string
          resent_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          needs_review?: boolean
          org_id: string
          resent_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          needs_review?: boolean
          org_id?: string
          resent_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          is_active: boolean
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          school_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reports: {
        Row: {
          created_at: string
          decision: string | null
          file_id: string | null
          id: string
          message_id: string
          org_id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          school_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          decision?: string | null
          file_id?: string | null
          id?: string
          message_id: string
          org_id: string
          reason: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          decision?: string | null
          file_id?: string | null
          id?: string
          message_id?: string
          org_id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          school_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reports_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_revisions: {
        Row: {
          action: string
          actor: string
          body: string
          created_at: string
          id: string
          message_id: string
        }
        Insert: {
          action: string
          actor: string
          body: string
          created_at?: string
          id?: string
          message_id: string
        }
        Update: {
          action?: string
          actor?: string
          body?: string
          created_at?: string
          id?: string
          message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_revisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          client_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          pinned_at: string | null
          pinned_by: string | null
          reply_to: string | null
          school_id: string | null
          sender_id: string
          seq: number
        }
        Insert: {
          body?: string
          client_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          school_id?: string | null
          sender_id: string
          seq: number
        }
        Update: {
          body?: string
          client_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          school_id?: string | null
          sender_id?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          school_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          school_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          school_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      periods: {
        Row: {
          created_at: string
          days: number[] | null
          end_time: string
          id: string
          kind: string
          name: string
          school_id: string
          sort_order: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days?: number[] | null
          end_time: string
          id?: string
          kind?: string
          name: string
          school_id: string
          sort_order: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days?: number[] | null
          end_time?: string
          id?: string
          kind?: string
          name?: string
          school_id?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_requests: {
        Row: {
          arrived_at: string | null
          arrived_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          delegate_ack_at: string | null
          delegate_decided_at: string | null
          delegate_decided_by: string | null
          delegate_failed_attempts: number
          delegate_id_last4: string | null
          delegate_locked_at: string | null
          delegate_mode: string
          delegate_note: string | null
          delegate_phone: string | null
          delegate_relationship: string | null
          delegate_status: string | null
          delegate_used_at: string | null
          delegate_valid_until: string | null
          guardian_id: string
          handed_at: string | null
          handed_by: string | null
          id: string
          identity_checked_at: string | null
          identity_checked_by: string | null
          kind: string
          pickup_name: string
          pickup_person_id: string | null
          planned_at: string | null
          preparing_at: string | null
          ready_at: string | null
          ready_by: string | null
          reason: string | null
          req_date: string
          requested_by: string
          school_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          arrived_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          delegate_ack_at?: string | null
          delegate_decided_at?: string | null
          delegate_decided_by?: string | null
          delegate_failed_attempts?: number
          delegate_id_last4?: string | null
          delegate_locked_at?: string | null
          delegate_mode?: string
          delegate_note?: string | null
          delegate_phone?: string | null
          delegate_relationship?: string | null
          delegate_status?: string | null
          delegate_used_at?: string | null
          delegate_valid_until?: string | null
          guardian_id: string
          handed_at?: string | null
          handed_by?: string | null
          id?: string
          identity_checked_at?: string | null
          identity_checked_by?: string | null
          kind: string
          pickup_name: string
          pickup_person_id?: string | null
          planned_at?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          ready_by?: string | null
          reason?: string | null
          req_date: string
          requested_by: string
          school_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          arrived_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          delegate_ack_at?: string | null
          delegate_decided_at?: string | null
          delegate_decided_by?: string | null
          delegate_failed_attempts?: number
          delegate_id_last4?: string | null
          delegate_locked_at?: string | null
          delegate_mode?: string
          delegate_note?: string | null
          delegate_phone?: string | null
          delegate_relationship?: string | null
          delegate_status?: string | null
          delegate_used_at?: string | null
          delegate_valid_until?: string | null
          guardian_id?: string
          handed_at?: string | null
          handed_by?: string | null
          id?: string
          identity_checked_at?: string | null
          identity_checked_by?: string | null
          kind?: string
          pickup_name?: string
          pickup_person_id?: string | null
          planned_at?: string | null
          preparing_at?: string | null
          ready_at?: string | null
          ready_by?: string | null
          reason?: string | null
          req_date?: string
          requested_by?: string
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_requests_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_requests_pickup_person_id_fkey"
            columns: ["pickup_person_id"]
            isOneToOne: false
            referencedRelation: "authorized_pickups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pickup_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          post_id: string
          school_id: string
        }
        Insert: {
          author_user_id?: string
          body: string
          created_at?: string
          id?: string
          post_id: string
          school_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          post_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "classroom_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          capacity: number | null
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_day_settings: {
        Row: {
          day_end: string | null
          day_start: string | null
          school_id: string
          study_days: number[]
          subs_in_daily: boolean
          updated_at: string
        }
        Insert: {
          day_end?: string | null
          day_start?: string | null
          school_id: string
          study_days?: number[]
          subs_in_daily?: boolean
          updated_at?: string
        }
        Update: {
          day_end?: string | null
          day_start?: string | null
          school_id?: string
          study_days?: number[]
          subs_in_daily?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_day_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          city: string | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          stage_type: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          stage_type?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          stage_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          capacity: number
          created_at: string
          grade_id: string
          id: string
          name: string
          school_id: string
          updated_at: string
          year_id: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          grade_id: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
          year_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          grade_id?: string
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      student_cards: {
        Row: {
          id: string
          issued_at: string
          issued_by: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          school_id: string
          status: string
          student_id: string
          token: string
        }
        Insert: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_id: string
          status?: string
          student_id: string
          token?: string
        }
        Update: {
          id?: string
          issued_at?: string
          issued_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          school_id?: string
          status?: string
          student_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_cards_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_cards_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_follow: boolean
          can_pickup: boolean
          created_at: string
          guardian_id: string
          id: string
          relationship: string
          school_id: string
          student_id: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          can_follow?: boolean
          can_pickup?: boolean
          created_at?: string
          guardian_id: string
          id?: string
          relationship: string
          school_id: string
          student_id: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          can_follow?: boolean
          can_pickup?: boolean
          created_at?: string
          guardian_id?: string
          id?: string
          relationship?: string
          school_id?: string
          student_id?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          gender: string | null
          id: string
          national_id: string | null
          school_id: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          national_id?: string | null
          school_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          national_id?: string | null
          school_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string
          department_id: string | null
          id: string
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      substitutions: {
        Row: {
          absence_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string
          date: string
          id: string
          reason: string | null
          school_id: string
          slot_id: string
          status: string
          substitute_teacher_id: string
        }
        Insert: {
          absence_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          date: string
          id?: string
          reason?: string | null
          school_id: string
          slot_id: string
          status?: string
          substitute_teacher_id: string
        }
        Update: {
          absence_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          reason?: string | null
          school_id?: string
          slot_id?: string
          status?: string
          substitute_teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "substitutions_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: false
            referencedRelation: "teacher_absences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitutions_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitutions_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "substitutions_substitute_teacher_id_fkey"
            columns: ["substitute_teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisor_teachers: {
        Row: {
          created_at: string
          id: string
          school_id: string
          supervisor_user_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          supervisor_user_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          supervisor_user_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisor_teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisor_teachers_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_absences: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          note: string | null
          school_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          date: string
          id?: string
          note?: string | null
          school_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          note?: string | null
          school_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_absences_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_absences_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          course_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          end_date: string | null
          id: string
          note: string | null
          school_id: string
          start_date: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date?: string | null
          id?: string
          note?: string | null
          school_id: string
          start_date?: string
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date?: string | null
          id?: string
          note?: string | null
          school_id?: string
          start_date?: string
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_loads: {
        Row: {
          created_at: string
          daily_max: number
          id: string
          note: string | null
          school_id: string
          teacher_id: string
          term_id: string | null
          updated_at: string
          weekly_max: number
          year_id: string
        }
        Insert: {
          created_at?: string
          daily_max: number
          id?: string
          note?: string | null
          school_id: string
          teacher_id: string
          term_id?: string | null
          updated_at?: string
          weekly_max: number
          year_id: string
        }
        Update: {
          created_at?: string
          daily_max?: number
          id?: string
          note?: string | null
          school_id?: string
          teacher_id?: string
          term_id?: string | null
          updated_at?: string
          weekly_max?: number
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_loads_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_loads_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_loads_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_loads_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_unavailability: {
        Row: {
          created_at: string
          day: number | null
          hard: boolean
          id: string
          kind: string
          note: string | null
          period_id: string | null
          reason: string | null
          school_id: string
          teacher_id: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          day?: number | null
          hard?: boolean
          id?: string
          kind?: string
          note?: string | null
          period_id?: string | null
          reason?: string | null
          school_id: string
          teacher_id: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          day?: number | null
          hard?: boolean
          id?: string
          kind?: string
          note?: string | null
          period_id?: string | null
          reason?: string | null
          school_id?: string
          teacher_id?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_unavailability_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_unavailability_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_unavailability_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      teachers: {
        Row: {
          created_at: string
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          school_id: string
          specialization: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          school_id: string
          specialization?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          school_id?: string
          specialization?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teachers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      terms: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          name: string
          school_id: string
          start_date: string | null
          updated_at: string
          year_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          school_id: string
          start_date?: string | null
          updated_at?: string
          year_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          school_id?: string
          start_date?: string | null
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          course_id: string
          created_at: string
          day: number
          id: string
          period_id: string
          pinned: boolean
          room_id: string | null
          school_id: string
          section_id: string
          teacher_id: string
          timetable_id: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          day: number
          id?: string
          period_id: string
          pinned?: boolean
          room_id?: string | null
          school_id: string
          section_id: string
          teacher_id: string
          timetable_id: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          day?: number
          id?: string
          period_id?: string
          pinned?: boolean
          room_id?: string | null
          school_id?: string
          section_id?: string
          teacher_id?: string
          timetable_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_slots_timetable_id_fkey"
            columns: ["timetable_id"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
        ]
      }
      timetables: {
        Row: {
          based_on: string | null
          created_at: string
          created_by: string
          effective_from: string | null
          id: string
          name: string
          published_at: string | null
          published_by: string | null
          school_id: string
          status: string
          term_id: string | null
          updated_at: string
          version: number | null
          year_id: string
        }
        Insert: {
          based_on?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string | null
          id?: string
          name: string
          published_at?: string | null
          published_by?: string | null
          school_id: string
          status?: string
          term_id?: string | null
          updated_at?: string
          version?: number | null
          year_id: string
        }
        Update: {
          based_on?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string | null
          id?: string
          name?: string
          published_at?: string | null
          published_by?: string | null
          school_id?: string
          status?: string
          term_id?: string | null
          updated_at?: string
          version?: number | null
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetables_based_on_fkey"
            columns: ["based_on"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_term_id_fkey"
            columns: ["term_id"]
            isOneToOne: false
            referencedRelation: "terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetables_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      tt_gen_runs: {
        Row: {
          applied_at: string | null
          finished_at: string | null
          id: string
          input_hash: string
          mode: string
          school_id: string
          started_at: string
          started_by: string
          status: string
          summary: Json | null
          timetable_id: string
        }
        Insert: {
          applied_at?: string | null
          finished_at?: string | null
          id?: string
          input_hash: string
          mode: string
          school_id: string
          started_at?: string
          started_by?: string
          status?: string
          summary?: Json | null
          timetable_id: string
        }
        Update: {
          applied_at?: string | null
          finished_at?: string | null
          id?: string
          input_hash?: string
          mode?: string
          school_id?: string
          started_at?: string
          started_by?: string
          status?: string
          summary?: Json | null
          timetable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tt_gen_runs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tt_gen_runs_timetable_id_fkey"
            columns: ["timetable_id"]
            isOneToOne: false
            referencedRelation: "timetables"
            referencedColumns: ["id"]
          },
        ]
      }
      vice_scopes: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          school_id: string
          teacher_id: string | null
          vice_user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          school_id: string
          teacher_id?: string | null
          vice_user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          school_id?: string
          teacher_id?: string | null
          vice_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vice_scopes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vice_scopes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vice_scopes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _access_audit: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _inv: string
          _mem: string
          _org: string
          _reason: string
          _school: string
          _user: string
        }
        Returns: undefined
      }
      _add_member: {
        Args: {
          _conv: string
          _role: string
          _source: string
          _user: string
          _visible: string
        }
        Returns: boolean
      }
      _adm_can_organize: { Args: { _school: string }; Returns: boolean }
      _adm_can_read: {
        Args: { _entity: string; _id: string }
        Returns: boolean
      }
      _adm_check_answers: {
        Args: { _a: Json; _fields: Json; _strict: boolean }
        Returns: Json
      }
      _adm_check_fields: { Args: { _f: Json }; Returns: Json }
      _adm_dept: { Args: { _dept: string; _school: string }; Returns: boolean }
      _adm_invitee_school: {
        Args: { _org: string; _school: string; _scope: string; _user: string }
        Returns: string
      }
      _adm_lead: { Args: { _school: string }; Returns: boolean }
      _adm_live_role: { Args: { _id: string }; Returns: string }
      _adm_log: {
        Args: {
          _action: string
          _details: Json
          _entity: string
          _id: string
          _school: string
        }
        Returns: undefined
      }
      _adm_name: { Args: { _user: string }; Returns: string }
      _adm_principal: { Args: { _school: string }; Returns: boolean }
      _adm_staff: { Args: { _school: string; _user: string }; Returns: boolean }
      _adm_task_for: {
        Args: { _id: string; _rev: number; _who: string }
        Returns: {
          acknowledged_at: string | null
          assignee: string
          assigner: string
          blocked_at: string | null
          blocked_reason: string | null
          client_id: string | null
          created_at: string
          decision_id: string | null
          department_id: string | null
          description: string | null
          done_at: string | null
          due_date: string
          id: string
          needs_confirmation: boolean
          participants: string[]
          priority: string
          progress: number
          proof_required: string | null
          rev: number
          school_id: string
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "adm_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _apply_invitation: {
        Args: {
          _em: string
          _uid: string
          r: Database["public"]["Tables"]["invitations"]["Row"]
        }
        Returns: undefined
      }
      _att_announce_section: { Args: { _student: string }; Returns: string }
      _att_build_review: {
        Args: { _actor: string; _date: string; _now?: string; _school: string }
        Returns: Json
      }
      _att_default_policy: {
        Args: { _school: string }
        Returns: {
          absence_review_at: string
          approver_roles: Database["public"]["Enums"]["app_role"][]
          arrival_open: string
          call_point: string
          created_at: string
          created_by: string | null
          day_end: string
          day_start: string
          effective_from: string
          extra_days: string[]
          grace_minutes: number
          guardian_cancel_until: string
          holidays: string[]
          id: string
          late_from: string
          notify_arrival: boolean
          org_id: string
          principal_editable: string[]
          school_id: string | null
          study_days: number[]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "attendance_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _att_event: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity: string
          _id: string
          _reason: string
          _school: string
        }
        Returns: undefined
      }
      _att_expected: {
        Args: { _date: string; _school: string }
        Returns: string[]
      }
      _att_notify_guardians: {
        Args: {
          _body: string
          _key: string
          _school: string
          _student: string
          _title: string
        }
        Returns: undefined
      }
      _att_section: { Args: { _student: string }; Returns: string }
      _audit: {
        Args: {
          _action: string
          _circ: string
          _conv: string
          _details: Json
          _org: string
          _school: string
        }
        Returns: undefined
      }
      _auto_card: { Args: { _student: string }; Returns: undefined }
      _can_circ_scope: {
        Args: { _home: string; _org: string; _scope: string }
        Returns: boolean
      }
      _can_create_group: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _circ_audience_multi: {
        Args: { _aud: Json; _targets: string[] }
        Returns: {
          school_id: string
          user_id: string
        }[]
      }
      _circ_branch_viewer: {
        Args: { _c: string; _school: string }
        Returns: boolean
      }
      _circ_label: {
        Args: { _org: string; _school: string; _scope: string }
        Returns: string
      }
      _circ_targets: {
        Args: {
          _home: string
          _org: string
          _schools: string[]
          _scope: string
        }
        Returns: string[]
      }
      _circular_audience: {
        Args: { _aud: Json; _school: string }
        Returns: string[]
      }
      _conv_link: { Args: { _conv: string }; Returns: string }
      _course_members: {
        Args: { _course: string }
        Returns: {
          r: string
          uid: string
        }[]
      }
      _course_title: { Args: { _course: string }; Returns: string }
      _duty_assignment_mine: {
        Args: { _id: string }
        Returns: {
          ack_at: string | null
          cancel_reason: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          date: string
          end_time: string
          exec_at: string | null
          exec_note: string | null
          exec_status: string
          id: string
          post_id: string
          rev: number
          roster_id: string
          school_id: string
          source: string
          start_time: string
          status: string
          substitute_for: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "adm_duty_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _duty_busy: {
        Args: {
          _date: string
          _e: string
          _exclude: string
          _s: string
          _school: string
          _user: string
        }
        Returns: string
      }
      _duty_check_conflicts: {
        Args: { _key: string; _school: string }
        Returns: number
      }
      _duty_gaps: {
        Args: { _from: string; _school: string; _to: string }
        Returns: number
      }
      _duty_roster_for: {
        Args: { _rev: number; _roster: string }
        Returns: {
          created_at: string
          created_by: string | null
          effective_from: string | null
          id: string
          published_at: string | null
          published_by: string | null
          report: Json
          rev: number
          school_id: string
          status: string
          updated_at: string
          version: number
          week_start: string
        }
        SetofOptions: {
          from: "*"
          to: "adm_duty_rosters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _duty_snapshot: { Args: { _roster: string }; Returns: number }
      _duty_study_days: { Args: { _school: string }; Returns: number[] }
      _eligible_staff: {
        Args: { _org: string; _school: string; _user: string }
        Returns: boolean
      }
      _family_ok: {
        Args: {
          _guardian: string
          _kind: string
          _staff: string
          _student: string
        }
        Returns: boolean
      }
      _file_policy: {
        Args: { _school: string }
        Returns: {
          allowed_types: string[]
          max_bytes: number
        }[]
      }
      _gb_admin: { Args: { _school: string }; Returns: boolean }
      _gb_can_enter: { Args: { _gb: string }; Returns: boolean }
      _gb_can_enter_student: {
        Args: { _gb: string; _student: string }
        Returns: boolean
      }
      _gb_course_label: { Args: { _course: string }; Returns: string }
      _gb_dept: { Args: { _course: string }; Returns: boolean }
      _gb_dept_missing: { Args: { _course: string }; Returns: boolean }
      _gb_has_dept: { Args: { _course: string }; Returns: boolean }
      _gb_hw_calc: {
        Args: {
          _gb: string
          _homework: string[]
          _item: string
          _method: string
          _missing: string
        }
        Returns: {
          lacking: Json
          sources: Json
          student_id: string
          student_name: string
          used: number
          value: number
        }[]
      }
      _gb_hw_check: {
        Args: {
          _gb: string
          _homework: string[]
          _item: string
          _method: string
          _missing: string
        }
        Returns: undefined
      }
      _gb_hw_drift: {
        Args: { _gb: string }
        Returns: {
          current: number
          item_id: string
          item_name: string
          stored: number
          student_id: string
          student_name: string
        }[]
      }
      _gb_log: {
        Args: { _action: string; _d: Json; _gb: string }
        Returns: undefined
      }
      _gb_notify_teacher: {
        Args: { _body: string; _gb: string; _title: string }
        Returns: undefined
      }
      _gb_read: { Args: { _course: string; _school: string }; Returns: boolean }
      _gb_roster: {
        Args: { _gb: string }
        Returns: {
          active: boolean
          full_name: string
          student_id: string
        }[]
      }
      _gb_round: {
        Args: { _dec: number; _mode: string; _x: number }
        Returns: number
      }
      _gb_snapshot: {
        Args: { _gb: string; _note: string; _student: string }
        Returns: number
      }
      _gb_teacher: { Args: { _course: string }; Returns: boolean }
      _gb_total: { Args: { _gb: string; _student: string }; Returns: number }
      _gb_window: { Args: { _gb: string; _student: string }; Returns: boolean }
      _group_admin: { Args: { _conv: string }; Returns: boolean }
      _hw_check_score: {
        Args: { _criteria: Json; _score: number; h: Record<string, unknown> }
        Returns: number
      }
      _hw_ensure_submission: {
        Args: { _hw: string; _student: string }
        Returns: string
      }
      _hw_event: {
        Args: { _action: string; _details: Json; _hw: string; _student: string }
        Returns: undefined
      }
      _hw_my_student: { Args: { _hw: string }; Returns: string }
      _hw_notify: {
        Args: {
          _body: string
          _hw: string
          _key: string
          _kind: string
          _student: string
          _title: string
        }
        Returns: undefined
      }
      _hw_snapshot: { Args: { _hw: string; _note: string }; Returns: undefined }
      _hw_year_archived: { Args: { _year: string }; Returns: boolean }
      _invite_valid: {
        Args: { r: Database["public"]["Tables"]["invitations"]["Row"] }
        Returns: boolean
      }
      _meet_busy: {
        Args: {
          _date: string
          _e: string
          _meeting: string
          _s: string
          _school: string
          _user: string
        }
        Returns: string
      }
      _new_card_code: { Args: never; Returns: string }
      _notify: {
        Args: {
          _body: string
          _key: string
          _kind: string
          _link: string
          _school: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      _pickup_delegate_set: {
        Args: { _d: Json; _id: string; _mode: string; _person: string }
        Returns: undefined
      }
      _report_reviewer: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _scope_manager: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _section_title: { Args: { _section: string }; Returns: string }
      _section_users: {
        Args: { _guardians: boolean; _section: string; _year: string }
        Returns: string[]
      }
      _student_ok: {
        Args: { _student: string; _teacher: string }
        Returns: boolean
      }
      _task_target_ok: {
        Args: { _school: string; _user: string }
        Returns: boolean
      }
      _teaches_section: {
        Args: { _section: string; _user: string }
        Returns: boolean
      }
      _tt_courses: {
        Args: { _tt: string }
        Returns: {
          course_id: string
          teacher_count: number
          teacher_id: string
        }[]
      }
      _tt_day_lessons: {
        Args: { _day: number; _school: string }
        Returns: string[]
      }
      _tt_ref_date: { Args: { _tt: string }; Returns: string }
      _tt_slot_problem: {
        Args: {
          _course: string
          _day: number
          _id: string
          _period: string
          _room: string
          _teacher: string
          _tt: string
        }
        Returns: string
      }
      _tt_unav_hit: {
        Args: {
          _day: number
          _hard: boolean
          _period: string
          _ref: string
          _teacher: string
        }
        Returns: string
      }
      _tt_unav_on: {
        Args: { _date: string; _day: number; _period: string; _teacher: string }
        Returns: string
      }
      accept_invitation: { Args: { _token: string }; Returns: string }
      accept_my_invitations: { Args: never; Returns: number }
      ack_circular: { Args: { _id: string }; Returns: number }
      add_authorized_pickup: {
        Args: {
          _name: string
          _national_id: string
          _phone: string
          _relationship: string
          _student: string
        }
        Returns: string
      }
      add_circular_recipients: {
        Args: { _id: string; _require_ack?: boolean; _users: string[] }
        Returns: number
      }
      add_group_members: {
        Args: { _conv: string; _users: string[] }
        Returns: number
      }
      adm_calendar: {
        Args: { _from: string; _school: string; _to: string }
        Returns: {
          day: string
          end_time: string
          id: string
          kind: string
          link: string
          start_time: string
          status: string
          title: string
        }[]
      }
      adm_can_read_decision: { Args: { _id: string }; Returns: boolean }
      adm_can_read_meeting: { Args: { _id: string }; Returns: boolean }
      adm_can_read_minutes: { Args: { _id: string }; Returns: boolean }
      adm_can_read_request: { Args: { _id: string }; Returns: boolean }
      adm_can_read_task: { Args: { _id: string }; Returns: boolean }
      adm_create_task: {
        Args: { _client: string; _d: Json; _school: string }
        Returns: string
      }
      adm_daily_reminders: { Args: { _only?: string[] }; Returns: Json }
      adm_decision_create: {
        Args: { _client: string; _d: Json; _meeting: string }
        Returns: string
      }
      adm_decision_list: {
        Args: {
          _limit: number
          _meeting: string
          _offset: number
          _q: string
          _school: string
          _scope: string
          _status: string
        }
        Returns: {
          assignee_name: string
          body: string
          can_open_meeting: boolean
          created_at: string
          due_date: string
          id: string
          meeting_id: string
          meeting_title: string
          overdue: boolean
          priority: string
          status: string
          task_id: string
          total: number
        }[]
      }
      adm_duty_ack: { Args: { _id: string }; Returns: undefined }
      adm_duty_assign: {
        Args: {
          _client: string
          _date: string
          _post: string
          _roster: string
          _user: string
        }
        Returns: string
      }
      adm_duty_change_list: {
        Args: { _school: string; _status: string }
        Returns: {
          assignment_id: string
          created_at: string
          date: string
          decision_note: string
          id: string
          kind: string
          post: string
          reason: string
          status: string
          user_name: string
        }[]
      }
      adm_duty_coverage: {
        Args: { _roster: string }
        Returns: {
          assigned: number
          date: string
          end_time: string
          kind: string
          names: string
          post: string
          post_id: string
          required: number
          start_time: string
        }[]
      }
      adm_duty_decide_change: {
        Args: { _accept: boolean; _id: string; _note: string }
        Returns: undefined
      }
      adm_duty_exec: {
        Args: { _id: string; _note: string; _rev: number; _status: string }
        Returns: number
      }
      adm_duty_list: {
        Args: {
          _from: string
          _limit: number
          _offset: number
          _post: string
          _q: string
          _school: string
          _scope: string
          _status: string
          _to: string
        }
        Returns: {
          ack_at: string
          cancel_reason: string
          conflict: string
          date: string
          end_time: string
          exec_note: string
          exec_status: string
          id: string
          kind: string
          open_change: string
          post: string
          rev: number
          roster_id: string
          roster_status: string
          start_time: string
          status: string
          substitute: boolean
          total: number
          user_id: string
          user_name: string
        }[]
      }
      adm_duty_load: {
        Args: { _from: string; _school: string; _to: string }
        Returns: {
          changes: number
          done: number
          duties: number
          minutes: number
          not_done: number
          pending: number
          user_id: string
          user_name: string
        }[]
      }
      adm_duty_preview: { Args: { _roster: string }; Returns: Json }
      adm_duty_publish: {
        Args: { _rev: number; _roster: string }
        Returns: number
      }
      adm_duty_remove: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      adm_duty_request_change: {
        Args: { _id: string; _kind: string; _reason: string }
        Returns: string
      }
      adm_duty_roster_open: {
        Args: { _school: string; _week: string }
        Returns: string
      }
      adm_duty_save_post: {
        Args: { _d: Json; _id: string; _school: string }
        Returns: string
      }
      adm_duty_save_settings: {
        Args: { _max: number; _school: string; _weeks: number }
        Returns: undefined
      }
      adm_duty_set_exempt: {
        Args: {
          _reason: string
          _remove: boolean
          _school: string
          _until: string
          _user: string
        }
        Returns: undefined
      }
      adm_duty_substitute: {
        Args: { _client: string; _id: string; _reason: string; _user: string }
        Returns: string
      }
      adm_duty_suggest: {
        Args: { _rev: number; _roster: string }
        Returns: Json
      }
      adm_handle_request: {
        Args: { _action: string; _id: string; _note: string; _rev: number }
        Returns: number
      }
      adm_live_beat: { Args: { _id: string }; Returns: Json }
      adm_live_host: {
        Args: { _action: string; _id: string; _user: string }
        Returns: undefined
      }
      adm_live_join: { Args: { _id: string; _kind: string }; Returns: Json }
      adm_live_leave: { Args: { _id: string }; Returns: undefined }
      adm_live_roster: { Args: { _id: string }; Returns: Json }
      adm_live_self: {
        Args: { _action: string; _id: string }
        Returns: undefined
      }
      adm_live_start: { Args: { _id: string }; Returns: undefined }
      adm_meeting_attendance: {
        Args: { _id: string; _marks: Json }
        Returns: undefined
      }
      adm_meeting_cancel: {
        Args: { _id: string; _reason: string; _rev: number }
        Returns: number
      }
      adm_meeting_candidates: {
        Args: {
          _branch: string
          _dept: string
          _q: string
          _role: string
          _school: string
          _scope: string
        }
        Returns: {
          dept_name: string
          full_name: string
          roles: string
          school_id: string
          school_name: string
          user_id: string
        }[]
      }
      adm_meeting_conflicts: {
        Args: { _id: string }
        Returns: {
          full_name: string
          reason: string
          user_id: string
        }[]
      }
      adm_meeting_list: {
        Args: {
          _from: string
          _limit: number
          _mode: string
          _offset: number
          _org: string
          _q: string
          _school: string
          _scope: string
          _status: string
          _to: string
        }
        Returns: {
          am_organizer: boolean
          duration_min: number
          id: string
          live_status: string
          location: string
          members: number
          mode: string
          my_rsvp: string
          organizer_name: string
          privacy: string
          school_name: string
          scope: string
          starts_at: string
          status: string
          title: string
          total: number
        }[]
      }
      adm_meeting_rsvp: {
        Args: { _id: string; _note: string; _rsvp: string }
        Returns: undefined
      }
      adm_meeting_save: {
        Args: {
          _client: string
          _d: Json
          _id: string
          _rev: number
          _school: string
        }
        Returns: Json
      }
      adm_meeting_send: { Args: { _id: string; _rev: number }; Returns: number }
      adm_minutes_confirm: {
        Args: { _id: string; _rev: number }
        Returns: undefined
      }
      adm_minutes_save: {
        Args: { _d: Json; _meeting: string; _rev: number }
        Returns: Json
      }
      adm_my_virtual_meetings: {
        Args: never
        Returns: {
          am_organizer: boolean
          duration_min: number
          id: string
          live_status: string
          my_rsvp: string
          organizer_name: string
          school_name: string
          starts_at: string
          status: string
          title: string
        }[]
      }
      adm_org_summary: {
        Args: { _org: string }
        Returns: {
          decisions_open: number
          duties_week: number
          duty_gaps_week: number
          meetings_upcoming: number
          requests_closed_30d: number
          requests_open: number
          school: string
          school_id: string
          tasks_done_30d: number
          tasks_open: number
          tasks_overdue: number
        }[]
      }
      adm_party_names: {
        Args: { _entity: string; _id: string }
        Returns: {
          full_name: string
          user_id: string
        }[]
      }
      adm_reassign_request: {
        Args: { _id: string; _reason: string; _user: string }
        Returns: undefined
      }
      adm_request_list: {
        Args: {
          _form: string
          _limit: number
          _offset: number
          _q: string
          _school: string
          _scope: string
          _status: string
        }
        Returns: {
          form_name: string
          form_version: number
          handler: string
          handling: boolean
          id: string
          mine: boolean
          status: string
          submitted_at: string
          submitted_by: string
          total: number
          updated_at: string
        }[]
      }
      adm_save_form: {
        Args: { _d: Json; _id: string; _school: string }
        Returns: string
      }
      adm_save_request: {
        Args: { _answers: Json; _form: string; _id: string; _rev: number }
        Returns: Json
      }
      adm_set_form_status: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
      adm_submit_request: {
        Args: { _id: string; _rev: number }
        Returns: number
      }
      adm_summary: { Args: { _school: string }; Returns: Json }
      adm_task_ack: { Args: { _id: string }; Returns: undefined }
      adm_task_blocked: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      adm_task_candidates: {
        Args: { _school: string }
        Returns: {
          department: string
          department_id: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      adm_task_comment: {
        Args: { _body: string; _clarify: boolean; _client: string; _id: string }
        Returns: undefined
      }
      adm_task_complete: {
        Args: { _id: string; _note: string; _rev: number }
        Returns: number
      }
      adm_task_list: {
        Args: {
          _assignee: string
          _dept: string
          _from: string
          _limit: number
          _offset: number
          _priority: string
          _q: string
          _school: string
          _scope: string
          _status: string
          _to: string
        }
        Returns: {
          acknowledged: boolean
          assignee: string
          assignee_name: string
          assigner_name: string
          blocked: boolean
          department: string
          due_date: string
          id: string
          needs_me: boolean
          overdue: boolean
          priority: string
          progress: number
          start_date: string
          status: string
          title: string
          total: number
        }[]
      }
      adm_task_progress: {
        Args: { _id: string; _note: string; _progress: number; _rev: number }
        Returns: number
      }
      adm_task_review: {
        Args: { _action: string; _id: string; _reason: string; _rev: number }
        Returns: number
      }
      adm_task_update: {
        Args: {
          _assignee: string
          _due: string
          _id: string
          _reason: string
          _rev: number
        }
        Returns: number
      }
      affected_slots: {
        Args: { _absence: string }
        Returns: {
          period_id: string
          period_name: string
          section: string
          slot_id: string
          start_time: string
          subject: string
          substitute_name: string
          substitution_id: string
        }[]
      }
      archive_circular: { Args: { _id: string }; Returns: undefined }
      assign_substitute: {
        Args: {
          _absence: string
          _reason?: string
          _slot: string
          _substitute: string
        }
        Returns: string
      }
      assignment_live: {
        Args: { _end: string; _start: string }
        Returns: boolean
      }
      att_approver: { Args: { _school: string }; Returns: boolean }
      att_classify: {
        Args: {
          _local: string
          _p: Database["public"]["Tables"]["attendance_policies"]["Row"]
        }
        Returns: {
          late_minutes: number
          status: string
        }[]
      }
      att_classify_preview: {
        Args: { _at: string; _school: string }
        Returns: Json
      }
      att_counselor: { Args: { _school: string }; Returns: boolean }
      att_day_rows: {
        Args: { _from: string; _school: string; _status?: string; _to: string }
        Returns: {
          date: string
          escalated_at: string
          escalation_note: string
          first_in_at: string
          id: string
          late_minutes: number
          note: string
          section: string
          source: string
          status: string
          student_id: string
          student_name: string
        }[]
      }
      att_gate: { Args: { _school: string }; Returns: boolean }
      att_is_school_day: {
        Args: {
          _d: string
          _p: Database["public"]["Tables"]["attendance_policies"]["Row"]
        }
        Returns: boolean
      }
      att_scanner: { Args: { _school: string }; Returns: boolean }
      att_search_students: {
        Args: { _q: string; _school: string }
        Returns: {
          code: string
          full_name: string
          id: string
          section: string
        }[]
      }
      att_tick: {
        Args: { _limit?: number; _now?: string; _only?: string[] }
        Returns: number
      }
      att_tick_status: { Args: { _school: string }; Returns: Json }
      attendance_alerts: {
        Args: { _from: string; _min: number; _school: string; _to: string }
        Returns: {
          absent: number
          early_out: number
          late: number
          section: string
          student_id: string
          student_name: string
        }[]
      }
      attendance_board: {
        Args: { _date: string; _school: string }
        Returns: Json
      }
      attendance_compare: {
        Args: { _from: string; _org: string; _to: string }
        Returns: {
          absent: number
          attendance_rate: number
          completion_rate: number
          early_out: number
          excused: number
          expected: number
          late: number
          pending: number
          present: number
          records: number
          resolved: number
          school_id: string
          school_name: string
          unresolved: number
        }[]
      }
      attendance_policy: {
        Args: { _date: string; _school: string }
        Returns: {
          absence_review_at: string
          approver_roles: Database["public"]["Enums"]["app_role"][]
          arrival_open: string
          call_point: string
          created_at: string
          created_by: string | null
          day_end: string
          day_start: string
          effective_from: string
          extra_days: string[]
          grace_minutes: number
          guardian_cancel_until: string
          holidays: string[]
          id: string
          late_from: string
          notify_arrival: boolean
          org_id: string
          principal_editable: string[]
          school_id: string | null
          study_days: number[]
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "attendance_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      available_substitutes: {
        Args: { _date: string; _slot: string }
        Returns: {
          full_name: string
          same_department: boolean
          teacher_id: string
        }[]
      }
      build_absence_review: {
        Args: { _date: string; _school: string }
        Returns: number
      }
      call_next: {
        Args: { _school: string }
        Returns: {
          announce: string
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          pickup_id: string
          played_at: string | null
          played_by: string | null
          school_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "call_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      call_result: {
        Args: { _action: string; _error: string; _id: string }
        Returns: undefined
      }
      can_discuss_post: { Args: { _post: string }; Returns: boolean }
      can_invite: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _school: string
        }
        Returns: boolean
      }
      can_manage_circular: { Args: { _c: string }; Returns: boolean }
      can_manage_school: { Args: { _school: string }; Returns: boolean }
      can_manage_students: { Args: { _school: string }; Returns: boolean }
      can_read_circular: { Args: { _c: string }; Returns: boolean }
      can_read_conv_at: {
        Args: { _at: string; _conv: string }
        Returns: boolean
      }
      can_read_file: { Args: { _file: string }; Returns: boolean }
      can_read_homework: { Args: { _hw: string }; Returns: boolean }
      can_read_post: { Args: { _post: string }; Returns: boolean }
      can_see_profile: { Args: { _uid: string }; Returns: boolean }
      can_view_course: {
        Args: { _course: string; _school: string }
        Returns: boolean
      }
      can_view_slot: { Args: { _slot: string }; Returns: boolean }
      can_view_student: {
        Args: { _school: string; _student: string }
        Returns: boolean
      }
      cancel_pickup: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      cancel_substitution: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      change_member_role: {
        Args: {
          _department?: string
          _id: string
          _reason?: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      check_cleanup_health: {
        Args: { _channel?: string; _notify_to?: string[]; _now?: string }
        Returns: Json
      }
      checkin_student: {
        Args: { _school: string; _student: string }
        Returns: Json
      }
      circular_stats: {
        Args: { _id: string }
        Returns: {
          ack_required_version: number
          acked_at: string
          acked_version: number
          added_reason: string
          eligible: boolean
          full_name: string
          opened_at: string
          role: string
          school_id: string
          school_name: string
          user_id: string
        }[]
      }
      class_roster: {
        Args: { _section: string }
        Returns: {
          can_message: boolean
          conversation_id: string
          full_name: string
          has_account: boolean
          student_id: string
          unread: number
        }[]
      }
      classroom_members: {
        Args: { _classroom: string }
        Returns: {
          full_name: string
          member_type: string
          ref_id: string
        }[]
      }
      cleanup_health: { Args: never; Returns: Json }
      conv_access_ok: { Args: { _conv: string }; Returns: boolean }
      conv_send_block: { Args: { _conv: string }; Returns: string }
      conversation_people: {
        Args: { _conv: string }
        Returns: {
          full_name: string
          joined_at: string
          last_read_seq: number
          role: string
          source: string
          user_id: string
        }[]
      }
      copy_homework: { Args: { _course: string; _id: string }; Returns: string }
      copy_homework_template: {
        Args: {
          _available_from: string
          _course: string
          _due_at: string
          _id: string
          _title: string
        }
        Returns: string
      }
      correct_result: {
        Args: {
          _criteria: Json
          _feedback: string
          _reason: string
          _rev: number
          _score: number
          _sub: string
        }
        Returns: number
      }
      course_roster: {
        Args: { _course: string }
        Returns: {
          can_message: boolean
          conversation_id: string
          full_name: string
          has_account: boolean
          student_id: string
          unread: number
        }[]
      }
      create_admin_file: {
        Args: {
          _entity: string
          _id: string
          _mime: string
          _name: string
          _size: number
        }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_circular_file: {
        Args: { _circular: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_feedback_file: {
        Args: { _grade: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_group: {
        Args: {
          _allow_attachments: boolean
          _department: string
          _description: string
          _expires_at: string
          _group_type: string
          _history_policy: string
          _members: string[]
          _membership_mode: string
          _moderators: string[]
          _org: string
          _owner?: string
          _post_policy: string
          _request_key?: string
          _school: string
          _title: string
          _year: string
        }
        Returns: string
      }
      create_homework_file: {
        Args: { _hw: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_message_file: {
        Args: { _conv: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_organization: {
        Args: { _org_name: string; _school_name: string }
        Returns: string
      }
      create_pickup_file: {
        Args: { _mime: string; _name: string; _pickup: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_pickup_request: {
        Args: {
          _kind: string
          _person: string
          _planned_at: string
          _reason: string
          _student: string
        }
        Returns: string
      }
      create_post_file: {
        Args: {
          _category?: string
          _description?: string
          _mime: string
          _name: string
          _post: string
          _size: number
        }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_submission_file: {
        Args: { _hw: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      current_timetable: {
        Args: { _date: string; _school: string }
        Returns: string
      }
      decide_account_request: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: string
      }
      decide_assignment: {
        Args: { _approve: boolean; _id: string; _note?: string }
        Returns: undefined
      }
      decide_attendance_correction: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      decide_delegate: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      decide_late_joiner: {
        Args: { _approve: boolean; _due: string; _hw: string; _student: string }
        Returns: undefined
      }
      decide_pickup: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      decide_report: {
        Args: {
          _decision: string
          _hide?: boolean
          _id: string
          _status: string
        }
        Returns: undefined
      }
      delegate_reviews: {
        Args: { _school: string }
        Returns: {
          created_at: string
          guardian_name: string
          id: string
          id_last4: string
          kind: string
          phone: string
          pickup_name: string
          relationship: string
          section: string
          status: string
          student_name: string
          valid_until: string
        }[]
      }
      delete_message: { Args: { _id: string }; Returns: undefined }
      dept_teacher_ids: { Args: never; Returns: string[] }
      edit_message: { Args: { _body: string; _id: string }; Returns: undefined }
      end_assignment: { Args: { _id: string }; Returns: undefined }
      ensure_classroom: { Args: { _course: string }; Returns: string }
      escalate_absence: {
        Args: { _day: string; _reason: string }
        Returns: undefined
      }
      extend_homework: {
        Args: { _due: string; _id: string; _reason: string; _student: string }
        Returns: undefined
      }
      family_contacts: {
        Args: { _student: string }
        Returns: {
          full_name: string
          guardian_id: string
          relationship: string
        }[]
      }
      gb_approve: {
        Args: {
          _accept: boolean
          _gb: string
          _reason: string
          _revision?: number
        }
        Returns: undefined
      }
      gb_approve_plan: { Args: { _id: string }; Returns: undefined }
      gb_corrections_report: {
        Args: { _period: string; _school: string }
        Returns: {
          course_label: string
          decided_at: string
          decided_by: string
          decision_note: string
          evidence: string
          gradebook_id: string
          id: string
          item_name: string
          new_score: number
          new_status: string
          old_score: number
          old_status: string
          reason: string
          requested_at: string
          requested_by: string
          status: string
          student_name: string
        }[]
      }
      gb_decide_correction: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      gb_grant_exception: {
        Args: { _gb: string; _reason: string; _student: string; _until: string }
        Returns: string
      }
      gb_homework_preview: {
        Args: {
          _gb: string
          _homework: string[]
          _item: string
          _method?: string
          _missing?: string
        }
        Returns: Json
      }
      gb_new_plan_version: { Args: { _id: string }; Returns: string }
      gb_open: { Args: { _course: string; _period: string }; Returns: string }
      gb_org_summary: {
        Args: { _org: string }
        Returns: {
          approved: number
          draft: number
          gradebooks: number
          pending_corrections: number
          published: number
          reviewed: number
          school_id: string
          school_name: string
          submitted: number
        }[]
      }
      gb_overview: {
        Args: { _period: string; _school: string }
        Returns: {
          average: number
          cells: number
          computed: number
          course_id: string
          course_label: string
          department_id: string
          dept_missing: boolean
          drift: number
          filled: number
          gradebook_id: string
          missing: number
          pending_corrections: number
          revision: number
          section_id: string
          status: string
          students: number
          subject_id: string
          teacher_name: string
        }[]
      }
      gb_plan_impact: { Args: { _id: string }; Returns: Json }
      gb_publish: {
        Args: { _allow_incomplete?: boolean; _gb: string }
        Returns: number
      }
      gb_publish_preview: { Args: { _gb: string }; Returns: Json }
      gb_pull_homework: {
        Args: {
          _gb: string
          _homework: string[]
          _item: string
          _method?: string
          _missing?: string
        }
        Returns: number
      }
      gb_reopen: {
        Args: { _gb: string; _hours: number; _reason: string }
        Returns: undefined
      }
      gb_request_correction: {
        Args: {
          _evidence: string
          _gb: string
          _item: string
          _reason: string
          _score: number
          _status: string
          _student: string
        }
        Returns: string
      }
      gb_retire_plan: { Args: { _id: string }; Returns: undefined }
      gb_review: {
        Args: { _accept: boolean; _gb: string; _reason: string }
        Returns: undefined
      }
      gb_revoke_exception: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      gb_save_entries: {
        Args: {
          _atomic?: boolean
          _batch?: string
          _gb: string
          _rows: Json
          _source?: string
        }
        Returns: Json
      }
      gb_save_period: { Args: { _d: Json; _id: string }; Returns: string }
      gb_save_plan: { Args: { _d: Json; _id: string }; Returns: string }
      gb_set_entries: {
        Args: { _gb: string; _rows: Json; _source?: string }
        Returns: number
      }
      gb_set_note: {
        Args: { _gb: string; _note: string; _student: string }
        Returns: undefined
      }
      gb_set_period_status: {
        Args: { _id: string; _reason: string; _status: string }
        Returns: undefined
      }
      gb_sheet: { Args: { _gb: string }; Returns: Json }
      gb_submit: { Args: { _gb: string }; Returns: undefined }
      grade_submission: {
        Args: {
          _criteria: Json
          _feedback: string
          _final: boolean
          _rev: number
          _score: number
          _sub: string
        }
        Returns: number
      }
      guardian_contacts: {
        Args: { _student: string }
        Returns: {
          full_name: string
          kind: string
          label: string
          user_id: string
        }[]
      }
      handover_pickup: { Args: { _id: string }; Returns: undefined }
      has_school_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _school: string
        }
        Returns: boolean
      }
      homework_list: {
        Args: {
          _course: string
          _kind?: string
          _limit: number
          _offset: number
          _q: string
          _school: string
          _status: string
        }
        Returns: {
          available_from: string
          avg_pct: number
          course_id: string
          due_at: string
          id: string
          is_teacher: boolean
          kind: string
          late: number
          max_score: number
          not_submitted: number
          published_at: string
          published_results: number
          section: string
          status: string
          subject: string
          submitted: number
          targets: number
          title: string
          to_grade: number
          total: number
          unpublished: number
        }[]
      }
      homework_people: {
        Args: { _hw: string }
        Returns: {
          author_is_current: boolean
          author_name: string
          current_teachers: string[]
        }[]
      }
      homework_report: {
        Args: { _course: string; _kind: string }
        Returns: Json
      }
      hw_family: { Args: { _hw: string; _student: string }; Returns: boolean }
      hw_staff: { Args: { _hw: string }; Returns: boolean }
      hw_state: { Args: { _hw: string; _student: string }; Returns: Json }
      hw_teacher: { Args: { _hw: string }; Returns: boolean }
      hw_tick: { Args: never; Returns: Json }
      in_section: {
        Args: { _section: string; _year: string }
        Returns: boolean
      }
      invitation_preview: {
        Args: { _token: string }
        Returns: {
          email_confirmed: boolean
          email_hint: string
          email_matches: boolean
          role: Database["public"]["Enums"]["app_role"]
          school_name: string
          status: string
        }[]
      }
      invite_member: {
        Args: {
          _department?: string
          _email: string
          _role: Database["public"]["Enums"]["app_role"]
          _school: string
        }
        Returns: string
      }
      is_conv_member: { Args: { _conv: string }; Returns: boolean }
      is_course_teacher: { Args: { _course: string }; Returns: boolean }
      is_dept_course: { Args: { _course: string }; Returns: boolean }
      is_guardian_of: { Args: { _student: string }; Returns: boolean }
      is_org_owner: { Args: { _org: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_school_member: { Args: { _school: string }; Returns: boolean }
      is_school_principal: { Args: { _school: string }; Returns: boolean }
      is_student_self: { Args: { _student: string }; Returns: boolean }
      is_supervised_course: { Args: { _course: string }; Returns: boolean }
      is_supervised_student: { Args: { _student: string }; Returns: boolean }
      is_teacher_of_student: { Args: { _student: string }; Returns: boolean }
      issue_student_card: {
        Args: { _reason?: string; _student: string }
        Returns: string
      }
      late_joiners: {
        Args: { _hw: string }
        Returns: {
          due: string
          full_name: string
          join_status: string
          joined_at: string
          student_id: string
        }[]
      }
      leave_group: { Args: { _conv: string }; Returns: undefined }
      link_guardian_account: {
        Args: { _actor: string; _guardian: string; _uid: string }
        Returns: undefined
      }
      manual_attendance: {
        Args: { _reason: string; _status: string; _student: string }
        Returns: string
      }
      mark_conversation_read: {
        Args: { _conv: string; _seq: number }
        Returns: undefined
      }
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: number }
      my_class_groups: {
        Args: { _school: string }
        Returns: {
          conversation_id: string
          course_id: string
          last_at: string
          section_id: string
          section_label: string
          students: number
          subject: string
          teachers: string
          title: string
          unread: number
        }[]
      }
      my_conversations: {
        Args: { _school?: string }
        Returns: {
          allow_attachments: boolean
          allow_replies: boolean
          archived: boolean
          counterpart: string
          group_type: string
          id: string
          kind: string
          last_at: string
          last_body: string
          last_seq: number
          muted: boolean
          my_role: string
          post_policy: string
          school_id: string
          school_name: string
          section_id: string
          section_label: string
          send_block: string
          status: string
          student_name: string
          title: string
          unread: number
        }[]
      }
      my_dept_ids: { Args: never; Returns: string[] }
      my_teacher_ids: { Args: never; Returns: string[] }
      open_circular: { Args: { _id: string }; Returns: undefined }
      pickup_arrived: {
        Args: { _confirmed?: boolean; _id: string; _id_last4?: string }
        Returns: Json
      }
      pickup_delegate_detail: { Args: { _id: string }; Returns: Json }
      pickup_progress: {
        Args: { _id: string; _to: string }
        Returns: undefined
      }
      pickup_queue: {
        Args: { _school: string }
        Returns: {
          created_at: string
          delegate_mode: string
          delegate_status: string
          id: string
          kind: string
          phone_hint: string
          pickup_name: string
          pickup_national_id: string
          planned_at: string
          relationship: string
          section: string
          status: string
          student_id: string
          student_name: string
        }[]
      }
      pin_message: { Args: { _id: string; _pin: boolean }; Returns: undefined }
      prepare_template_files: {
        Args: { _files: string[]; _new: string }
        Returns: {
          dst_path: string
          file_id: string
          src_path: string
        }[]
      }
      present_now: {
        Args: { _school: string }
        Returns: {
          last_at: string
          last_kind: string
          section: string
          student_id: string
          student_name: string
        }[]
      }
      preview_circular_audience: {
        Args: {
          _aud: Json
          _school: string
          _schools?: string[]
          _scope?: string
        }
        Returns: {
          full_name: string
          included: boolean
          reason: string
          role: string
          school_id: string
          school_name: string
          user_id: string
        }[]
      }
      publish_circular: { Args: { _id: string }; Returns: number }
      publish_homework: { Args: { _id: string }; Returns: string }
      publish_results: {
        Args: { _hw: string; _subs: string[] }
        Returns: number
      }
      publish_timetable: {
        Args: { _effective_from: string; _id: string }
        Returns: number
      }
      record_absence: {
        Args: { _date: string; _note?: string; _teacher: string }
        Returns: string
      }
      record_paper_submission: {
        Args: {
          _hw: string
          _note: string
          _received: string
          _student: string
        }
        Returns: string
      }
      record_return: {
        Args: { _note: string; _student: string }
        Returns: undefined
      }
      remind_circular_ack: { Args: { _id: string }; Returns: number }
      remove_admin_file: { Args: { _file: string }; Returns: undefined }
      remove_feedback_file: { Args: { _file: string }; Returns: undefined }
      remove_group_member: {
        Args: { _conv: string; _user: string }
        Returns: undefined
      }
      remove_homework_file: { Args: { _file: string }; Returns: undefined }
      remove_pickup_file: { Args: { _file: string }; Returns: undefined }
      remove_submission_file: { Args: { _file: string }; Returns: undefined }
      reopen_circular: { Args: { _id: string }; Returns: undefined }
      report_detail: {
        Args: { _id: string }
        Returns: {
          body: string
          conversation_title: string
          deleted: boolean
          sender: string
          sent_at: string
        }[]
      }
      report_message: {
        Args: { _file?: string; _message: string; _reason: string }
        Returns: string
      }
      request_account: {
        Args: { _kind: string; _record: string }
        Returns: string
      }
      request_attendance_correction: {
        Args: {
          _day: string
          _new_late: number
          _new_status: string
          _reason: string
        }
        Returns: string
      }
      resend_invitation: { Args: { _id: string }; Returns: string }
      resolve_absence: {
        Args: { _day: string; _reason: string; _status: string }
        Returns: undefined
      }
      return_submission: {
        Args: { _reason: string; _sub: string }
        Returns: undefined
      }
      revise_circular: {
        Args: {
          _body: string
          _id: string
          _requires_new_ack: boolean
          _title: string
        }
        Returns: number
      }
      revise_homework: {
        Args: { _d: Json; _id: string; _note: string }
        Returns: number
      }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      revoke_student_card: {
        Args: { _card: string; _reason: string }
        Returns: undefined
      }
      run_file_cleanup: { Args: never; Returns: Json }
      save_attendance_policy: {
        Args: {
          _effective_from: string
          _org: string
          _school: string
          _v: Json
        }
        Returns: string
      }
      save_circular: {
        Args: {
          _ack_due: string
          _aud: Json
          _body: string
          _id: string
          _priority: string
          _publisher: string
          _requires_ack: boolean
          _school: string
          _schools?: string[]
          _scope?: string
          _title: string
        }
        Returns: string
      }
      save_homework: { Args: { _d: Json; _id: string }; Returns: string }
      save_submission_draft: {
        Args: { _body: string; _hw: string; _link: string }
        Returns: string
      }
      scan_attendance: {
        Args: { _school: string; _token: string }
        Returns: Json
      }
      schedule_teacher_names: {
        Args: { _timetable: string }
        Returns: {
          full_name: string
          teacher_id: string
        }[]
      }
      school_org: { Args: { _school: string }; Returns: string }
      school_today: { Args: never; Returns: string }
      search_messages: {
        Args: { _q: string; _school?: string }
        Returns: {
          body: string
          conv_title: string
          conversation_id: string
          created_at: string
          message_id: string
          seq: number
        }[]
      }
      send_message: {
        Args: {
          _body: string
          _client_id: string
          _conv: string
          _files?: string[]
          _reply_to?: string
        }
        Returns: {
          created_at: string
          id: string
          seq: number
        }[]
      }
      server_now: { Args: never; Returns: string }
      set_authorized_pickup_active: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      set_class_group_settings: {
        Args: {
          _allow_attachments: boolean
          _allow_replies: boolean
          _conv: string
          _post_policy: string
        }
        Returns: undefined
      }
      set_cleanup_credentials: {
        Args: { _key: string; _url: string }
        Returns: undefined
      }
      set_group_role: {
        Args: { _conv: string; _role: string; _user: string }
        Returns: undefined
      }
      set_group_status: {
        Args: { _conv: string; _status: string }
        Returns: undefined
      }
      set_homework_join_policy: {
        Args: { _days: number; _hw: string; _policy: string }
        Returns: undefined
      }
      set_homework_kind: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      set_homework_status: {
        Args: { _id: string; _reason: string; _status: string }
        Returns: undefined
      }
      set_member_prefs: {
        Args: { _archived: boolean; _conv: string; _muted: boolean }
        Returns: undefined
      }
      set_membership_active: {
        Args: { _active: boolean; _id: string; _reason?: string }
        Returns: undefined
      }
      set_staff_scope: {
        Args: {
          _departments: string[]
          _kind: string
          _school: string
          _teachers: string[]
          _user: string
        }
        Returns: undefined
      }
      staff_directory: {
        Args: { _org?: string; _school: string }
        Returns: {
          department: string
          department_id: string
          full_name: string
          role: Database["public"]["Enums"]["app_role"]
          school_name: string
          user_id: string
        }[]
      }
      staff_scope_list: {
        Args: { _school: string }
        Returns: {
          departments: string[]
          full_name: string
          kind: string
          teachers: string[]
          user_id: string
        }[]
      }
      staff_view: { Args: { _school: string }; Returns: boolean }
      start_direct_conversation: {
        Args: { _other: string; _school: string }
        Returns: string
      }
      start_family_conversation: {
        Args: { _guardian: string; _staff_user: string; _student: string }
        Returns: string
      }
      start_student_conversation: {
        Args: { _student: string }
        Returns: string
      }
      start_timetable_revision: { Args: { _id: string }; Returns: string }
      student_homework: {
        Args: { _student: string }
        Returns: {
          attempts: number
          available_from: string
          due_at: string
          effective_due: string
          id: string
          kind: string
          last_late: boolean
          last_submitted_at: string
          late_policy: string
          max_score: number
          removed: boolean
          result_published: boolean
          score: number
          status: string
          sub_status: string
          subject: string
          title: string
        }[]
      }
      submit_homework: {
        Args: { _client: string; _hw: string }
        Returns: string
      }
      submit_pickup_request: {
        Args: {
          _delegate: Json
          _kind: string
          _mode: string
          _person: string
          _planned_at: string
          _reason: string
          _student: string
        }
        Returns: string
      }
      supervised_teacher_ids: { Args: never; Returns: string[] }
      sync_course_group: { Args: { _course: string }; Returns: string }
      sync_derived_group: { Args: { _conv: string }; Returns: number }
      sync_section_group: { Args: { _section: string }; Returns: string }
      teacher_students: {
        Args: { _school: string }
        Returns: {
          full_name: string
          section: string
          student_id: string
          subject: string
        }[]
      }
      transfer_group_owner: {
        Args: { _conv: string; _user: string }
        Returns: undefined
      }
      tt_gen_apply: { Args: { _run: string; _slots: Json }; Returns: number }
      tt_gen_finish: {
        Args: { _run: string; _status: string; _summary: Json }
        Returns: undefined
      }
      tt_gen_ignore: { Args: { _run: string }; Returns: undefined }
      tt_gen_start: { Args: { _mode: string; _tt: string }; Returns: Json }
      tt_input: { Args: { _tt: string }; Returns: Json }
      tt_validate: {
        Args: { _tt: string }
        Returns: {
          code: string
          course_id: string
          message: string
          slot_id: string
        }[]
      }
      update_group_settings: {
        Args: {
          _allow_attachments: boolean
          _conv: string
          _description: string
          _expected: string
          _expires_at: string
          _history_policy: string
          _post_policy: string
          _title: string
        }
        Returns: string
      }
      update_pickup_delegate: {
        Args: { _delegate: Json; _id: string; _mode: string; _person: string }
        Returns: undefined
      }
      upsert_student_guardian: {
        Args: {
          _name: string
          _national_id: string
          _phone: string
          _relationship: string
          _student: string
        }
        Returns: {
          created: boolean
          guardian_id: string
          has_account: boolean
        }[]
      }
      verify_guardian_link: { Args: { _id: string }; Returns: undefined }
      vice_teacher_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      app_role:
        | "org_owner"
        | "principal"
        | "vice_principal"
        | "dept_head"
        | "supervisor"
        | "student_affairs"
        | "teacher"
        | "guardian"
        | "student"
        | "counselor"
        | "nurse"
        | "security"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "org_owner",
        "principal",
        "vice_principal",
        "dept_head",
        "supervisor",
        "student_affairs",
        "teacher",
        "guardian",
        "student",
        "counselor",
        "nurse",
        "security",
      ],
    },
  },
} as const
