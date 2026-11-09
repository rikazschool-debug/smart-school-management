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
      account_setup: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          kind: string
          membership_id: string | null
          need_password: boolean
          need_phone: boolean
          restore_active: boolean
          restore_ids: string[] | null
          school_id: string
          subject_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          kind: string
          membership_id?: string | null
          need_password?: boolean
          need_phone?: boolean
          restore_active?: boolean
          restore_ids?: string[] | null
          school_id: string
          subject_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          kind?: string
          membership_id?: string | null
          need_password?: boolean
          need_phone?: boolean
          restore_active?: boolean
          restore_ids?: string[] | null
          school_id?: string
          subject_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_setup_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_applications: {
        Row: {
          assignee: string | null
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision: string | null
          decision_note: string | null
          email: string | null
          first_contact_at: string | null
          first_taken_at: string | null
          grade: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          linked_at: string | null
          linked_by: string | null
          missing: string | null
          next_follow: string | null
          notes: string | null
          org_id: string
          phone_raw: string | null
          raw_school: string | null
          received_at: string
          ref: string
          rev: number
          school_id: string | null
          source: string
          source_key: string | null
          stage: string | null
          status: string
          student_id: string | null
          student_name: string
          submitted_at: string
          updated_at: string
          year_label: string | null
        }
        Insert: {
          assignee?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_note?: string | null
          email?: string | null
          first_contact_at?: string | null
          first_taken_at?: string | null
          grade?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          linked_at?: string | null
          linked_by?: string | null
          missing?: string | null
          next_follow?: string | null
          notes?: string | null
          org_id: string
          phone_raw?: string | null
          raw_school?: string | null
          received_at?: string
          ref: string
          rev?: number
          school_id?: string | null
          source?: string
          source_key?: string | null
          stage?: string | null
          status?: string
          student_id?: string | null
          student_name: string
          submitted_at?: string
          updated_at?: string
          year_label?: string | null
        }
        Update: {
          assignee?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision?: string | null
          decision_note?: string | null
          email?: string | null
          first_contact_at?: string | null
          first_taken_at?: string | null
          grade?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          linked_at?: string | null
          linked_by?: string | null
          missing?: string | null
          next_follow?: string | null
          notes?: string | null
          org_id?: string
          phone_raw?: string | null
          raw_school?: string | null
          received_at?: string
          ref?: string
          rev?: number
          school_id?: string | null
          source?: string
          source_key?: string | null
          stage?: string | null
          status?: string
          student_id?: string | null
          student_name?: string
          submitted_at?: string
          updated_at?: string
          year_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_applications_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_counters: {
        Row: {
          n: number
          org_id: string
          yr: number
        }
        Insert: {
          n?: number
          org_id: string
          yr: number
        }
        Update: {
          n?: number
          org_id?: string
          yr?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_events: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          app_id: string
          before: Json | null
          body: string | null
          channel: string | null
          client_key: string | null
          created_at: string
          id: string
          outcome: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          app_id: string
          before?: Json | null
          body?: string | null
          channel?: string | null
          client_key?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          app_id?: string
          before?: Json | null
          body?: string | null
          channel?: string | null
          client_key?: string | null
          created_at?: string
          id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_events_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "ad_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_nonces: {
        Row: {
          at: string
          nonce: string
          source_id: string
        }
        Insert: {
          at?: string
          nonce: string
          source_id: string
        }
        Update: {
          at?: string
          nonce?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_nonces_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ad_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_settings: {
        Row: {
          defaults: Json
          org_id: string
          school_map: Json
          stage_map: Json
          updated_at: string
          updated_by: string | null
          year_label: string | null
        }
        Insert: {
          defaults?: Json
          org_id: string
          school_map?: Json
          stage_map?: Json
          updated_at?: string
          updated_by?: string | null
          year_label?: string | null
        }
        Update: {
          defaults?: Json
          org_id?: string
          school_map?: Json
          stage_map?: Json
          updated_at?: string
          updated_by?: string | null
          year_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sources: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_seen_at: string | null
          name: string
          org_id: string
          rotated_at: string | null
          secret: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          name: string
          org_id: string
          rotated_at?: string | null
          secret: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_seen_at?: string | null
          name?: string
          org_id?: string
          rotated_at?: string | null
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_sources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          category: string | null
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
          via: string
        }
        Insert: {
          attendance_note?: string | null
          attended?: boolean | null
          ban_rule?: string | null
          banned?: boolean
          can_share?: boolean
          category?: string | null
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
          via?: string
        }
        Update: {
          attendance_note?: string | null
          attended?: boolean | null
          ban_rule?: string | null
          banned?: boolean
          can_share?: boolean
          category?: string | null
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
          via?: string
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
          audience: Json | null
          audience_fp: string | null
          cancel_reason: string | null
          client_id: string | null
          course_id: string | null
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
          audience?: Json | null
          audience_fp?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          course_id?: string | null
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
          audience?: Json | null
          audience_fp?: string | null
          cancel_reason?: string | null
          client_id?: string | null
          course_id?: string | null
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
            foreignKeyName: "adm_meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
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
      att_daily_settings: {
        Row: {
          school_id: string
          teacher_edit_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          school_id: string
          teacher_edit_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          school_id?: string
          teacher_edit_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "att_daily_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
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
          class_session_id: string | null
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
          class_session_id?: string | null
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
          class_session_id?: string | null
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
            foreignKeyName: "attendance_days_class_session_id_fkey"
            columns: ["class_session_id"]
            isOneToOne: false
            referencedRelation: "lesson_attendance"
            referencedColumns: ["id"]
          },
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
      bc_notice_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          details: Json
          id: string
          notice_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          details?: Json
          id?: string
          notice_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          details?: Json
          id?: string
          notice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_notice_log_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "bc_notices"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_notice_recipients: {
        Row: {
          category: string
          notice_id: string
          notified: boolean
          school_id: string
          user_id: string
        }
        Insert: {
          category: string
          notice_id: string
          notified?: boolean
          school_id: string
          user_id: string
        }
        Update: {
          category?: string
          notice_id?: string
          notified?: boolean
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_notice_recipients_notice_id_fkey"
            columns: ["notice_id"]
            isOneToOne: false
            referencedRelation: "bc_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_notice_recipients_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_notices: {
        Row: {
          body: string
          client_id: string | null
          copied_from: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          recipient_count: number | null
          ref: string | null
          rev: number
          sent_at: string | null
          sent_by: string | null
          status: string
          target: Json
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          client_id?: string | null
          copied_from?: string | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          recipient_count?: number | null
          ref?: string | null
          rev?: number
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          target?: Json
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          client_id?: string | null
          copied_from?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          recipient_count?: number | null
          ref?: string | null
          rev?: number
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          target?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_notices_copied_from_fkey"
            columns: ["copied_from"]
            isOneToOne: false
            referencedRelation: "bc_notices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_notices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      class_group_runs: {
        Row: {
          action: string
          actor: string | null
          after: Json
          before: Json
          created_at: string
          id: string
          school_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          after: Json
          before: Json
          created_at?: string
          id?: string
          school_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json
          before?: Json
          created_at?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_group_runs_school_id_fkey"
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
      classroom_regroup_runs: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          report: Json
          school_id: string | null
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          report: Json
          school_id?: string | null
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          report?: Json
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classroom_regroup_runs_school_id_fkey"
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
          section_room_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          school_id: string
          section_room_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          school_id?: string
          section_room_id?: string | null
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
          {
            foreignKeyName: "classrooms_section_room_id_fkey"
            columns: ["section_room_id"]
            isOneToOne: false
            referencedRelation: "section_rooms"
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
      conv_member_overrides: {
        Row: {
          actor: string | null
          added: boolean
          conversation_id: string
          created_at: string
          id: string
          reason: string | null
          removed: boolean
          role: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          actor?: string | null
          added?: boolean
          conversation_id: string
          created_at?: string
          id?: string
          reason?: string | null
          removed?: boolean
          role?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          actor?: string | null
          added?: boolean
          conversation_id?: string
          created_at?: string
          id?: string
          reason?: string | null
          removed?: boolean
          role?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conv_member_overrides_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
          reasons: string[]
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
          reasons?: string[]
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
          reasons?: string[]
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
      cs_auto_rules: {
        Row: {
          activated_at: string | null
          active: boolean
          body: string
          cooldown_hours: number
          created_at: string
          created_by: string | null
          hours: Json
          id: string
          kind: string
          name: string
          org_id: string
          priority: number
          recipient_roles: string[]
          school_ids: string[]
          sender_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activated_at?: string | null
          active?: boolean
          body: string
          cooldown_hours?: number
          created_at?: string
          created_by?: string | null
          hours?: Json
          id?: string
          kind: string
          name: string
          org_id: string
          priority?: number
          recipient_roles?: string[]
          school_ids?: string[]
          sender_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activated_at?: string | null
          active?: boolean
          body?: string
          cooldown_hours?: number
          created_at?: string
          created_by?: string | null
          hours?: Json
          id?: string
          kind?: string
          name?: string
          org_id?: string
          priority?: number
          recipient_roles?: string[]
          school_ids?: string[]
          sender_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_auto_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_auto_runs: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          org_id: string
          reply_message_id: string | null
          result: string
          rule_id: string
          trigger_message_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          org_id: string
          reply_message_id?: string | null
          result: string
          rule_id: string
          trigger_message_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          org_id?: string
          reply_message_id?: string | null
          result?: string
          rule_id?: string
          trigger_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_auto_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "cs_auto_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          org_id: string
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          org_id: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_replies: {
        Row: {
          active: boolean
          body: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          roles: string[]
          shortcut: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          roles?: string[]
          shortcut: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          roles?: string[]
          shortcut?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_replies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_settings: {
        Row: {
          attachments_enabled: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
          voice_enabled: boolean
          voice_max_bytes: number
          voice_max_sec: number
        }
        Insert: {
          attachments_enabled?: boolean
          org_id: string
          updated_at?: string
          updated_by?: string | null
          voice_enabled?: boolean
          voice_max_bytes?: number
          voice_max_sec?: number
        }
        Update: {
          attachments_enabled?: boolean
          org_id?: string
          updated_at?: string
          updated_by?: string | null
          voice_enabled?: boolean
          voice_max_bytes?: number
          voice_max_sec?: number
        }
        Relationships: [
          {
            foreignKeyName: "cs_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_batches: {
        Row: {
          applied_at: string
          applied_by: string
          changes: Json
          counts: Json
          file_hash: string
          id: string
          org_id: string
          school_id: string
          year_id: string
          year_name: string
        }
        Insert: {
          applied_at?: string
          applied_by: string
          changes?: Json
          counts?: Json
          file_hash: string
          id?: string
          org_id: string
          school_id: string
          year_id: string
          year_name: string
        }
        Update: {
          applied_at?: string
          applied_by?: string
          changes?: Json
          counts?: Json
          file_hash?: string
          id?: string
          org_id?: string
          school_id?: string
          year_id?: string
          year_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_batches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_batches_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_manual_log: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new: Json
          old: Json
          school_id: string
          student_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new: Json
          old: Json
          school_id: string
          student_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new?: Json
          old?: Json
          school_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ct_manual_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_manual_log_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_events: {
        Row: {
          action: string
          actor: string | null
          at: string
          details: Json | null
          id: number
          visit_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          details?: Json | null
          id?: number
          visit_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          details?: Json | null
          id?: number
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cv_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "cv_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      cv_visits: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          evaluator_id: string
          follow_up: string | null
          form_version: number
          id: string
          improvement_plan: string | null
          lesson: string | null
          notes: Json
          return_reason: string | null
          school_id: string
          scores: Json
          section: string | null
          status: string
          subject: string | null
          summary: string | null
          teacher_id: string
          updated_at: string
          version: number
          visit_date: string
          visit_type: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evaluator_id?: string
          follow_up?: string | null
          form_version?: number
          id?: string
          improvement_plan?: string | null
          lesson?: string | null
          notes?: Json
          return_reason?: string | null
          school_id: string
          scores?: Json
          section?: string | null
          status?: string
          subject?: string | null
          summary?: string | null
          teacher_id: string
          updated_at?: string
          version?: number
          visit_date: string
          visit_type?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          evaluator_id?: string
          follow_up?: string | null
          form_version?: number
          id?: string
          improvement_plan?: string | null
          lesson?: string | null
          notes?: Json
          return_reason?: string | null
          school_id?: string
          scores?: Json
          section?: string | null
          status?: string
          subject?: string | null
          summary?: string | null
          teacher_id?: string
          updated_at?: string
          version?: number
          visit_date?: string
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cv_visits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cv_visits_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
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
      ev_forms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          items: Json
          kind: string
          needs_owner_approval: boolean
          org_id: string
          published_at: string | null
          role_key: string
          status: string
          title: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          items: Json
          kind: string
          needs_owner_approval?: boolean
          org_id: string
          published_at?: string | null
          role_key?: string
          status?: string
          title: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          items?: Json
          kind?: string
          needs_owner_approval?: boolean
          org_id?: string
          published_at?: string | null
          role_key?: string
          status?: string
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ev_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_guardian: {
        Row: {
          answers: Json
          comment: string | null
          created_at: string
          form_id: string
          form_snapshot: Json
          guardian_user: string
          id: string
          revision: number
          school_id: string
          student_id: string
          teacher_id: string
          updated_at: string
          year_id: string
        }
        Insert: {
          answers: Json
          comment?: string | null
          created_at?: string
          form_id: string
          form_snapshot: Json
          guardian_user: string
          id?: string
          revision?: number
          school_id: string
          student_id: string
          teacher_id: string
          updated_at?: string
          year_id: string
        }
        Update: {
          answers?: Json
          comment?: string | null
          created_at?: string
          form_id?: string
          form_snapshot?: Json
          guardian_user?: string
          id?: string
          revision?: number
          school_id?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
          year_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ev_guardian_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ev_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ev_guardian_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ev_guardian_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ev_guardian_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ev_guardian_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_guardian_hist: {
        Row: {
          answers: Json
          comment: string | null
          form_id: string
          id: number
          rating_id: string
          revision: number
          saved_at: string
        }
        Insert: {
          answers: Json
          comment?: string | null
          form_id: string
          id?: number
          rating_id: string
          revision: number
          saved_at: string
        }
        Update: {
          answers?: Json
          comment?: string | null
          form_id?: string
          id?: number
          rating_id?: string
          revision?: number
          saved_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ev_guardian_hist_rating_id_fkey"
            columns: ["rating_id"]
            isOneToOne: false
            referencedRelation: "ev_guardian"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_log: {
        Row: {
          action: string
          actor: string | null
          at: string
          details: Json | null
          entity: string | null
          id: number
          org_id: string | null
          school_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          details?: Json | null
          entity?: string | null
          id?: number
          org_id?: string | null
          school_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          details?: Json | null
          entity?: string | null
          id?: number
          org_id?: string | null
          school_id?: string | null
        }
        Relationships: []
      }
      ev_monthly: {
        Row: {
          answers: Json
          approved_at: string | null
          created_at: string
          evaluator: string
          form_id: string
          form_snapshot: Json
          id: string
          month: string
          na_reasons: Json
          notes: string | null
          role_key: string
          school_id: string
          staff_user: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          answers: Json
          approved_at?: string | null
          created_at?: string
          evaluator?: string
          form_id: string
          form_snapshot: Json
          id?: string
          month: string
          na_reasons?: Json
          notes?: string | null
          role_key: string
          school_id: string
          staff_user: string
          status?: string
          updated_at?: string
          version?: number
        }
        Update: {
          answers?: Json
          approved_at?: string | null
          created_at?: string
          evaluator?: string
          form_id?: string
          form_snapshot?: Json
          id?: string
          month?: string
          na_reasons?: Json
          notes?: string | null
          role_key?: string
          school_id?: string
          staff_user?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ev_monthly_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "ev_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ev_monthly_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_monthly_hist: {
        Row: {
          actor: string | null
          answers: Json
          at: string
          id: number
          monthly_id: string
          na_reasons: Json | null
          notes: string | null
          reason: string | null
          version: number
        }
        Insert: {
          actor?: string | null
          answers: Json
          at?: string
          id?: number
          monthly_id: string
          na_reasons?: Json | null
          notes?: string | null
          reason?: string | null
          version: number
        }
        Update: {
          actor?: string | null
          answers?: Json
          at?: string
          id?: number
          monthly_id?: string
          na_reasons?: Json | null
          notes?: string | null
          reason?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ev_monthly_hist_monthly_id_fkey"
            columns: ["monthly_id"]
            isOneToOne: false
            referencedRelation: "ev_monthly"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_platform_access: {
        Row: {
          granted_at: string
          granted_note: string
          org_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_note: string
          org_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_note?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ev_platform_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_settings: {
        Row: {
          due_day: number
          org_id: string
          reminders: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          due_day?: number
          org_id: string
          reminders?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          due_day?: number
          org_id?: string
          reminders?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ev_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ev_tick_runs: {
        Row: {
          day: string
          ran_at: string
          sent: number
        }
        Insert: {
          day: string
          ran_at?: string
          sent?: number
        }
        Update: {
          day?: string
          ran_at?: string
          sent?: number
        }
        Relationships: []
      }
      evt_app_notes: {
        Row: {
          app_id: string
          body: string
          created_at: string
          created_by: string
          id: string
        }
        Insert: {
          app_id: string
          body: string
          created_at?: string
          created_by: string
          id?: string
        }
        Update: {
          app_id?: string
          body?: string
          created_at?: string
          created_by?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_app_notes_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "evt_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_applications: {
        Row: {
          answers: Json
          applicant_message: string | null
          applicant_user: string | null
          birth_date: string | null
          category: string
          client_key: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string | null
          fields: Json
          form_version: number
          guardian_name: string | null
          id: string
          item_id: string
          name_key: string | null
          org_id: string
          participant_name: string
          phone: string | null
          reason_internal: string | null
          ref: string
          rev: number
          school_id: string
          source: string
          status: string
          student_id: string | null
          track_hash: string | null
          updated_at: string
        }
        Insert: {
          answers: Json
          applicant_message?: string | null
          applicant_user?: string | null
          birth_date?: string | null
          category: string
          client_key?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string | null
          fields: Json
          form_version: number
          guardian_name?: string | null
          id?: string
          item_id: string
          name_key?: string | null
          org_id: string
          participant_name: string
          phone?: string | null
          reason_internal?: string | null
          ref: string
          rev?: number
          school_id: string
          source: string
          status?: string
          student_id?: string | null
          track_hash?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          applicant_message?: string | null
          applicant_user?: string | null
          birth_date?: string | null
          category?: string
          client_key?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string | null
          fields?: Json
          form_version?: number
          guardian_name?: string | null
          id?: string
          item_id?: string
          name_key?: string | null
          org_id?: string
          participant_name?: string
          phone?: string | null
          reason_internal?: string | null
          ref?: string
          rev?: number
          school_id?: string
          source?: string
          status?: string
          student_id?: string | null
          track_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_applications_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_applications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_attendance: {
        Row: {
          app_id: string | null
          id: string
          marked_by: string | null
          session_id: string
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          app_id?: string | null
          id?: string
          marked_by?: string | null
          session_id: string
          status: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          app_id?: string | null
          id?: string
          marked_by?: string | null
          session_id?: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_attendance_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "evt_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "evt_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_consents: {
        Row: {
          decided_at: string
          decision: string
          emergency_name: string | null
          emergency_phone: string | null
          guardian_user: string
          item_id: string
          medical_ack: boolean
          medical_note: string | null
          student_id: string
        }
        Insert: {
          decided_at?: string
          decision: string
          emergency_name?: string | null
          emergency_phone?: string | null
          guardian_user: string
          item_id: string
          medical_ack?: boolean
          medical_note?: string | null
          student_id: string
        }
        Update: {
          decided_at?: string
          decision?: string
          emergency_name?: string | null
          emergency_phone?: string | null
          guardian_user?: string
          item_id?: string
          medical_ack?: boolean
          medical_note?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_consents_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_form_versions: {
        Row: {
          fields: Json
          form_id: string
          published_at: string
          published_by: string | null
          version: number
        }
        Insert: {
          fields: Json
          form_id: string
          published_at?: string
          published_by?: string | null
          version: number
        }
        Update: {
          fields?: Json
          form_id?: string
          published_at?: string
          published_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "evt_form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "evt_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_forms: {
        Row: {
          created_at: string
          draft: Json
          draft_rev: number
          id: string
          item_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          item_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          item_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "evt_forms_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_hits: {
        Row: {
          at: string
          bucket: string
          id: number
        }
        Insert: {
          at?: string
          bucket: string
          id?: number
        }
        Update: {
          at?: string
          bucket?: string
          id?: number
        }
        Relationships: []
      }
      evt_items: {
        Row: {
          apply_tpl_version: string | null
          audience: string
          cancel_reason: string | null
          capacity: number | null
          category: string | null
          conditions: string | null
          consent_deadline: string | null
          consent_required: boolean
          created_at: string
          created_by: string
          description: string | null
          extra: Json
          extra_fields: Json
          id: string
          kind: string
          link_active: boolean
          location: string | null
          mode: string
          need_emergency: boolean
          need_medical: boolean
          org_id: string
          public_token: string | null
          published_at: string | null
          reg_closes: string | null
          reg_open: boolean
          reg_opens: string | null
          rev: number
          school_id: string
          status: string
          target: Json
          title: string
          tpl_version: string | null
          trainer: string | null
          updated_at: string
        }
        Insert: {
          apply_tpl_version?: string | null
          audience?: string
          cancel_reason?: string | null
          capacity?: number | null
          category?: string | null
          conditions?: string | null
          consent_deadline?: string | null
          consent_required?: boolean
          created_at?: string
          created_by: string
          description?: string | null
          extra?: Json
          extra_fields?: Json
          id?: string
          kind: string
          link_active?: boolean
          location?: string | null
          mode?: string
          need_emergency?: boolean
          need_medical?: boolean
          org_id: string
          public_token?: string | null
          published_at?: string | null
          reg_closes?: string | null
          reg_open?: boolean
          reg_opens?: string | null
          rev?: number
          school_id: string
          status?: string
          target?: Json
          title: string
          tpl_version?: string | null
          trainer?: string | null
          updated_at?: string
        }
        Update: {
          apply_tpl_version?: string | null
          audience?: string
          cancel_reason?: string | null
          capacity?: number | null
          category?: string | null
          conditions?: string | null
          consent_deadline?: string | null
          consent_required?: boolean
          created_at?: string
          created_by?: string
          description?: string | null
          extra?: Json
          extra_fields?: Json
          id?: string
          kind?: string
          link_active?: boolean
          location?: string | null
          mode?: string
          need_emergency?: boolean
          need_medical?: boolean
          org_id?: string
          public_token?: string | null
          published_at?: string | null
          reg_closes?: string | null
          reg_open?: boolean
          reg_opens?: string | null
          rev?: number
          school_id?: string
          status?: string
          target?: Json
          title?: string
          tpl_version?: string | null
          trainer?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_items_apply_tpl_version_fkey"
            columns: ["apply_tpl_version"]
            isOneToOne: false
            referencedRelation: "evt_tpl_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_items_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_items_tpl_version_fkey"
            columns: ["tpl_version"]
            isOneToOne: false
            referencedRelation: "evt_tpl_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_log: {
        Row: {
          action: string
          actor: string | null
          app_id: string | null
          created_at: string
          details: Json
          id: string
          internal: boolean
          item_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          app_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          internal?: boolean
          item_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          app_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          internal?: boolean
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_log_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "evt_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_log_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_outbox: {
        Row: {
          app_id: string
          attempts: number
          created_at: string
          dedupe_key: string
          detail: string | null
          id: string
          item_id: string
          kind: string
          params: Json
          phone: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          app_id: string
          attempts?: number
          created_at?: string
          dedupe_key: string
          detail?: string | null
          id?: string
          item_id: string
          kind: string
          params?: Json
          phone: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          app_id?: string
          attempts?: number
          created_at?: string
          dedupe_key?: string
          detail?: string | null
          id?: string
          item_id?: string
          kind?: string
          params?: Json
          phone?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_outbox_app_id_fkey"
            columns: ["app_id"]
            isOneToOne: false
            referencedRelation: "evt_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_sessions: {
        Row: {
          ends_at: string | null
          id: string
          item_id: string
          location: string | null
          seq: number
          starts_at: string
          title: string | null
        }
        Insert: {
          ends_at?: string | null
          id?: string
          item_id: string
          location?: string | null
          seq?: number
          starts_at: string
          title?: string | null
        }
        Update: {
          ends_at?: string | null
          id?: string
          item_id?: string
          location?: string | null
          seq?: number
          starts_at?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evt_sessions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_staff: {
        Row: {
          caps: string[]
          created_at: string
          granted_by: string | null
          item_id: string
          user_id: string
        }
        Insert: {
          caps: string[]
          created_at?: string
          granted_by?: string | null
          item_id: string
          user_id: string
        }
        Update: {
          caps?: string[]
          created_at?: string
          granted_by?: string | null
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_staff_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "evt_items"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_tpl_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          id: string
          tpl_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          tpl_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          tpl_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evt_tpl_log_tpl_id_fkey"
            columns: ["tpl_id"]
            isOneToOne: false
            referencedRelation: "evt_tpls"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_tpl_versions: {
        Row: {
          body: Json
          id: string
          published_at: string
          published_by: string | null
          tpl_id: string
          version: number
        }
        Insert: {
          body: Json
          id?: string
          published_at?: string
          published_by?: string | null
          tpl_id: string
          version: number
        }
        Update: {
          body?: Json
          id?: string
          published_at?: string
          published_by?: string | null
          tpl_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "evt_tpl_versions_tpl_id_fkey"
            columns: ["tpl_id"]
            isOneToOne: false
            referencedRelation: "evt_tpls"
            referencedColumns: ["id"]
          },
        ]
      }
      evt_tpls: {
        Row: {
          created_at: string
          draft: Json
          draft_rev: number
          id: string
          kind: string
          org_id: string
          school_id: string | null
          updated_at: string
          updated_by: string | null
          use_custom: boolean
          version: number
        }
        Insert: {
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          kind: string
          org_id: string
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
          use_custom?: boolean
          version?: number
        }
        Update: {
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          kind?: string
          org_id?: string
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
          use_custom?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "evt_tpls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evt_tpls_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
          duration_sec: number | null
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
          duration_sec?: number | null
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
          duration_sec?: number | null
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
      fin_branch_pay: {
        Row: {
          banks: Json
          created_at: string
          links: Json
          note: string | null
          org_id: string
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          banks?: Json
          created_at?: string
          links?: Json
          note?: string | null
          org_id: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          banks?: Json
          created_at?: string
          links?: Json
          note?: string | null
          org_id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_branch_pay_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_branch_pay_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_pay_log: {
        Row: {
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          school_id: string
        }
        Insert: {
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          school_id: string
        }
        Update: {
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_pay_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_student_accounts: {
        Row: {
          balance: number
          created_at: string
          currency: string
          school_id: string
          source: string
          student_id: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency?: string
          school_id: string
          source: string
          student_id: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency?: string
          school_id?: string
          source?: string
          student_id?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_student_accounts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_student_accounts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_student_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string
          ref: string | null
          school_id: string
          source: string
          student_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at: string
          ref?: string | null
          school_id: string
          source: string
          student_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          ref?: string | null
          school_id?: string
          source?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_student_payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_student_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      guardian_phone_log: {
        Row: {
          changed_by: string | null
          created_at: string
          guardian_id: string
          id: string
          new_phone: string | null
          old_phone: string | null
          school_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          guardian_id: string
          id?: string
          new_phone?: string | null
          old_phone?: string | null
          school_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          guardian_id?: string
          id?: string
          new_phone?: string | null
          old_phone?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardian_phone_log_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          created_at: string
          display_name: string | null
          display_name_manual: boolean
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
          display_name?: string | null
          display_name_manual?: boolean
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
          display_name?: string | null
          display_name_manual?: boolean
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
      gv_closures: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          on_date: string
          reason: string | null
          school_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          on_date: string
          reason?: string | null
          school_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          on_date?: string
          reason?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_closures_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          id: string
          internal: boolean
          visit_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          internal?: boolean
          visit_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          id?: string
          internal?: boolean
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_events_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "gv_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_settings: {
        Row: {
          days: number[]
          enabled: boolean
          end_time: string
          school_id: string
          slot_minutes: number
          start_time: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          days?: number[]
          enabled?: boolean
          end_time?: string
          school_id: string
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          days?: number[]
          enabled?: boolean
          end_time?: string
          school_id?: string
          slot_minutes?: number
          start_time?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gv_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      gv_signals: {
        Row: {
          at: string
          id: number
          school_id: string
          visit_id: string
        }
        Insert: {
          at?: string
          id?: number
          school_id: string
          visit_id: string
        }
        Update: {
          at?: string
          id?: number
          school_id?: string
          visit_id?: string
        }
        Relationships: []
      }
      gv_visits: {
        Row: {
          arrived_at: string | null
          awaiting: string | null
          conf_date: string | null
          conf_time: string | null
          created_at: string
          created_by: string
          decision_reason: string | null
          details: string | null
          guardian_id: string
          guardian_user: string
          host_id: string | null
          id: string
          internal_note: string | null
          left_at: string | null
          org_id: string
          proposed_by: string | null
          reason_cat: string
          rev: number
          school_id: string
          slot_date: string
          slot_time: string
          source: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          awaiting?: string | null
          conf_date?: string | null
          conf_time?: string | null
          created_at?: string
          created_by: string
          decision_reason?: string | null
          details?: string | null
          guardian_id: string
          guardian_user: string
          host_id?: string | null
          id?: string
          internal_note?: string | null
          left_at?: string | null
          org_id: string
          proposed_by?: string | null
          reason_cat: string
          rev?: number
          school_id: string
          slot_date: string
          slot_time: string
          source: string
          status: string
          student_id: string
          updated_at?: string
        }
        Update: {
          arrived_at?: string | null
          awaiting?: string | null
          conf_date?: string | null
          conf_time?: string | null
          created_at?: string
          created_by?: string
          decision_reason?: string | null
          details?: string | null
          guardian_id?: string
          guardian_user?: string
          host_id?: string | null
          id?: string
          internal_note?: string | null
          left_at?: string | null
          org_id?: string
          proposed_by?: string | null
          reason_cat?: string
          rev?: number
          school_id?: string
          slot_date?: string
          slot_time?: string
          source?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gv_visits_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gv_visits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gv_visits_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gv_visits_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
      hr_advance_moves: {
        Row: {
          advance_id: string
          amount: number
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          key: string
          kind: string
          month: string | null
          org_id: string
          reason: string | null
          run_id: string | null
        }
        Insert: {
          advance_id: string
          amount: number
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          key: string
          kind: string
          month?: string | null
          org_id: string
          reason?: string | null
          run_id?: string | null
        }
        Update: {
          advance_id?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          key?: string
          kind?: string
          month?: string | null
          org_id?: string
          reason?: string | null
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_advance_moves_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "hr_advances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_advance_moves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_advance_moves_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_advances: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          employee_id: string
          id: string
          installment_amount: number
          installments: number
          org_id: string
          paid_at: string | null
          paid_by: string | null
          payment_ref: string | null
          payment_status: string
          reason: string
          requested_at: string
          requested_by: string
          rev: number
          self_request: boolean
          start_month: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          employee_id: string
          id?: string
          installment_amount: number
          installments: number
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          payment_status?: string
          reason: string
          requested_at?: string
          requested_by: string
          rev?: number
          self_request?: boolean
          start_month: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          employee_id?: string
          id?: string
          installment_amount?: number
          installments?: number
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          payment_status?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          rev?: number
          self_request?: boolean
          start_month?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_advances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_advances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_asset_custodies: {
        Row: {
          ack_at: string | null
          asset_id: string
          close_note: string | null
          closed_at: string | null
          closed_by: string | null
          condition_in: string | null
          condition_out: string
          employee_id: string
          handed_at: string
          handed_by: string | null
          id: string
          org_id: string
          outcome: string | null
        }
        Insert: {
          ack_at?: string | null
          asset_id: string
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          condition_in?: string | null
          condition_out: string
          employee_id: string
          handed_at?: string
          handed_by?: string | null
          id?: string
          org_id: string
          outcome?: string | null
        }
        Update: {
          ack_at?: string | null
          asset_id?: string
          close_note?: string | null
          closed_at?: string | null
          closed_by?: string | null
          condition_in?: string | null
          condition_out?: string
          employee_id?: string
          handed_at?: string
          handed_by?: string | null
          id?: string
          org_id?: string
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_asset_custodies_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "hr_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_asset_custodies_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_asset_custodies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_assets: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          school_id: string
          serial: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          school_id: string
          serial?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          school_id?: string
          serial?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_assets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_assignments: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          department: string | null
          employee_id: string
          end_date: string | null
          id: string
          is_primary: boolean
          job_title: string | null
          manager_id: string | null
          manager_kind: string | null
          org_id: string
          school_id: string | null
          start_date: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          manager_id?: string | null
          manager_kind?: string | null
          org_id: string
          school_id?: string | null
          start_date: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          department?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          manager_id?: string | null
          manager_kind?: string | null
          org_id?: string
          school_id?: string | null
          start_date?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_assignments_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "hr_job_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assignments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assignments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_close_log: {
        Row: {
          action: string
          at: string
          by: string | null
          date: string
          id: string
          org_id: string
          reason: string | null
          school_id: string
        }
        Insert: {
          action: string
          at?: string
          by?: string | null
          date: string
          id?: string
          org_id: string
          reason?: string | null
          school_id: string
        }
        Update: {
          action?: string
          at?: string
          by?: string | null
          date?: string
          id?: string
          org_id?: string
          reason?: string | null
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_close_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_close_log_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_corrections: {
        Row: {
          at: string | null
          created_at: string
          date: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          employee_id: string
          id: string
          kind: string
          org_id: string
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          at?: string | null
          created_at?: string
          date: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          employee_id: string
          id?: string
          kind: string
          org_id: string
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          at?: string | null
          created_at?: string
          date?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          employee_id?: string
          id?: string
          kind?: string
          org_id?: string
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_corrections_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_corrections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_days: {
        Row: {
          computed_at: string
          date: string
          duplicates: number
          early_min: number
          employee_id: string
          first_in: string | null
          last_out: string | null
          late_min: number
          org_id: string
          punches: number
          school_id: string | null
          shift_id: string | null
          status: string
          worked_min: number
        }
        Insert: {
          computed_at?: string
          date: string
          duplicates?: number
          early_min?: number
          employee_id: string
          first_in?: string | null
          last_out?: string | null
          late_min?: number
          org_id: string
          punches?: number
          school_id?: string | null
          shift_id?: string | null
          status: string
          worked_min?: number
        }
        Update: {
          computed_at?: string
          date?: string
          duplicates?: number
          early_min?: number
          employee_id?: string
          first_in?: string | null
          last_out?: string | null
          late_min?: number
          org_id?: string
          punches?: number
          school_id?: string | null
          shift_id?: string | null
          status?: string
          worked_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_days_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_days_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_days_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_devices: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_seen: string | null
          name: string
          org_id: string
          school_id: string | null
          secret: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string | null
          name: string
          org_id: string
          school_id?: string | null
          secret: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_seen?: string | null
          name?: string
          org_id?: string
          school_id?: string | null
          secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_devices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_devices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          name: string
          org_id: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          name: string
          org_id: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          name?: string
          org_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_holidays_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_punches: {
        Row: {
          accuracy_m: number | null
          at: string
          created_at: string
          created_by: string | null
          device_id: string | null
          distance_m: number | null
          employee_id: string
          id: string
          key: string
          org_id: string
          reason: string | null
          school_id: string | null
          source: string
        }
        Insert: {
          accuracy_m?: number | null
          at: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          distance_m?: number | null
          employee_id: string
          id?: string
          key: string
          org_id: string
          reason?: string | null
          school_id?: string | null
          source: string
        }
        Update: {
          accuracy_m?: number | null
          at?: string
          created_at?: string
          created_by?: string | null
          device_id?: string | null
          distance_m?: number | null
          employee_id?: string
          id?: string
          key?: string
          org_id?: string
          reason?: string | null
          school_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_punches_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "hr_att_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_punches_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_punches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_punches_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_settings: {
        Row: {
          allow_self_punch: boolean
          org_id: string
          require_location: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_self_punch?: boolean
          org_id: string
          require_location?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_self_punch?: boolean
          org_id?: string
          require_location?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_att_sites: {
        Row: {
          lat: number
          lng: number
          max_accuracy_m: number
          org_id: string
          radius_m: number
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          lat: number
          lng: number
          max_accuracy_m: number
          org_id: string
          radius_m: number
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          lat?: number
          lng?: number
          max_accuracy_m?: number
          org_id?: string
          radius_m?: number
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_att_sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_att_sites_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contract_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_contract_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contract_versions: {
        Row: {
          ack_at: string | null
          ack_by: string | null
          ack_reason: string | null
          ack_source: string | null
          contract_id: string
          created_at: string
          created_by: string | null
          data: Json
          effective_from: string
          id: string
          issued_at: string | null
          issued_by: string | null
          reason: string | null
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          ack_at?: string | null
          ack_by?: string | null
          ack_reason?: string | null
          ack_source?: string | null
          contract_id: string
          created_at?: string
          created_by?: string | null
          data: Json
          effective_from: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version: number
        }
        Update: {
          ack_at?: string | null
          ack_by?: string | null
          ack_reason?: string | null
          ack_source?: string | null
          contract_id?: string
          created_at?: string
          created_by?: string | null
          data?: Json
          effective_from?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_contracts: {
        Row: {
          contract_no: string
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          end_reason: string | null
          ended_on: string | null
          id: string
          in_force: number | null
          org_id: string
          parent_id: string | null
          school_id: string
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          contract_no: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          end_reason?: string | null
          ended_on?: string | null
          id?: string
          in_force?: number | null
          org_id: string
          parent_id?: string | null
          school_id: string
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          contract_no?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          end_reason?: string | null
          ended_on?: string | null
          id?: string
          in_force?: number | null
          org_id?: string
          parent_id?: string | null
          school_id?: string
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_contracts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contracts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contracts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_contracts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_decisions: {
        Row: {
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          created_at: string
          created_by: string
          employee_id: string
          from_month: string
          hours: number | null
          id: string
          item_id: string
          kind: string
          mode: string
          org_id: string
          reason: string
          rev: number
          status: string
          to_month: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          created_at?: string
          created_by: string
          employee_id: string
          from_month: string
          hours?: number | null
          id?: string
          item_id: string
          kind: string
          mode: string
          org_id: string
          reason: string
          rev?: number
          status?: string
          to_month?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          created_at?: string
          created_by?: string
          employee_id?: string
          from_month?: string
          hours?: number | null
          id?: string
          item_id?: string
          kind?: string
          mode?: string
          org_id?: string
          reason?: string
          rev?: number
          status?: string
          to_month?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_decisions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_decisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "hr_pay_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_doc_types: {
        Row: {
          alert_days: number[]
          confidential: boolean
          created_at: string
          employee_upload: boolean
          id: string
          is_active: boolean
          name: string
          needs_expiry: boolean
          needs_number: boolean
          org_id: string
          required_all: boolean
          required_kinds: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_days?: number[]
          confidential?: boolean
          created_at?: string
          employee_upload?: boolean
          id?: string
          is_active?: boolean
          name: string
          needs_expiry?: boolean
          needs_number?: boolean
          org_id: string
          required_all?: boolean
          required_kinds?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_days?: number[]
          confidential?: boolean
          created_at?: string
          employee_upload?: boolean
          id?: string
          is_active?: boolean
          name?: string
          needs_expiry?: boolean
          needs_number?: boolean
          org_id?: string
          required_all?: boolean
          required_kinds?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_doc_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_document_versions: {
        Row: {
          doc_no: string | null
          document_id: string
          expires_on: string | null
          file_id: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string | null
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          doc_no?: string | null
          document_id: string
          expires_on?: string | null
          file_id?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string | null
          uploaded_at?: string
          uploaded_by: string
          version: number
        }
        Update: {
          doc_no?: string | null
          document_id?: string
          expires_on?: string | null
          file_id?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string | null
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          accepted_version: number | null
          contract_id: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          id: string
          org_id: string
          type_id: string
          updated_at: string
        }
        Insert: {
          accepted_version?: number | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          id?: string
          org_id: string
          type_id: string
          updated_at?: string
        }
        Update: {
          accepted_version?: number | null
          contract_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          id?: string
          org_id?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "hr_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "hr_doc_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_addresses: {
        Row: {
          building: string | null
          city: string | null
          created_at: string
          details: string | null
          district: string | null
          employee_id: string
          org_id: string
          postal_code: string | null
          street: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          building?: string | null
          city?: string | null
          created_at?: string
          details?: string | null
          district?: string | null
          employee_id: string
          org_id: string
          postal_code?: string | null
          street?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          building?: string | null
          city?: string | null
          created_at?: string
          details?: string | null
          district?: string | null
          employee_id?: string
          org_id?: string
          postal_code?: string | null
          street?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_addresses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_addresses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_profile: {
        Row: {
          address: string | null
          assignment_note: string | null
          bank_name: string | null
          education: string | null
          employee_id: string
          has_licence: string | null
          iban: string | null
          id_expiry: string | null
          id_expiry_cal: string | null
          id_type: string | null
          id_version: string | null
          licence_expiry: string | null
          licence_expiry_cal: string | null
          licence_type: string | null
          marital_status: string | null
          mid_bank: string | null
          mid_iban: string | null
          mid_id: string | null
          mid_name: string | null
          name_en: string | null
          org_id: string
          passport_expiry: string | null
          passport_expiry_cal: string | null
          passport_issue: string | null
          passport_issue_cal: string | null
          passport_no: string | null
          passport_place: string | null
          pay_method: string | null
          religion: string | null
          specialization: string | null
          sponsor_name: string | null
          sponsor_no: string | null
          team: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          assignment_note?: string | null
          bank_name?: string | null
          education?: string | null
          employee_id: string
          has_licence?: string | null
          iban?: string | null
          id_expiry?: string | null
          id_expiry_cal?: string | null
          id_type?: string | null
          id_version?: string | null
          licence_expiry?: string | null
          licence_expiry_cal?: string | null
          licence_type?: string | null
          marital_status?: string | null
          mid_bank?: string | null
          mid_iban?: string | null
          mid_id?: string | null
          mid_name?: string | null
          name_en?: string | null
          org_id: string
          passport_expiry?: string | null
          passport_expiry_cal?: string | null
          passport_issue?: string | null
          passport_issue_cal?: string | null
          passport_no?: string | null
          passport_place?: string | null
          pay_method?: string | null
          religion?: string | null
          specialization?: string | null
          sponsor_name?: string | null
          sponsor_no?: string | null
          team?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          assignment_note?: string | null
          bank_name?: string | null
          education?: string | null
          employee_id?: string
          has_licence?: string | null
          iban?: string | null
          id_expiry?: string | null
          id_expiry_cal?: string | null
          id_type?: string | null
          id_version?: string | null
          licence_expiry?: string | null
          licence_expiry_cal?: string | null
          licence_type?: string | null
          marital_status?: string | null
          mid_bank?: string | null
          mid_iban?: string | null
          mid_id?: string | null
          mid_name?: string | null
          name_en?: string | null
          org_id?: string
          passport_expiry?: string | null
          passport_expiry_cal?: string | null
          passport_issue?: string | null
          passport_issue_cal?: string | null
          passport_no?: string | null
          passport_place?: string | null
          pay_method?: string | null
          religion?: string | null
          specialization?: string | null
          sponsor_name?: string | null
          sponsor_no?: string | null
          team?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employee_profile_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_profile_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          birth_date: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          display_name_manual: boolean
          email: string | null
          employee_no: string
          end_date: string | null
          full_name: string
          gender: string | null
          hire_date: string | null
          id: string
          import_key: string | null
          job_title: string | null
          national_id: string | null
          nationality: string | null
          notes: string | null
          org_id: string
          phone: string | null
          self_access: boolean
          self_access_at: string | null
          self_access_by: string | null
          self_linked_at: string | null
          self_linked_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          display_name_manual?: boolean
          email?: string | null
          employee_no: string
          end_date?: string | null
          full_name: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          import_key?: string | null
          job_title?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          self_access?: boolean
          self_access_at?: string | null
          self_access_by?: string | null
          self_linked_at?: string | null
          self_linked_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          display_name_manual?: boolean
          email?: string | null
          employee_no?: string
          end_date?: string | null
          full_name?: string
          gender?: string | null
          hire_date?: string | null
          id?: string
          import_key?: string | null
          job_title?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          self_access?: boolean
          self_access_at?: string | null
          self_access_by?: string | null
          self_linked_at?: string | null
          self_linked_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_events: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          org_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          org_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_ext_settings: {
        Row: {
          at: string
          by_user: string | null
          enabled: boolean
          ext: string
          org_id: string
          reason: string | null
        }
        Insert: {
          at?: string
          by_user?: string | null
          enabled?: boolean
          ext: string
          org_id: string
          reason?: string | null
        }
        Update: {
          at?: string
          by_user?: string | null
          enabled?: boolean
          ext?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_ext_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_hs_properties: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          org_id: string
          school_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name: string
          notes?: string | null
          org_id: string
          school_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          org_id?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_hs_properties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_hs_properties_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_hs_stays: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          end_kind: string | null
          end_reason: string | null
          id: string
          next_stay: string | null
          note: string | null
          org_id: string
          start_date: string
          unit_id: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          end_kind?: string | null
          end_reason?: string | null
          id?: string
          next_stay?: string | null
          note?: string | null
          org_id: string
          start_date: string
          unit_id: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          end_kind?: string | null
          end_reason?: string | null
          id?: string
          next_stay?: string | null
          note?: string | null
          org_id?: string
          start_date?: string
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_hs_stays_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_hs_stays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_hs_stays_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "hr_hs_units"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_hs_units: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          id: string
          label: string
          org_id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity: number
          created_at?: string
          id?: string
          label: string
          org_id: string
          property_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          id?: string
          label?: string
          org_id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_hs_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_hs_units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "hr_hs_properties"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_in_classes: {
        Row: {
          annual_limit: number | null
          coverage: string | null
          id: string
          name: string
          org_id: string
          policy_id: string
        }
        Insert: {
          annual_limit?: number | null
          coverage?: string | null
          id?: string
          name: string
          org_id: string
          policy_id: string
        }
        Update: {
          annual_limit?: number | null
          coverage?: string | null
          id?: string
          name?: string
          org_id?: string
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_in_classes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_classes_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hr_in_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_in_companies: {
        Row: {
          active: boolean
          contact: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          org_id: string
        }
        Insert: {
          active?: boolean
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          org_id: string
        }
        Update: {
          active?: boolean
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_in_companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_in_members: {
        Row: {
          class_id: string
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          dep_birth: string | null
          dep_name: string | null
          dep_national_id: string | null
          dep_relation: string | null
          employee_id: string
          end_date: string | null
          end_reason: string | null
          id: string
          kind: string
          member_no: string | null
          org_id: string
          policy_id: string
          start_date: string
        }
        Insert: {
          class_id: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          dep_birth?: string | null
          dep_name?: string | null
          dep_national_id?: string | null
          dep_relation?: string | null
          employee_id: string
          end_date?: string | null
          end_reason?: string | null
          id?: string
          kind: string
          member_no?: string | null
          org_id: string
          policy_id: string
          start_date: string
        }
        Update: {
          class_id?: string
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          dep_birth?: string | null
          dep_name?: string | null
          dep_national_id?: string | null
          dep_relation?: string | null
          employee_id?: string
          end_date?: string | null
          end_reason?: string | null
          id?: string
          kind?: string
          member_no?: string | null
          org_id?: string
          policy_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_in_members_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "hr_in_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_members_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hr_in_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_in_policies: {
        Row: {
          alert_days: number
          company_id: string
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          notes: string | null
          org_id: string
          policy_no: string
          renewal_of: string | null
          start_date: string
        }
        Insert: {
          alert_days?: number
          company_id: string
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          notes?: string | null
          org_id: string
          policy_no: string
          renewal_of?: string | null
          start_date: string
        }
        Update: {
          alert_days?: number
          company_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          policy_no?: string
          renewal_of?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_in_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "hr_in_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_in_policies_renewal_of_fkey"
            columns: ["renewal_of"]
            isOneToOne: false
            referencedRelation: "hr_in_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_job_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_job_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_absences: {
        Row: {
          absence_id: string
          created: boolean
          date: string
          employee_id: string
          request_id: string
        }
        Insert: {
          absence_id: string
          created: boolean
          date: string
          employee_id: string
          request_id: string
        }
        Update: {
          absence_id?: string
          created?: boolean
          date?: string
          employee_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_absences_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: false
            referencedRelation: "teacher_absences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_absences_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_moves: {
        Row: {
          created_at: string
          created_by: string | null
          days: number
          employee_id: string
          id: string
          key: string
          kind: string
          org_id: string
          reason: string | null
          request_id: string | null
          type_id: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          days: number
          employee_id: string
          id?: string
          key: string
          kind: string
          org_id: string
          reason?: string | null
          request_id?: string | null
          type_id: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          days?: number
          employee_id?: string
          id?: string
          key?: string
          kind?: string
          org_id?: string
          reason?: string | null
          request_id?: string | null
          type_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_moves_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_moves_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_moves_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_moves_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_policies: {
        Row: {
          allow_negative: boolean
          annual_days: number | null
          count_mode: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          max_days: number | null
          org_id: string
          school_id: string | null
          type_id: string
          uses_balance: boolean
          version: number
        }
        Insert: {
          allow_negative?: boolean
          annual_days?: number | null
          count_mode: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          max_days?: number | null
          org_id: string
          school_id?: string | null
          type_id: string
          uses_balance: boolean
          version: number
        }
        Update: {
          allow_negative?: boolean
          annual_days?: number | null
          count_mode?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          max_days?: number | null
          org_id?: string
          school_id?: string | null
          type_id?: string
          uses_balance?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_policies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_policies_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_requests: {
        Row: {
          actual_end: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          days: number
          decision_reason: string | null
          employee_id: string
          end_date: string
          hr_at: string | null
          hr_by: string | null
          id: string
          manager_at: string | null
          manager_by: string | null
          manager_emp: string | null
          note: string | null
          org_id: string
          parent_id: string | null
          policy_id: string | null
          requested_at: string
          requested_by: string
          rev: number
          start_date: string
          status: string
          type_id: string
          updated_at: string
        }
        Insert: {
          actual_end?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          days: number
          decision_reason?: string | null
          employee_id: string
          end_date: string
          hr_at?: string | null
          hr_by?: string | null
          id?: string
          manager_at?: string | null
          manager_by?: string | null
          manager_emp?: string | null
          note?: string | null
          org_id: string
          parent_id?: string | null
          policy_id?: string | null
          requested_at?: string
          requested_by: string
          rev?: number
          start_date: string
          status: string
          type_id: string
          updated_at?: string
        }
        Update: {
          actual_end?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          days?: number
          decision_reason?: string | null
          employee_id?: string
          end_date?: string
          hr_at?: string | null
          hr_by?: string | null
          id?: string
          manager_at?: string | null
          manager_by?: string | null
          manager_emp?: string | null
          note?: string | null
          org_id?: string
          parent_id?: string | null
          policy_id?: string | null
          requested_at?: string
          requested_by?: string
          rev?: number
          start_date?: string
          status?: string
          type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_manager_emp_fkey"
            columns: ["manager_emp"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_leave_requests_type_id_fkey"
            columns: ["type_id"]
            isOneToOne: false
            referencedRelation: "hr_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_settings: {
        Row: {
          org_id: string
          updated_at: string
          updated_by: string | null
          work_days: number[] | null
        }
        Insert: {
          org_id: string
          updated_at?: string
          updated_by?: string | null
          work_days?: number[] | null
        }
        Update: {
          org_id?: string
          updated_at?: string
          updated_by?: string | null
          work_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_leave_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_leave_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_letter_counters: {
        Row: {
          n: number
          org_id: string
          year: number
        }
        Insert: {
          n?: number
          org_id: string
          year: number
        }
        Update: {
          n?: number
          org_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_letter_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_letter_template_versions: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          has_comp: boolean
          id: string
          name: string
          template_id: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          has_comp: boolean
          id?: string
          name: string
          template_id: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          has_comp?: boolean
          id?: string
          name?: string
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_letter_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_letter_templates: {
        Row: {
          body: string
          created_at: string
          employee_request: boolean
          has_comp: boolean
          id: string
          is_active: boolean
          kind: string
          name: string
          needs_review: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          employee_request?: boolean
          has_comp?: boolean
          id?: string
          is_active?: boolean
          kind?: string
          name: string
          needs_review?: boolean
          org_id: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          employee_request?: boolean
          has_comp?: boolean
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          needs_review?: boolean
          org_id?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_letter_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_letters: {
        Row: {
          addressee: string | null
          body_snapshot: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          decision_reason: string | null
          employee_id: string
          has_comp: boolean
          id: string
          issued_at: string | null
          issued_by: string | null
          org_id: string
          parent_id: string | null
          purpose: string | null
          ref_no: string | null
          requested_at: string
          requested_by: string
          rev: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          template_id: string
          template_version: number
          updated_at: string
          vars_snapshot: Json | null
        }
        Insert: {
          addressee?: string | null
          body_snapshot?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decision_reason?: string | null
          employee_id: string
          has_comp?: boolean
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          org_id: string
          parent_id?: string | null
          purpose?: string | null
          ref_no?: string | null
          requested_at?: string
          requested_by: string
          rev?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          template_id: string
          template_version: number
          updated_at?: string
          vars_snapshot?: Json | null
        }
        Update: {
          addressee?: string | null
          body_snapshot?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          decision_reason?: string | null
          employee_id?: string
          has_comp?: boolean
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          org_id?: string
          parent_id?: string | null
          purpose?: string | null
          ref_no?: string | null
          requested_at?: string
          requested_by?: string
          rev?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          template_id?: string
          template_version?: number
          updated_at?: string
          vars_snapshot?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_letters_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "hr_letters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_login_pending: {
        Row: {
          actor: string
          created_at: string
          national_id: string
          org_id: string
          user_id: string
        }
        Insert: {
          actor: string
          created_at?: string
          national_id: string
          org_id: string
          user_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          national_id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_login_pending_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_open_batches: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          by_school: Json
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          kind: string
          org_id: string
          prepared_at: string
          prepared_by: string
          rev: number
          row_count: number
          rows: Json
          skipped: number
          source_ref: string
          source_rows: number
          source_total: number
          status: string
          title: string
          total: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          by_school?: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          kind: string
          org_id: string
          prepared_at?: string
          prepared_by: string
          rev?: number
          row_count: number
          rows: Json
          skipped?: number
          source_ref: string
          source_rows: number
          source_total: number
          status?: string
          title: string
          total: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          by_school?: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          org_id?: string
          prepared_at?: string
          prepared_by?: string
          rev?: number
          row_count?: number
          rows?: Json
          skipped?: number
          source_ref?: string
          source_rows?: number
          source_total?: number
          status?: string
          title?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_open_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          kind: string
          name: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          name: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_lines: {
        Row: {
          blockers: Json
          currency: string | null
          deductions: number
          employee_id: string
          exception: Json | null
          exclude_reason: string | null
          gross: number
          id: string
          items: Json
          net: number
          notes: Json
          org_id: string
          run_id: string
          status: string
        }
        Insert: {
          blockers?: Json
          currency?: string | null
          deductions?: number
          employee_id: string
          exception?: Json | null
          exclude_reason?: string | null
          gross?: number
          id?: string
          items?: Json
          net?: number
          notes?: Json
          org_id: string
          run_id: string
          status: string
        }
        Update: {
          blockers?: Json
          currency?: string | null
          deductions?: number
          employee_id?: string
          exception?: Json | null
          exclude_reason?: string | null
          gross?: number
          id?: string
          items?: Json
          net?: number
          notes?: Json
          org_id?: string
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_lines_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pay_lines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pay_lines_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "hr_pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_policies: {
        Row: {
          effective_from: string
          id: string
          org_id: string
          params: Json
          reason: string
          set_at: string
          set_by: string
          status: string
          topic: string
          version: number
        }
        Insert: {
          effective_from: string
          id?: string
          org_id: string
          params?: Json
          reason: string
          set_at?: string
          set_by: string
          status: string
          topic: string
          version: number
        }
        Update: {
          effective_from?: string
          id?: string
          org_id?: string
          params?: Json
          reason?: string
          set_at?: string
          set_by?: string
          status?: string
          topic?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_policies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_resolutions: {
        Row: {
          at: string
          by_user: string
          employee_id: string
          mode: string
          reason: string
          run_id: string
        }
        Insert: {
          at?: string
          by_user: string
          employee_id: string
          mode: string
          reason: string
          run_id: string
        }
        Update: {
          at?: string
          by_user?: string
          employee_id?: string
          mode?: string
          reason?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_resolutions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pay_resolutions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "hr_pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_version: number | null
          created_at: string
          created_by: string
          id: string
          month: string
          notes: Json
          org_id: string
          paid_at: string | null
          paid_by: string | null
          payment_ref: string | null
          payment_status: string
          posted_at: string | null
          posted_by: string | null
          posting_ref: string | null
          posting_status: string
          prepared_at: string | null
          prepared_by: string | null
          published_at: string | null
          published_by: string | null
          return_reason: string | null
          rev: number
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_version: number | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          totals: Json
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_version?: number | null
          created_at?: string
          created_by: string
          id?: string
          month: string
          notes?: Json
          org_id: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          payment_status?: string
          posted_at?: string | null
          posted_by?: string | null
          posting_ref?: string | null
          posting_status?: string
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          return_reason?: string | null
          rev?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_version?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_version?: number | null
          created_at?: string
          created_by?: string
          id?: string
          month?: string
          notes?: Json
          org_id?: string
          paid_at?: string | null
          paid_by?: string | null
          payment_ref?: string | null
          payment_status?: string
          posted_at?: string | null
          posted_by?: string | null
          posting_ref?: string | null
          posting_status?: string
          prepared_at?: string | null
          prepared_by?: string | null
          published_at?: string | null
          published_by?: string | null
          return_reason?: string | null
          rev?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_version?: number | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          totals?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_settings: {
        Row: {
          allow_partial_exception: boolean
          day_divisor: number | null
          exc_at: string | null
          exc_by: string | null
          exc_reason: string | null
          finance_link: string | null
          link_at: string | null
          link_by: string | null
          org_id: string
          unpaid_leave_types: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_partial_exception?: boolean
          day_divisor?: number | null
          exc_at?: string | null
          exc_by?: string | null
          exc_reason?: string | null
          finance_link?: string | null
          link_at?: string | null
          link_by?: string | null
          org_id: string
          unpaid_leave_types?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_partial_exception?: boolean
          day_divisor?: number | null
          exc_at?: string | null
          exc_by?: string | null
          exc_reason?: string | null
          finance_link?: string | null
          link_at?: string | null
          link_by?: string | null
          org_id?: string
          unpaid_leave_types?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pay_snapshots: {
        Row: {
          at: string
          by_user: string
          lines: Json
          run_id: string
          totals: Json
          version: number
        }
        Insert: {
          at?: string
          by_user: string
          lines: Json
          run_id: string
          totals: Json
          version: number
        }
        Update: {
          at?: string
          by_user?: string
          lines?: Json
          run_id?: string
          totals?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_pay_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "hr_pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_perm_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          date_from: string
          date_to: string
          decision_reason: string | null
          employee_id: string
          hr_at: string | null
          hr_by: string | null
          id: string
          kind: string
          manager_at: string | null
          manager_by: string | null
          manager_emp: string | null
          minutes: number | null
          org_id: string
          reason: string
          requested_at: string
          requested_by: string
          rev: number
          status: string
          time_from: string | null
          time_to: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          date_from: string
          date_to: string
          decision_reason?: string | null
          employee_id: string
          hr_at?: string | null
          hr_by?: string | null
          id?: string
          kind: string
          manager_at?: string | null
          manager_by?: string | null
          manager_emp?: string | null
          minutes?: number | null
          org_id: string
          reason: string
          requested_at?: string
          requested_by: string
          rev?: number
          status: string
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          date_from?: string
          date_to?: string
          decision_reason?: string | null
          employee_id?: string
          hr_at?: string | null
          hr_by?: string | null
          id?: string
          kind?: string
          manager_at?: string | null
          manager_by?: string | null
          manager_emp?: string | null
          minutes?: number | null
          org_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          rev?: number
          status?: string
          time_from?: string | null
          time_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_perm_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_perm_requests_manager_emp_fkey"
            columns: ["manager_emp"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_perm_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pf_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          period_end: string
          period_start: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          period_end: string
          period_start: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          period_end?: string
          period_start?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pf_cycles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pf_form_versions: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          form_id: string
          id: string
          org_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria: Json
          form_id: string
          id?: string
          org_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          form_id?: string
          id?: string
          org_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_pf_form_versions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "hr_pf_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pf_form_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pf_forms: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          current_version: number
          id: string
          name: string
          org_id: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          name: string
          org_id: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pf_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_pf_reviews: {
        Row: {
          comments: string | null
          created_at: string
          created_by: string | null
          criteria: Json
          cycle_id: string
          employee_id: string
          evaluator: string
          evidence: Json
          final_total: number | null
          form_version_id: string
          id: string
          objection: string | null
          org_id: string
          published_at: string | null
          published_comments: string | null
          published_scores: Json | null
          published_total: number | null
          publisher: string | null
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          responded_at: string | null
          rev: number
          review_note: string | null
          reviewed_at: string | null
          reviewer: string | null
          school_id: string
          scores: Json
          status: string
          total: number | null
          updated_at: string
        }
        Insert: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          criteria: Json
          cycle_id: string
          employee_id: string
          evaluator: string
          evidence?: Json
          final_total?: number | null
          form_version_id: string
          id?: string
          objection?: string | null
          org_id: string
          published_at?: string | null
          published_comments?: string | null
          published_scores?: Json | null
          published_total?: number | null
          publisher?: string | null
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          rev?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          school_id: string
          scores?: Json
          status?: string
          total?: number | null
          updated_at?: string
        }
        Update: {
          comments?: string | null
          created_at?: string
          created_by?: string | null
          criteria?: Json
          cycle_id?: string
          employee_id?: string
          evaluator?: string
          evidence?: Json
          final_total?: number | null
          form_version_id?: string
          id?: string
          objection?: string | null
          org_id?: string
          published_at?: string | null
          published_comments?: string | null
          published_scores?: Json | null
          published_total?: number | null
          publisher?: string | null
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responded_at?: string | null
          rev?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewer?: string | null
          school_id?: string
          scores?: Json
          status?: string
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_pf_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "hr_pf_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pf_reviews_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pf_reviews_form_version_id_fkey"
            columns: ["form_version_id"]
            isOneToOne: false
            referencedRelation: "hr_pf_form_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pf_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_pf_reviews_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rc_candidates: {
        Row: {
          converted_at: string | null
          converted_by: string | null
          created_at: string
          created_by: string
          education: string | null
          email: string | null
          employee_id: string | null
          experience: string | null
          full_name: string
          id: string
          languages: string | null
          national_id: string | null
          notes: string | null
          org_id: string
          phone: string | null
          rev: number
          stage: string
          stage_reason: string | null
          updated_at: string
          vacancy_id: string
        }
        Insert: {
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          created_by: string
          education?: string | null
          email?: string | null
          employee_id?: string | null
          experience?: string | null
          full_name: string
          id?: string
          languages?: string | null
          national_id?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          rev?: number
          stage?: string
          stage_reason?: string | null
          updated_at?: string
          vacancy_id: string
        }
        Update: {
          converted_at?: string | null
          converted_by?: string | null
          created_at?: string
          created_by?: string
          education?: string | null
          email?: string | null
          employee_id?: string | null
          experience?: string | null
          full_name?: string
          id?: string
          languages?: string | null
          national_id?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          rev?: number
          stage?: string
          stage_reason?: string | null
          updated_at?: string
          vacancy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_rc_candidates_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_rc_candidates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_rc_candidates_vacancy_id_fkey"
            columns: ["vacancy_id"]
            isOneToOne: false
            referencedRelation: "hr_rc_vacancies"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rc_counters: {
        Row: {
          n: number
          org_id: string
        }
        Insert: {
          n?: number
          org_id: string
        }
        Update: {
          n?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_rc_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rc_interviews: {
        Row: {
          at: string
          by_user: string
          candidate_id: string
          criteria: Json
          held_on: string
          id: string
          notes: string | null
          org_id: string
          panel: string
          result: string
        }
        Insert: {
          at?: string
          by_user: string
          candidate_id: string
          criteria?: Json
          held_on: string
          id?: string
          notes?: string | null
          org_id: string
          panel: string
          result: string
        }
        Update: {
          at?: string
          by_user?: string
          candidate_id?: string
          criteria?: Json
          held_on?: string
          id?: string
          notes?: string | null
          org_id?: string
          panel?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_rc_interviews_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_rc_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_rc_interviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rc_offers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          candidate_id: string
          created_at: string
          created_by: string
          id: string
          org_id: string
          responded_at: string | null
          responded_by: string | null
          response_reason: string | null
          response_ref: string | null
          status: string
          terms: Json
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          candidate_id: string
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          responded_at?: string | null
          responded_by?: string | null
          response_reason?: string | null
          response_ref?: string | null
          status?: string
          terms: Json
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          candidate_id?: string
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          responded_at?: string | null
          responded_by?: string | null
          response_reason?: string | null
          response_ref?: string | null
          status?: string
          terms?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_rc_offers_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_rc_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_rc_offers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_rc_vacancies: {
        Row: {
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          job_title: string
          org_id: string
          reason: string
          ref: string
          rev: number
          school_id: string
          seats: number
          stage: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          job_title: string
          org_id: string
          reason: string
          ref: string
          rev?: number
          school_id: string
          seats?: number
          stage?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          job_title?: string
          org_id?: string
          reason?: string
          ref?: string
          rev?: number
          school_id?: string
          seats?: number
          stage?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_rc_vacancies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_rc_vacancies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_settings: {
        Row: {
          alert_days_reviewed: boolean
          alerts_active: boolean
          alerts_decided_at: string | null
          alerts_decided_by: string | null
          alerts_decision_reason: string | null
          alerts_source: string | null
          contract_alert_days: number[]
          notify_employee_expiry: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_days_reviewed?: boolean
          alerts_active?: boolean
          alerts_decided_at?: string | null
          alerts_decided_by?: string | null
          alerts_decision_reason?: string | null
          alerts_source?: string | null
          contract_alert_days?: number[]
          notify_employee_expiry?: boolean
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_days_reviewed?: boolean
          alerts_active?: boolean
          alerts_decided_at?: string | null
          alerts_decided_by?: string | null
          alerts_decision_reason?: string | null
          alerts_source?: string | null
          contract_alert_days?: number[]
          notify_employee_expiry?: boolean
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_shift_assign: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          end_date: string | null
          id: string
          org_id: string
          shift_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          end_date?: string | null
          id?: string
          org_id: string
          shift_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          end_date?: string | null
          id?: string
          org_id?: string
          shift_id?: string
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_shift_assign_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_shift_assign_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_shift_assign_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "hr_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_shifts: {
        Row: {
          break_min: number
          created_at: string
          created_by: string | null
          end_time: string
          grace_in_min: number
          grace_out_min: number
          id: string
          is_active: boolean
          name: string
          org_id: string
          school_id: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          break_min: number
          created_at?: string
          created_by?: string | null
          end_time: string
          grace_in_min: number
          grace_out_min: number
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          school_id?: string | null
          start_time: string
          updated_at?: string
        }
        Update: {
          break_min?: number
          created_at?: string
          created_by?: string | null
          end_time?: string
          grace_in_min?: number
          grace_out_min?: number
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          school_id?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_shifts_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_title_roles: {
        Row: {
          base: string
          created_at: string
          id: string
          org_id: string
          title: string
          title_norm: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base: string
          created_at?: string
          id?: string
          org_id: string
          title: string
          title_norm: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base?: string
          created_at?: string
          id?: string
          org_id?: string
          title?: string
          title_norm?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_title_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      id_login_challenges: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          nid_hash: string
          phone: string
          send_status: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          attempts?: number
          channel?: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          nid_hash: string
          phone: string
          send_status?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          nid_hash?: string
          phone?: string
          send_status?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      id_login_failures: {
        Row: {
          created_at: string
          id: number
          key_hash: string
          kind: string
        }
        Insert: {
          created_at?: string
          id?: number
          key_hash: string
          kind: string
        }
        Update: {
          created_at?: string
          id?: number
          key_hash?: string
          kind?: string
        }
        Relationships: []
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
      lesson_attendance: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          course_id: string
          created_at: string
          created_by: string
          date: string
          exception_by: string | null
          exception_reason: string | null
          id: string
          kind: string
          period_id: string
          rev: number
          school_id: string
          section_id: string
          slot_id: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          course_id: string
          created_at?: string
          created_by?: string
          date: string
          exception_by?: string | null
          exception_reason?: string | null
          id?: string
          kind?: string
          period_id: string
          rev?: number
          school_id: string
          section_id: string
          slot_id: string
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          date?: string
          exception_by?: string | null
          exception_reason?: string | null
          id?: string
          kind?: string
          period_id?: string
          rev?: number
          school_id?: string
          section_id?: string
          slot_id?: string
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_attendance_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attendance_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attendance_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attendance_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_attendance_events: {
        Row: {
          action: string
          actor: string | null
          changes: Json
          created_at: string
          id: string
          reason: string | null
          session_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          changes?: Json
          created_at?: string
          id?: string
          reason?: string | null
          session_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          changes?: Json
          created_at?: string
          id?: string
          reason?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_attendance_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lesson_attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_attendance_marks: {
        Row: {
          note: string | null
          session_id: string
          status: string
          student_id: string
        }
        Insert: {
          note?: string | null
          session_id: string
          status?: string
          student_id: string
        }
        Update: {
          note?: string | null
          session_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_attendance_marks_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "lesson_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_attendance_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      live_signals: {
        Row: {
          at: string
          id: number
          school_id: string | null
          topic: string
          user_id: string | null
        }
        Insert: {
          at?: string
          id?: number
          school_id?: string | null
          topic: string
          user_id?: string | null
        }
        Update: {
          at?: string
          id?: number
          school_id?: string | null
          topic?: string
          user_id?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          branch_suspended: boolean
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
          branch_suspended?: boolean
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
          branch_suspended?: boolean
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
          auto_rule_id: string | null
          body: string
          client_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          edited_at: string | null
          id: string
          kind: string
          pinned_at: string | null
          pinned_by: string | null
          reply_to: string | null
          school_id: string | null
          sender_id: string
          sent_as: string | null
          seq: number
        }
        Insert: {
          auto_rule_id?: string | null
          body?: string
          client_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          school_id?: string | null
          sender_id: string
          sent_as?: string | null
          seq: number
        }
        Update: {
          auto_rule_id?: string | null
          body?: string
          client_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          edited_at?: string | null
          id?: string
          kind?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          school_id?: string | null
          sender_id?: string
          sent_as?: string | null
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_auto_rule_id_fkey"
            columns: ["auto_rule_id"]
            isOneToOne: false
            referencedRelation: "cs_auto_rules"
            referencedColumns: ["id"]
          },
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
      mt_bus_events: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          bus_id: string
          id: string
          note: string | null
          request_id: string | null
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          at?: string
          before?: Json | null
          bus_id: string
          id?: string
          note?: string | null
          request_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          bus_id?: string
          id?: string
          note?: string | null
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mt_bus_events_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "mt_buses"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_buses: {
        Row: {
          active: boolean
          capacity: number | null
          code: string
          created_at: string
          created_by: string
          id: string
          inspection_date: string | null
          license_expiry: string | null
          model: string | null
          next_service_date: string | null
          next_service_km: number | null
          notes: string | null
          odometer: number | null
          op_status: string
          org_id: string
          plate: string | null
          school_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          code: string
          created_at?: string
          created_by: string
          id?: string
          inspection_date?: string | null
          license_expiry?: string | null
          model?: string | null
          next_service_date?: string | null
          next_service_km?: number | null
          notes?: string | null
          odometer?: number | null
          op_status?: string
          org_id: string
          plate?: string | null
          school_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          code?: string
          created_at?: string
          created_by?: string
          id?: string
          inspection_date?: string | null
          license_expiry?: string | null
          model?: string | null
          next_service_date?: string | null
          next_service_km?: number | null
          notes?: string | null
          odometer?: number | null
          op_status?: string
          org_id?: string
          plate?: string | null
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mt_buses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_buses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_other: boolean
          kind: string
          name: string
          org_id: string | null
          parent_id: string | null
          sort: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          kind: string
          name: string
          org_id?: string | null
          parent_id?: string | null
          sort?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          kind?: string
          name?: string
          org_id?: string | null
          parent_id?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "mt_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "mt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_counters: {
        Row: {
          kind: string
          n: number
          org_id: string
          yr: number
        }
        Insert: {
          kind: string
          n?: number
          org_id: string
          yr: number
        }
        Update: {
          kind?: string
          n?: number
          org_id?: string
          yr?: number
        }
        Relationships: [
          {
            foreignKeyName: "mt_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_events: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          body: string | null
          id: string
          request_id: string
          visibility: string
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          at?: string
          before?: Json | null
          body?: string | null
          id?: string
          request_id: string
          visibility?: string
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          body?: string | null
          id?: string
          request_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "mt_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "mt_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_requests: {
        Row: {
          accepted_at: string | null
          actual_cost: number | null
          asset: string | null
          assignee_id: string | null
          building: string | null
          bus_id: string | null
          bus_location: string | null
          bus_received_at: string | null
          cancel_reason: string | null
          category_id: string | null
          client_key: string | null
          closed_at: string | null
          closed_by: string | null
          completed_by: string | null
          completion_note: string | null
          contact: string | null
          created_at: string
          description: string
          est_cost: number | null
          expected_done: string | null
          floor: string | null
          id: string
          impact: string | null
          kind: string
          need_id: string | null
          odometer: number | null
          org_id: string
          other_text: string | null
          parts: Json | null
          place: string | null
          place_type: string | null
          priority: string
          progress: number
          ref: string
          reopen_cycle: number
          reopen_pending: Json | null
          reopen_until: string | null
          requested_by: string
          rev: number
          school_id: string
          status: string
          status_before_clarify: string | null
          subcategory_id: string | null
          submitted_at: string | null
          title: string
          updated_at: string
          visit_at: string | null
          visit_window: string | null
        }
        Insert: {
          accepted_at?: string | null
          actual_cost?: number | null
          asset?: string | null
          assignee_id?: string | null
          building?: string | null
          bus_id?: string | null
          bus_location?: string | null
          bus_received_at?: string | null
          cancel_reason?: string | null
          category_id?: string | null
          client_key?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_by?: string | null
          completion_note?: string | null
          contact?: string | null
          created_at?: string
          description: string
          est_cost?: number | null
          expected_done?: string | null
          floor?: string | null
          id?: string
          impact?: string | null
          kind: string
          need_id?: string | null
          odometer?: number | null
          org_id: string
          other_text?: string | null
          parts?: Json | null
          place?: string | null
          place_type?: string | null
          priority?: string
          progress?: number
          ref: string
          reopen_cycle?: number
          reopen_pending?: Json | null
          reopen_until?: string | null
          requested_by: string
          rev?: number
          school_id: string
          status?: string
          status_before_clarify?: string | null
          subcategory_id?: string | null
          submitted_at?: string | null
          title: string
          updated_at?: string
          visit_at?: string | null
          visit_window?: string | null
        }
        Update: {
          accepted_at?: string | null
          actual_cost?: number | null
          asset?: string | null
          assignee_id?: string | null
          building?: string | null
          bus_id?: string | null
          bus_location?: string | null
          bus_received_at?: string | null
          cancel_reason?: string | null
          category_id?: string | null
          client_key?: string | null
          closed_at?: string | null
          closed_by?: string | null
          completed_by?: string | null
          completion_note?: string | null
          contact?: string | null
          created_at?: string
          description?: string
          est_cost?: number | null
          expected_done?: string | null
          floor?: string | null
          id?: string
          impact?: string | null
          kind?: string
          need_id?: string | null
          odometer?: number | null
          org_id?: string
          other_text?: string | null
          parts?: Json | null
          place?: string | null
          place_type?: string | null
          priority?: string
          progress?: number
          ref?: string
          reopen_cycle?: number
          reopen_pending?: Json | null
          reopen_until?: string | null
          requested_by?: string
          rev?: number
          school_id?: string
          status?: string
          status_before_clarify?: string | null
          subcategory_id?: string | null
          submitted_at?: string | null
          title?: string
          updated_at?: string
          visit_at?: string | null
          visit_window?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mt_requests_bus_id_fkey"
            columns: ["bus_id"]
            isOneToOne: false
            referencedRelation: "mt_buses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "mt_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mt_requests_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "mt_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      mt_settings: {
        Row: {
          org_id: string
          reopen_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          org_id: string
          reopen_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          org_id?: string
          reopen_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mt_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
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
      org_contractors: {
        Row: {
          contact_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          ends_on: string | null
          file_ids: string[]
          id: string
          name: string
          notes: string | null
          org_id: string
          phone: string | null
          school_ids: string[]
          service: string
          starts_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          ends_on?: string | null
          file_ids?: string[]
          id?: string
          name: string
          notes?: string | null
          org_id: string
          phone?: string | null
          school_ids?: string[]
          service: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          ends_on?: string | null
          file_ids?: string[]
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          school_ids?: string[]
          service?: string
          starts_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_contractors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_docs: {
        Row: {
          created_at: string
          created_by: string | null
          doc_no: string | null
          expires_on: string | null
          file_id: string | null
          id: string
          issued_on: string | null
          issuer: string | null
          kind: string
          name: string
          org_id: string
          school_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_no?: string | null
          expires_on?: string | null
          file_id?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          kind: string
          name: string
          org_id: string
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_no?: string | null
          expires_on?: string | null
          file_id?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string | null
          kind?: string
          name?: string
          org_id?: string
          school_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_docs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_docs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_docs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      org_owner_identity: {
        Row: {
          created_at: string
          national_id: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          national_id?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          national_id?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      org_section_log: {
        Row: {
          actor: string
          after_enabled: boolean
          at: string
          before_enabled: boolean | null
          id: string
          org_id: string
          reason: string
          section: string
        }
        Insert: {
          actor: string
          after_enabled: boolean
          at?: string
          before_enabled?: boolean | null
          id?: string
          org_id: string
          reason: string
          section: string
        }
        Update: {
          actor?: string
          after_enabled?: boolean
          at?: string
          before_enabled?: boolean | null
          id?: string
          org_id?: string
          reason?: string
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_section_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sections: {
        Row: {
          changed_at: string
          changed_by: string | null
          enabled: boolean
          org_id: string
          reason: string | null
          section: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          org_id: string
          reason?: string | null
          section: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          enabled?: boolean
          org_id?: string
          reason?: string | null
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_sections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      otp_sends: {
        Row: {
          created_at: string
          failed_code: string | null
          failed_detail: string | null
          id: string
          local_message_id: string
          phone: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          failed_code?: string | null
          failed_detail?: string | null
          id?: string
          local_message_id: string
          phone: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          failed_code?: string | null
          failed_detail?: string | null
          id?: string
          local_message_id?: string
          phone?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pc_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_counters: {
        Row: {
          kind: string
          n: number
          org_id: string
        }
        Insert: {
          kind: string
          n?: number
          org_id: string
        }
        Update: {
          kind?: string
          n?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_counters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_custodies: {
        Row: {
          amount: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string
          currency: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          holder_id: string
          id: string
          idem_key: string | null
          org_id: string
          overdue_exception: string | null
          purpose: string
          ref: string
          rev: number
          school_id: string
          school_ids: string[]
          settle_due: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          holder_id: string
          id?: string
          idem_key?: string | null
          org_id: string
          overdue_exception?: string | null
          purpose: string
          ref: string
          rev?: number
          school_id: string
          school_ids?: string[]
          settle_due: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          holder_id?: string
          id?: string
          idem_key?: string | null
          org_id?: string
          overdue_exception?: string | null
          purpose?: string
          ref?: string
          rev?: number
          school_id?: string
          school_ids?: string[]
          settle_due?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_custodies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_custodies_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_expense_lines: {
        Row: {
          amount: number
          category_id: string | null
          description: string
          expense_id: string
          id: string
          need_line_id: string | null
          net: number
          ord: number
          qty: number | null
          taxable: boolean
          total: number
          vat: number
        }
        Insert: {
          amount: number
          category_id?: string | null
          description: string
          expense_id: string
          id?: string
          need_line_id?: string | null
          net: number
          ord: number
          qty?: number | null
          taxable: boolean
          total: number
          vat: number
        }
        Update: {
          amount?: number
          category_id?: string | null
          description?: string
          expense_id?: string
          id?: string
          need_line_id?: string | null
          net?: number
          ord?: number
          qty?: number | null
          taxable?: boolean
          total?: number
          vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_expense_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expense_lines_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "pc_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expense_lines_need_line_id_fkey"
            columns: ["need_line_id"]
            isOneToOne: false
            referencedRelation: "pc_need_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_expenses: {
        Row: {
          benefit_school_id: string
          category_id: string | null
          corrects_id: string | null
          created_at: string
          created_by: string
          custody_id: string | null
          custom: Json
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          description: string
          dup_of: string | null
          form_id: string | null
          id: string
          idem_key: string | null
          invoice_date: string | null
          invoice_no: string | null
          net: number
          no_attachment_ok_by: string | null
          no_attachment_reason: string | null
          notes: string | null
          org_id: string
          own_funds: boolean
          purchase_date: string
          purchase_request_id: string | null
          ref: string
          rev: number
          reviewed_by: string | null
          school_id: string
          status: string
          submitted_at: string | null
          supplier: string
          tax_invoice: boolean
          total: number
          updated_at: string
          vat: number
          vat_inclusive: boolean
          vat_rate: number
        }
        Insert: {
          benefit_school_id: string
          category_id?: string | null
          corrects_id?: string | null
          created_at?: string
          created_by: string
          custody_id?: string | null
          custom?: Json
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description: string
          dup_of?: string | null
          form_id?: string | null
          id?: string
          idem_key?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          net?: number
          no_attachment_ok_by?: string | null
          no_attachment_reason?: string | null
          notes?: string | null
          org_id: string
          own_funds?: boolean
          purchase_date: string
          purchase_request_id?: string | null
          ref: string
          rev?: number
          reviewed_by?: string | null
          school_id: string
          status?: string
          submitted_at?: string | null
          supplier: string
          tax_invoice?: boolean
          total?: number
          updated_at?: string
          vat?: number
          vat_inclusive?: boolean
          vat_rate: number
        }
        Update: {
          benefit_school_id?: string
          category_id?: string | null
          corrects_id?: string | null
          created_at?: string
          created_by?: string
          custody_id?: string | null
          custom?: Json
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          description?: string
          dup_of?: string | null
          form_id?: string | null
          id?: string
          idem_key?: string | null
          invoice_date?: string | null
          invoice_no?: string | null
          net?: number
          no_attachment_ok_by?: string | null
          no_attachment_reason?: string | null
          notes?: string | null
          org_id?: string
          own_funds?: boolean
          purchase_date?: string
          purchase_request_id?: string | null
          ref?: string
          rev?: number
          reviewed_by?: string | null
          school_id?: string
          status?: string
          submitted_at?: string | null
          supplier?: string
          tax_invoice?: boolean
          total?: number
          updated_at?: string
          vat?: number
          vat_inclusive?: boolean
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_expenses_benefit_school_id_fkey"
            columns: ["benefit_school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "pc_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "pc_custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "pc_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "pc_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_forms: {
        Row: {
          core: Json
          created_at: string
          created_by: string
          fields: Json
          id: string
          note: string | null
          org_id: string
          published_at: string | null
          published_by: string | null
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          core: Json
          created_at?: string
          created_by: string
          fields?: Json
          id?: string
          note?: string | null
          org_id: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          core?: Json
          created_at?: string
          created_by?: string
          fields?: Json
          id?: string
          note?: string | null
          org_id?: string
          published_at?: string | null
          published_by?: string | null
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          entity: string
          entity_id: string | null
          id: string
          org_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          org_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          org_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pc_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_moves: {
        Row: {
          actor: string
          amount: number
          at: string
          custody_id: string
          doc_date: string | null
          expense_id: string | null
          external_ref: string | null
          file_id: string | null
          holder_ack_at: string | null
          holder_ack_by: string | null
          id: string
          idem_key: string | null
          kind: string
          method: string | null
          note: string | null
          org_id: string
          ref: string
        }
        Insert: {
          actor: string
          amount: number
          at?: string
          custody_id: string
          doc_date?: string | null
          expense_id?: string | null
          external_ref?: string | null
          file_id?: string | null
          holder_ack_at?: string | null
          holder_ack_by?: string | null
          id?: string
          idem_key?: string | null
          kind: string
          method?: string | null
          note?: string | null
          org_id: string
          ref: string
        }
        Update: {
          actor?: string
          amount?: number
          at?: string
          custody_id?: string
          doc_date?: string | null
          expense_id?: string | null
          external_ref?: string | null
          file_id?: string | null
          holder_ack_at?: string | null
          holder_ack_by?: string | null
          id?: string
          idem_key?: string | null
          kind?: string
          method?: string | null
          note?: string | null
          org_id?: string
          ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_moves_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "pc_custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_moves_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "pc_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_moves_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_need_lines: {
        Row: {
          category_id: string | null
          description: string
          id: string
          ord: number
          qty: number
          request_id: string
          unit_price: number | null
        }
        Insert: {
          category_id?: string | null
          description: string
          id?: string
          ord: number
          qty: number
          request_id: string
          unit_price?: number | null
        }
        Update: {
          category_id?: string | null
          description?: string
          id?: string
          ord?: number
          qty?: number
          request_id?: string
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pc_need_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_need_lines_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "pc_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_refunds: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          custody_id: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          expense_id: string
          id: string
          idem_key: string | null
          move_id: string | null
          org_id: string
          reason: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          custody_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expense_id: string
          id?: string
          idem_key?: string | null
          move_id?: string | null
          org_id: string
          reason: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          custody_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          expense_id?: string
          id?: string
          idem_key?: string | null
          move_id?: string | null
          org_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_refunds_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "pc_custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_refunds_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "pc_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_refunds_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_requests: {
        Row: {
          amount: number | null
          assigned_at: string | null
          assigned_to: string | null
          category_id: string | null
          close_note: string | null
          created_at: string
          created_by: string
          custody_id: string | null
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          done_at: string | null
          done_by: string | null
          id: string
          idem_key: string | null
          kind: string
          move_id: string | null
          need_approved_at: string | null
          need_approved_by: string | null
          new_custody_id: string | null
          org_id: string
          purpose: string
          ref: string
          rev: number
          school_id: string
          status: string
          submitted_at: string | null
          supplier: string | null
          to_holder: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          category_id?: string | null
          close_note?: string | null
          created_at?: string
          created_by: string
          custody_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          idem_key?: string | null
          kind: string
          move_id?: string | null
          need_approved_at?: string | null
          need_approved_by?: string | null
          new_custody_id?: string | null
          org_id: string
          purpose: string
          ref: string
          rev?: number
          school_id: string
          status?: string
          submitted_at?: string | null
          supplier?: string | null
          to_holder?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          category_id?: string | null
          close_note?: string | null
          created_at?: string
          created_by?: string
          custody_id?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          done_at?: string | null
          done_by?: string | null
          id?: string
          idem_key?: string | null
          kind?: string
          move_id?: string | null
          need_approved_at?: string | null
          need_approved_by?: string | null
          new_custody_id?: string | null
          org_id?: string
          purpose?: string
          ref?: string
          rev?: number
          school_id?: string
          status?: string
          submitted_at?: string | null
          supplier?: string | null
          to_holder?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pc_requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "pc_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_requests_custody_id_fkey"
            columns: ["custody_id"]
            isOneToOne: false
            referencedRelation: "pc_custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_requests_new_custody_id_fkey"
            columns: ["new_custody_id"]
            isOneToOne: false
            referencedRelation: "pc_custodies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pc_requests_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pc_settings: {
        Row: {
          block_overdue: boolean
          due_soon_days: number
          low_balance: number
          org_id: string
          purchase_request_above: number | null
          require_attachment: boolean
          rev: number
          updated_at: string
          updated_by: string | null
          vat_inclusive: boolean
          vat_rate: number
        }
        Insert: {
          block_overdue?: boolean
          due_soon_days?: number
          low_balance?: number
          org_id: string
          purchase_request_above?: number | null
          require_attachment?: boolean
          rev?: number
          updated_at?: string
          updated_by?: string | null
          vat_inclusive?: boolean
          vat_rate?: number
        }
        Update: {
          block_overdue?: boolean
          due_soon_days?: number
          low_balance?: number
          org_id?: string
          purchase_request_above?: number | null
          require_attachment?: boolean
          rev?: number
          updated_at?: string
          updated_by?: string | null
          vat_inclusive?: boolean
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "pc_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      perm_assignments: {
        Row: {
          approval_limit: number | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          role_id: string
          school_ids: string[] | null
          user_id: string
        }
        Insert: {
          approval_limit?: number | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          role_id: string
          school_ids?: string[] | null
          user_id: string
        }
        Update: {
          approval_limit?: number | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          role_id?: string
          school_ids?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perm_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perm_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "perm_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      perm_log: {
        Row: {
          action: string
          actor: string
          after: Json | null
          at: string
          before: Json | null
          id: string
          org_id: string | null
          reason: string | null
          role_id: string | null
          target_user: string | null
        }
        Insert: {
          action: string
          actor: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          org_id?: string | null
          reason?: string | null
          role_id?: string | null
          target_user?: string | null
        }
        Update: {
          action?: string
          actor?: string
          after?: Json | null
          at?: string
          before?: Json | null
          id?: string
          org_id?: string | null
          reason?: string | null
          role_id?: string | null
          target_user?: string | null
        }
        Relationships: []
      }
      perm_overrides: {
        Row: {
          action: string
          created_at: string
          created_by: string
          effect: string
          org_id: string
          reason: string
          scope: string | null
          section: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          created_by: string
          effect: string
          org_id: string
          reason: string
          scope?: string | null
          section: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string
          effect?: string
          org_id?: string
          reason?: string
          scope?: string | null
          section?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perm_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      perm_role_grants: {
        Row: {
          action: string
          role_id: string
          scope: string
          section: string
        }
        Insert: {
          action: string
          role_id: string
          scope: string
          section: string
        }
        Update: {
          action?: string
          role_id?: string
          scope?: string
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "perm_role_grants_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "perm_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      perm_roles: {
        Row: {
          archived_at: string | null
          base_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          key: string | null
          name: string
          org_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          base_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string | null
          name: string
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          base_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          key?: string | null
          name?: string
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perm_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      person_display_names: {
        Row: {
          created_at: string
          display_name: string
          national_id: string | null
          norm: string
          org_id: string
          src_id: string
          src_table: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          national_id?: string | null
          norm: string
          org_id: string
          src_id: string
          src_table: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          national_id?: string | null
          norm?: string
          org_id?: string
          src_id?: string
          src_table?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_display_names_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      pp_note_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          note_id: string
          old_body: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          id?: string
          note_id: string
          old_body?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          note_id?: string
          old_body?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pp_note_log_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "pp_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      pp_notes: {
        Row: {
          author: string
          body: string
          created_at: string
          edited_by: string | null
          id: string
          kind: string
          org_id: string
          rec_id: string
          removed_at: string | null
          removed_by: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          edited_by?: string | null
          id?: string
          kind: string
          org_id: string
          rec_id: string
          removed_at?: string | null
          removed_by?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          edited_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          rec_id?: string
          removed_at?: string | null
          removed_by?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pp_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pp_notes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      pp_ops: {
        Row: {
          action: string
          actor: string
          client_key: string
          created_at: string
          failed: number
          id: string
          kind: string
          ok: number
          org_id: string
          reason: string | null
          refused: number
          results: Json
          school_id: string | null
          tag_id: string | null
          total: number
        }
        Insert: {
          action: string
          actor: string
          client_key: string
          created_at?: string
          failed?: number
          id?: string
          kind: string
          ok?: number
          org_id: string
          reason?: string | null
          refused?: number
          results?: Json
          school_id?: string | null
          tag_id?: string | null
          total?: number
        }
        Update: {
          action?: string
          actor?: string
          client_key?: string
          created_at?: string
          failed?: number
          id?: string
          kind?: string
          ok?: number
          org_id?: string
          reason?: string | null
          refused?: number
          results?: Json
          school_id?: string | null
          tag_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pp_ops_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pp_tag_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          org_id: string
          rec_id: string
          removed_at: string | null
          removed_by: string | null
          school_id: string | null
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          org_id: string
          rec_id: string
          removed_at?: string | null
          removed_by?: string | null
          school_id?: string | null
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          rec_id?: string
          removed_at?: string | null
          removed_by?: string | null
          school_id?: string | null
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pp_tag_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pp_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "pp_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      pp_tags: {
        Row: {
          active: boolean
          color: string
          created_at: string
          created_by: string | null
          id: string
          kinds: string[]
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kinds?: string[]
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kinds?: string[]
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pp_tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
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
          logo_path: string | null
          name: string
          org_id: string
          stage_type: string | null
          student_gender: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name: string
          org_id: string
          stage_type?: string | null
          student_gender?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          logo_path?: string | null
          name?: string
          org_id?: string
          stage_type?: string | null
          student_gender?: string | null
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
      section_rooms: {
        Row: {
          created_at: string
          id: string
          school_id: string
          section_id: string
          title: string
          updated_at: string
          year_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          section_id: string
          title: string
          updated_at?: string
          year_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          section_id?: string
          title?: string
          updated_at?: string
          year_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "section_rooms_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_rooms_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: true
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "section_rooms_year_id_fkey"
            columns: ["year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
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
      staff_logins: {
        Row: {
          created_at: string
          created_by: string | null
          org_id: string
          updated_at: string
          user_id: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          org_id: string
          updated_at?: string
          user_id: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          org_id?: string
          updated_at?: string
          user_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_logins_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          contract_batch: string | null
          contract_status: string | null
          contract_synced_at: string | null
          contract_type: string | null
          contract_year: string | null
          contract_year_start: string | null
          created_at: string
          csmart_no: string | null
          display_name: string | null
          display_name_manual: boolean
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
          contract_batch?: string | null
          contract_status?: string | null
          contract_synced_at?: string | null
          contract_type?: string | null
          contract_year?: string | null
          contract_year_start?: string | null
          created_at?: string
          csmart_no?: string | null
          display_name?: string | null
          display_name_manual?: boolean
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
          contract_batch?: string | null
          contract_status?: string | null
          contract_synced_at?: string | null
          contract_type?: string | null
          contract_year?: string | null
          contract_year_start?: string | null
          created_at?: string
          csmart_no?: string | null
          display_name?: string | null
          display_name_manual?: boolean
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
      support_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          sort: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          sort?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          details: Json
          from_status: string | null
          id: string
          ticket_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: string
          ticket_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          details?: Json
          from_status?: string | null
          id?: string
          ticket_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_followers: {
        Row: {
          added_by: string | null
          created_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_followers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          id: string
          name: string
          org_id: string
          school_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          id?: string
          name: string
          org_id: string
          school_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          id?: string
          name?: string
          org_id?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_holidays_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_holidays_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      support_hours: {
        Row: {
          department_id: string | null
          id: string
          org_id: string
          school_id: string
          updated_at: string
          updated_by: string | null
          work_days: number[]
          work_end: string
          work_start: string
        }
        Insert: {
          department_id?: string | null
          id?: string
          org_id: string
          school_id: string
          updated_at?: string
          updated_by?: string | null
          work_days: number[]
          work_end: string
          work_start: string
        }
        Update: {
          department_id?: string | null
          id?: string
          org_id?: string
          school_id?: string
          updated_at?: string
          updated_by?: string | null
          work_days?: number[]
          work_end?: string
          work_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_hours_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_hours_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_hours_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      support_info_requests: {
        Row: {
          answer: string | null
          answered_at: string | null
          asked_by: string
          asked_to: string
          client_key: string | null
          created_at: string
          id: string
          question: string
          status: string
          ticket_id: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          asked_by: string
          asked_to: string
          client_key?: string | null
          created_at?: string
          id?: string
          question: string
          status?: string
          ticket_id: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          asked_by?: string
          asked_to?: string
          client_key?: string | null
          created_at?: string
          id?: string
          question?: string
          status?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_info_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_message_revisions: {
        Row: {
          created_at: string
          edited_by: string
          id: string
          message_id: string
          old_body: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          edited_by: string
          id?: string
          message_id: string
          old_body: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          edited_by?: string
          id?: string
          message_id?: string
          old_body?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_message_revisions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "support_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          author: string
          body: string
          client_key: string | null
          created_at: string
          edited_at: string | null
          id: string
          kind: string
          ticket_id: string
        }
        Insert: {
          author: string
          body: string
          client_key?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          kind?: string
          ticket_id: string
        }
        Update: {
          author?: string
          body?: string
          client_key?: string | null
          created_at?: string
          edited_at?: string | null
          id?: string
          kind?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_notes: {
        Row: {
          author: string
          body: string
          client_key: string | null
          created_at: string
          id: string
          kind: string
          recipient: string | null
          ticket_id: string
        }
        Insert: {
          author: string
          body: string
          client_key?: string | null
          created_at?: string
          id?: string
          kind: string
          recipient?: string | null
          ticket_id: string
        }
        Update: {
          author?: string
          body?: string
          client_key?: string | null
          created_at?: string
          id?: string
          kind?: string
          recipient?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_settings: {
        Row: {
          escalate_to: string | null
          id: string
          org_id: string | null
          reopen_days: number
          response_note: string
          sla: Json
          updated_at: string
          work_days: number[]
          work_end: string
          work_hours: string
          work_start: string
        }
        Insert: {
          escalate_to?: string | null
          id?: string
          org_id?: string | null
          reopen_days?: number
          response_note?: string
          sla?: Json
          updated_at?: string
          work_days?: number[]
          work_end?: string
          work_hours?: string
          work_start?: string
        }
        Update: {
          escalate_to?: string | null
          id?: string
          org_id?: string | null
          reopen_days?: number
          response_note?: string
          sla?: Json
          updated_at?: string
          work_days?: number[]
          work_end?: string
          work_hours?: string
          work_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee: string | null
          body: string
          category_id: string | null
          client_key: string | null
          closed_at: string | null
          created_at: string
          department_id: string | null
          first_response_at: string | null
          id: string
          linked_ticket: string | null
          org_id: string
          pause_reason: string | null
          paused_at: string | null
          priority: string
          rating: number | null
          ref: string
          requester: string
          requester_role: string
          resolution: string | null
          resolve_alerted_at: string | null
          resolve_due: string | null
          resolved_at: string | null
          response_alerted_at: string | null
          response_due: string | null
          rev: number
          school_id: string
          scope: string
          status: string
          student_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          body: string
          category_id?: string | null
          client_key?: string | null
          closed_at?: string | null
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          id?: string
          linked_ticket?: string | null
          org_id: string
          pause_reason?: string | null
          paused_at?: string | null
          priority?: string
          rating?: number | null
          ref?: string
          requester: string
          requester_role: string
          resolution?: string | null
          resolve_alerted_at?: string | null
          resolve_due?: string | null
          resolved_at?: string | null
          response_alerted_at?: string | null
          response_due?: string | null
          rev?: number
          school_id: string
          scope: string
          status?: string
          student_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          body?: string
          category_id?: string | null
          client_key?: string | null
          closed_at?: string | null
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          id?: string
          linked_ticket?: string | null
          org_id?: string
          pause_reason?: string | null
          paused_at?: string | null
          priority?: string
          rating?: number | null
          ref?: string
          requester?: string
          requester_role?: string
          resolution?: string | null
          resolve_alerted_at?: string | null
          resolve_due?: string | null
          resolved_at?: string | null
          response_alerted_at?: string | null
          response_due?: string | null
          rev?: number
          school_id?: string
          scope?: string
          status?: string
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_linked_ticket_fkey"
            columns: ["linked_ticket"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
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
          display_name: string | null
          display_name_manual: boolean
          email: string | null
          full_name: string
          id: string
          national_id: string | null
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
          display_name?: string | null
          display_name_manual?: boolean
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
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
          display_name?: string | null
          display_name_manual?: boolean
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
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
      user_active_context: {
        Row: {
          org_id: string | null
          role: string
          school_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          org_id?: string | null
          role: string
          school_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          org_id?: string | null
          role?: string
          school_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      _ad_ev: {
        Args: {
          _action: string
          _after: Json
          _app: string
          _before: Json
          _body: string
          _channel?: string
          _key: string
          _outcome?: string
        }
        Returns: undefined
      }
      _ad_ingest: {
        Args: { _nonce: string; _p: Json; _source: string }
        Returns: Json
      }
      _ad_label: { Args: { _s: string }; Returns: string }
      _ad_new_ref: { Args: { _org: string }; Returns: string }
      _ad_notify: {
        Args: {
          _key: string
          _title: string
          _user: string
          a: Database["public"]["Tables"]["ad_applications"]["Row"]
        }
        Returns: undefined
      }
      _ad_ok: {
        Args: { _action: string; _school: string; _uid: string }
        Returns: boolean
      }
      _ad_org_level: { Args: { _org: string; _uid: string }; Returns: boolean }
      _ad_phone: { Args: { _p: string }; Returns: string }
      _ad_read: {
        Args: {
          _uid: string
          a: Database["public"]["Tables"]["ad_applications"]["Row"]
        }
        Returns: boolean
      }
      _ad_row: {
        Args: { a: Database["public"]["Tables"]["ad_applications"]["Row"] }
        Returns: Json
      }
      _ad_source_auth: { Args: { _id: string; _nonce: string }; Returns: Json }
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
      _adm_hub: { Args: { _action: string; _school: string }; Returns: boolean }
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
      _adm_meet_fp: { Args: { _picks: string[]; _t: Json }; Returns: string }
      _adm_meet_resolve: {
        Args: { _picks: string[]; _t: Json }
        Returns: {
          cat: string
          school_id: string
          user_id: string
        }[]
      }
      _adm_meet_summary: { Args: { _picks: string[]; _t: Json }; Returns: Json }
      _adm_meet_target: {
        Args: { _org: string; _school: string; _scope: string; _t: Json }
        Returns: Json
      }
      _adm_member_ok: {
        Args: {
          _cat: string
          _org: string
          _school: string
          _scope: string
          _user: string
        }
        Returns: boolean
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
      _auth_user_lookup: {
        Args: { _email: string; _phone: string }
        Returns: {
          phone_confirmed: boolean
          user_id: string
        }[]
      }
      _auto_card: { Args: { _student: string }; Returns: undefined }
      _bc_audience: {
        Args: { _t: Json }
        Returns: {
          category: string
          school_id: string
          user_id: string
        }[]
      }
      _bc_can_all: { Args: { _action: string; _t: Json }; Returns: boolean }
      _bc_cat_label: { Args: { _c: string }; Returns: string }
      _bc_file_ok: { Args: { _notice: string }; Returns: boolean }
      _bc_fp: { Args: { _t: Json }; Returns: string }
      _bc_ok: { Args: { _action: string; _school: string }; Returns: boolean }
      _bc_pool: {
        Args: { _t: Json }
        Returns: {
          category: string
          school_id: string
          user_id: string
        }[]
      }
      _bc_schools: {
        Args: { _action: string; _org: string }
        Returns: string[]
      }
      _bc_target: {
        Args: { _action: string; _org: string; _t: Json }
        Returns: Json
      }
      _bc_visible: {
        Args: { n: Database["public"]["Tables"]["bc_notices"]["Row"] }
        Returns: boolean
      }
      _bt_base: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _bt_guard: {
        Args: { _action: string; _section: string }
        Returns: boolean
      }
      _bt_off: { Args: { _action: string; _section: string }; Returns: boolean }
      _can_circ_scope: {
        Args: { _home: string; _org: string; _scope: string }
        Returns: boolean
      }
      _can_create_group: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _cg_admin: {
        Args: { _conv: string }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _cg_counts: { Args: { _school: string }; Returns: Json }
      _cg_generic_label: {
        Args: { _conv: string; _user: string }
        Returns: string
      }
      _cg_generic_label2: {
        Args: { _conv: string; _user: string }
        Returns: string
      }
      _cg_label: { Args: { _reasons: string[] }; Returns: string }
      _cg_msg_visible: {
        Args: { _conv: string; _sender: string; _sent_as: string }
        Returns: boolean
      }
      _cg_private: { Args: { _conv: string }; Returns: boolean }
      _cg_sender_visible: {
        Args: { _conv: string; _sender: string }
        Returns: boolean
      }
      _cg_title: { Args: { _section: string; _year: string }; Returns: string }
      _cg_viewer_staff: { Args: { _conv: string }; Returns: boolean }
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
      _class_want: {
        Args: { _section: string; _year: string }
        Returns: {
          r: string
          reasons: string[]
          uid: string
        }[]
      }
      _complete_account_setup: {
        Args: { _password_changed: boolean; _uid: string }
        Returns: string
      }
      _conv_link: { Args: { _conv: string }; Returns: string }
      _conv_send_block_v1: { Args: { _conv: string }; Returns: string }
      _copy_homework_template_v0: {
        Args: {
          _available_from: string
          _course: string
          _due_at: string
          _id: string
          _title: string
        }
        Returns: string
      }
      _copy_homework_v0: {
        Args: { _course: string; _id: string }
        Returns: string
      }
      _course_members: {
        Args: { _course: string }
        Returns: {
          r: string
          uid: string
        }[]
      }
      _course_title: { Args: { _course: string }; Returns: string }
      _cs_clean: { Args: { _max: number; _t: string }; Returns: string }
      _cs_get: {
        Args: { _org: string }
        Returns: {
          attachments_enabled: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
          voice_enabled: boolean
          voice_max_bytes: number
          voice_max_sec: number
        }
        SetofOptions: {
          from: "*"
          to: "cs_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _cs_in_hours: { Args: { _at: string; _hours: Json }; Returns: boolean }
      _cs_log: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity: string
          _id: string
          _org: string
        }
        Returns: undefined
      }
      _cs_my_roles: { Args: { _org: string }; Returns: string[] }
      _cs_ok: { Args: { _action: string; _org: string }; Returns: boolean }
      _cs_pick: {
        Args: {
          _at: string
          _conv: string
          _kind_conv: string
          _org: string
          _recipient_roles: string[]
          _school: string
          _seq: number
        }
        Returns: {
          activated_at: string | null
          active: boolean
          body: string
          cooldown_hours: number
          created_at: string
          created_by: string | null
          hours: Json
          id: string
          kind: string
          name: string
          org_id: string
          priority: number
          recipient_roles: string[]
          school_ids: string[]
          sender_label: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "cs_auto_rules"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _csmart_exact: { Args: { _s: string }; Returns: string }
      _csmart_key: { Args: { _s: string }; Returns: string }
      _ct_check: { Args: { _school: string }; Returns: undefined }
      _ct_nid: { Args: { _s: string }; Returns: string }
      _ct_plan: {
        Args: { _rows: Json; _school: string; _year: string }
        Returns: Json
      }
      _ct_txt: { Args: { _s: string }; Returns: string }
      _ct_yr: { Args: { _s: string }; Returns: string }
      _ctx_staff: { Args: { _org: string; _school: string }; Returns: boolean }
      _cv_can: {
        Args: {
          _action: string
          v: Database["public"]["Tables"]["cv_visits"]["Row"]
        }
        Returns: boolean
      }
      _cv_can_eval: { Args: { _teacher: string }; Returns: boolean }
      _cv_can_read: {
        Args: { v: Database["public"]["Tables"]["cv_visits"]["Row"] }
        Returns: boolean
      }
      _cv_codes: { Args: never; Returns: string[] }
      _dn_clean: { Args: { _s: string }; Returns: string }
      _dn_default: { Args: { _full: string }; Returns: string }
      _dn_norm: { Args: { _s: string }; Returns: string }
      _dn_org: { Args: { _r: Json; _t: string }; Returns: string }
      _dn_person_claim: {
        Args: { _nid: string; _org: string; _uid: string }
        Returns: string
      }
      _dn_same: {
        Args: {
          _nid: string
          _uid: string
          c: Database["public"]["Tables"]["person_display_names"]["Row"]
        }
        Returns: boolean
      }
      _dn_suggest: {
        Args: { _name: string; _nid: string; _org: string; _uid: string }
        Returns: string
      }
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
      _ev_assigned: { Args: { _teacher: string }; Returns: boolean }
      _ev_check: {
        Args: { _answers: Json; _complete: boolean; _items: Json }
        Returns: undefined
      }
      _ev_due_day: { Args: { _org: string }; Returns: number }
      _ev_form: {
        Args: { _kind: string; _org: string; _role: string }
        Returns: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          items: Json
          kind: string
          needs_owner_approval: boolean
          org_id: string
          published_at: string | null
          role_key: string
          status: string
          title: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "ev_forms"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _ev_forms_admin: { Args: { _org: string }; Returns: boolean }
      _ev_forms_can: {
        Args: { _action: string; _org: string }
        Returns: boolean
      }
      _ev_g_teachers: {
        Args: { _student: string }
        Returns: {
          full_name: string
          school_id: string
          subjects: string
          teacher_id: string
          year_id: string
        }[]
      }
      _ev_g_version: { Args: { _teacher: string; _ver: number }; Returns: Json }
      _ev_ok: {
        Args: { _action: string; _school: string; _section: string }
        Returns: boolean
      }
      _ev_org_read: { Args: { _org: string }; Returns: boolean }
      _ev_school_read: { Args: { _school: string }; Returns: boolean }
      _ev_score: { Args: { _answers: Json; _items: Json }; Returns: Json }
      _ev_seed: { Args: { _org: string }; Returns: undefined }
      _ev_staff_roles: {
        Args: { _school: string; _user: string }
        Returns: string[]
      }
      _ev_wide: {
        Args: { _action: string; _school: string; _section: string }
        Returns: boolean
      }
      _evt_app_file_ok: { Args: { _app: string }; Returns: boolean }
      _evt_caps_base: { Args: { _org: string }; Returns: Json }
      _evt_caps_for: { Args: { _kind: string; _school: string }; Returns: Json }
      _evt_check_answers: {
        Args: { _a: Json; _cat: string; _fields: Json }
        Returns: Json
      }
      _evt_check_fields: { Args: { _f: Json }; Returns: Json }
      _evt_clean: {
        Args: { _label: string; _max: number; _s: string }
        Returns: string
      }
      _evt_consent_reset: {
        Args: { _item: string; _why: string }
        Returns: undefined
      }
      _evt_core: { Args: { _kind: string }; Returns: Json }
      _evt_fields_for: { Args: { _cat: string; _fields: Json }; Returns: Json }
      _evt_file_field: { Args: { _fid: string; _fields: Json }; Returns: Json }
      _evt_file_slot: {
        Args: {
          _field: Json
          _item: Database["public"]["Tables"]["evt_items"]["Row"]
          _key: string
          _mime: string
          _name: string
          _size: number
          _user: string
        }
        Returns: Json
      }
      _evt_get_base: { Args: { _id: string }; Returns: Json }
      _evt_guardian_of: {
        Args: { _student: string; _uid: string }
        Returns: boolean
      }
      _evt_hit: {
        Args: { _bucket: string; _max: number; _window: string }
        Returns: boolean
      }
      _evt_insert_app: {
        Args: {
          _answers: Json
          _cat: string
          _client_key: string
          _item: string
          _source: string
          _student: string
          _user: string
          _version: number
        }
        Returns: Json
      }
      _evt_item_file_ok: { Args: { _item: string }; Returns: boolean }
      _evt_log: {
        Args: {
          _action: string
          _app: string
          _details: Json
          _internal?: boolean
          _item: string
        }
        Returns: undefined
      }
      _evt_mimes: { Args: { _accept: Json }; Returns: string[] }
      _evt_name: { Args: { _uid: string }; Returns: string }
      _evt_ok: { Args: { _action: string; _item: string }; Returns: boolean }
      _evt_outbox_claim: {
        Args: { _limit: number; _ready: boolean }
        Returns: {
          app_id: string
          attempts: number
          created_at: string
          dedupe_key: string
          detail: string | null
          id: string
          item_id: string
          kind: string
          params: Json
          phone: string
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "evt_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      _evt_outbox_done: {
        Args: { _detail: string; _id: string; _status: string }
        Returns: undefined
      }
      _evt_outbox_status: {
        Args: { _detail: string; _id: string; _status: string }
        Returns: boolean
      }
      _evt_phone: { Args: { _s: string }; Returns: string }
      _evt_public_app_files: { Args: { _code: string }; Returns: Json }
      _evt_public_file: {
        Args: {
          _client_key: string
          _field: string
          _ip: string
          _mime: string
          _name: string
          _size: number
          _token: string
        }
        Returns: Json
      }
      _evt_public_file_track: {
        Args: {
          _code: string
          _field: string
          _ip: string
          _mime: string
          _name: string
          _size: number
        }
        Returns: Json
      }
      _evt_public_files: { Args: { _token: string }; Returns: Json }
      _evt_public_get: { Args: { _token: string }; Returns: Json }
      _evt_public_submit: {
        Args: {
          _answers: Json
          _client_key: string
          _ip: string
          _token: string
          _version: number
        }
        Returns: Json
      }
      _evt_public_track: { Args: { _code: string; _ip: string }; Returns: Json }
      _evt_public_update: {
        Args: {
          _action: string
          _answers: Json
          _code: string
          _ip: string
          _rev: number
        }
        Returns: Json
      }
      _evt_reg_state: { Args: { _item: string }; Returns: string }
      _evt_roster: {
        Args: { _item: string }
        Returns: {
          app_id: string
          category: string
          extra: string
          name: string
          source: string
          student_id: string
        }[]
      }
      _evt_row: {
        Args: { i: Database["public"]["Tables"]["evt_items"]["Row"] }
        Returns: Json
      }
      _evt_save_base: { Args: { _p: Json }; Returns: Json }
      _evt_school_ok: {
        Args: { _action: string; _kind: string; _school: string }
        Returns: boolean
      }
      _evt_sec: { Args: { _kind: string }; Returns: string }
      _evt_targets: {
        Args: { _item: string }
        Returns: {
          student_id: string
        }[]
      }
      _evt_tell_family: {
        Args: { _item: string; _key: string; _title: string }
        Returns: undefined
      }
      _evt_tell_staff: {
        Args: {
          _app: string
          _body: string
          _item: string
          _key: string
          _title: string
        }
        Returns: undefined
      }
      _evt_tpl_can: {
        Args: { _action: string; _org: string; _school: string }
        Returns: boolean
      }
      _evt_tpl_clean: { Args: { _body: Json; _kind: string }; Returns: Json }
      _evt_tpl_default: { Args: { _kind: string }; Returns: Json }
      _evt_tpl_diff: { Args: { _new: Json; _old: Json }; Returns: Json }
      _evt_tpl_eff: { Args: { _kind: string; _school: string }; Returns: Json }
      _evt_tpl_row: {
        Args: { _kind: string; _org: string; _school: string }
        Returns: {
          created_at: string
          draft: Json
          draft_rev: number
          id: string
          kind: string
          org_id: string
          school_id: string | null
          updated_at: string
          updated_by: string | null
          use_custom: boolean
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "evt_tpls"
          isOneToOne: true
          isSetofReturn: false
        }
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
      _gv_host_ok: { Args: { _school: string; _uid: string }; Returns: boolean }
      _gv_level: {
        Args: { v: Database["public"]["Tables"]["gv_visits"]["Row"] }
        Returns: string
      }
      _gv_log: {
        Args: {
          _action: string
          _details: Json
          _internal?: boolean
          _v: string
        }
        Returns: undefined
      }
      _gv_ok: { Args: { _action: string; _school: string }; Returns: boolean }
      _gv_row: {
        Args: {
          _level: string
          v: Database["public"]["Tables"]["gv_visits"]["Row"]
        }
        Returns: Json
      }
      _gv_slot_err: {
        Args: { _d: string; _school: string; _t: string }
        Returns: string
      }
      _gv_tell: {
        Args: {
          _title: string
          _to_school: boolean
          v: Database["public"]["Tables"]["gv_visits"]["Row"]
        }
        Returns: undefined
      }
      _home_roles: { Args: { _me: string; _school: string }; Returns: Json }
      _hr_addr_json: {
        Args: {
          _full: boolean
          a: Database["public"]["Tables"]["hr_employee_addresses"]["Row"]
        }
        Returns: Json
      }
      _hr_adv_left: { Args: { _adv: string }; Returns: number }
      _hr_adv_new: {
        Args: { _emp: string; _org: string; _p: Json; _self: boolean }
        Returns: string
      }
      _hr_adv_row: {
        Args: {
          _self: boolean
          a: Database["public"]["Tables"]["hr_advances"]["Row"]
        }
        Returns: Json
      }
      _hr_alert_last_runs: { Args: never; Returns: Json }
      _hr_as_json: {
        Args: { c: Database["public"]["Tables"]["hr_asset_custodies"]["Row"] }
        Returns: Json
      }
      _hr_as_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_assign_json: {
        Args: { _emp: string; _only_active: boolean }
        Returns: Json
      }
      _hr_assignment_save_base: {
        Args: { _employee: string; _id: string; _p: Json; _reason?: string }
        Returns: string
      }
      _hr_at_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_at_bounds: {
        Args: {
          _date: string
          s: Database["public"]["Tables"]["hr_shifts"]["Row"]
        }
        Returns: Record<string, unknown>
      }
      _hr_at_closed: {
        Args: { _date: string; _school: string }
        Returns: boolean
      }
      _hr_at_compute: { Args: { _date: string; _emp: string }; Returns: string }
      _hr_at_day_json: {
        Args: { d: Database["public"]["Tables"]["hr_att_days"]["Row"] }
        Returns: Json
      }
      _hr_at_emp_json: {
        Args: { e: Database["public"]["Tables"]["hr_employees"]["Row"] }
        Returns: Json
      }
      _hr_at_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_at_punch_days: {
        Args: { _at: string; _emp: string }
        Returns: undefined
      }
      _hr_at_range: {
        Args: { _emp: string; _from: string; _to: string }
        Returns: undefined
      }
      _hr_at_school_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_at_shift: {
        Args: { _date: string; _emp: string }
        Returns: {
          break_min: number
          created_at: string
          created_by: string | null
          end_time: string
          grace_in_min: number
          grace_out_min: number
          id: string
          is_active: boolean
          name: string
          org_id: string
          school_id: string | null
          start_time: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "hr_shifts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _hr_att_dev_auth: { Args: { _id: string }; Returns: Json }
      _hr_att_ingest: { Args: { _dev: string; _rows: Json }; Returns: Json }
      _hr_att_my_schools: {
        Args: { _emp: string }
        Returns: {
          configured: boolean
          name: string
          school_id: string
        }[]
      }
      _hr_basic: { Args: { _d: Json }; Returns: Json }
      _hr_c_data: {
        Args: { _comp_edit: boolean; _keep: Json; _p: Json }
        Returns: Json
      }
      _hr_c_ok: { Args: { _action: string; _c: string }; Returns: boolean }
      _hr_c_render: {
        Args: {
          _c: Database["public"]["Tables"]["hr_contracts"]["Row"]
          _d: Json
        }
        Returns: Json
      }
      _hr_cat_check: {
        Args: { _cat: string; _old: string; _org: string }
        Returns: undefined
      }
      _hr_check_teacher: {
        Args: {
          _assign: string
          _emp: Database["public"]["Tables"]["hr_employees"]["Row"]
          _school: string
          _teacher: string
        }
        Returns: undefined
      }
      _hr_d_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_d_required: {
        Args: { _emp: string }
        Returns: {
          alert_days: number[]
          confidential: boolean
          created_at: string
          employee_upload: boolean
          id: string
          is_active: boolean
          name: string
          needs_expiry: boolean
          needs_number: boolean
          org_id: string
          required_all: boolean
          required_kinds: string[]
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "hr_doc_types"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      _hr_d_row: {
        Args: {
          _full: boolean
          d: Database["public"]["Tables"]["hr_documents"]["Row"]
        }
        Returns: Json
      }
      _hr_d_see: { Args: { _action: string; _doc: string }; Returns: boolean }
      _hr_d_self: { Args: { _emp: string }; Returns: boolean }
      _hr_d_status: {
        Args: { d: Database["public"]["Tables"]["hr_documents"]["Row"] }
        Returns: string
      }
      _hr_dec_row: {
        Args: { d: Database["public"]["Tables"]["hr_decisions"]["Row"] }
        Returns: Json
      }
      _hr_dv_json: {
        Args: { v: Database["public"]["Tables"]["hr_document_versions"]["Row"] }
        Returns: Json
      }
      _hr_emp_json: {
        Args: {
          _sensitive: boolean
          e: Database["public"]["Tables"]["hr_employees"]["Row"]
        }
        Returns: Json
      }
      _hr_emp_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_emp_school: { Args: { _emp: string }; Returns: string }
      _hr_employee_create_login_v1: {
        Args: {
          _base: string
          _org: string
          _p: Json
          _reason?: string
          _uid: string
        }
        Returns: string
      }
      _hr_employee_create_login_v1_ops: {
        Args: { _org: string; _p: Json; _reason: string; _uid: string }
        Returns: string
      }
      _hr_employee_save_base: {
        Args: { _id: string; _org: string; _p: Json; _reason?: string }
        Returns: string
      }
      _hr_ext_on: { Args: { _ext: string; _org: string }; Returns: boolean }
      _hr_geo_m: {
        Args: { a1: number; a2: number; o1: number; o2: number }
        Returns: number
      }
      _hr_hs_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_hs_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_hs_place: {
        Args: { _emp: string; _start: string; _unit: string }
        Returns: string
      }
      _hr_in_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_in_member_json: {
        Args: {
          _sens: boolean
          m: Database["public"]["Tables"]["hr_in_members"]["Row"]
        }
        Returns: Json
      }
      _hr_in_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_in_org: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_in_status: {
        Args: { m: Database["public"]["Tables"]["hr_in_members"]["Row"] }
        Returns: string
      }
      _hr_is_owner_emp: { Args: { _emp: string }; Returns: boolean }
      _hr_l_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_l_new: {
        Args: {
          _addr: string
          _emp: string
          _org: string
          _parent: string
          _purpose: string
          _tpl: string
        }
        Returns: string
      }
      _hr_l_notify: {
        Args: {
          _key: string
          _title: string
          _who: string
          l: Database["public"]["Tables"]["hr_letters"]["Row"]
        }
        Returns: undefined
      }
      _hr_l_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_l_render: {
        Args: { _body: string; _mask: boolean; _vals: Json }
        Returns: Json
      }
      _hr_l_row: {
        Args: {
          _full: boolean
          l: Database["public"]["Tables"]["hr_letters"]["Row"]
        }
        Returns: Json
      }
      _hr_l_self: { Args: { _emp: string }; Returns: boolean }
      _hr_l_unknown: { Args: { _body: string }; Returns: string[] }
      _hr_l_values: {
        Args: {
          _addressee: string
          _emp: string
          _purpose: string
          _ref: string
        }
        Returns: Json
      }
      _hr_log: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity: string
          _id: string
          _org: string
          _reason: string
        }
        Returns: undefined
      }
      _hr_login_plan_one: {
        Args: { _nid: string; _org: string; _phone: string }
        Returns: Json
      }
      _hr_login_roles: {
        Args: { _org: string; _school: string }
        Returns: string[]
      }
      _hr_lv_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_lv_balance: {
        Args: { _emp: string; _type: string; _year: number }
        Returns: number
      }
      _hr_lv_check: {
        Args: {
          _emp: string
          _final: boolean
          _from: string
          _parent: string
          _self: string
          _to: string
          _type: string
        }
        Returns: Json
      }
      _hr_lv_days: {
        Args: { _from: string; _mode: string; _org: string; _to: string }
        Returns: number
      }
      _hr_lv_manager: { Args: { _emp: string }; Returns: string }
      _hr_lv_notify_emp: {
        Args: {
          _key: string
          _title: string
          r: Database["public"]["Tables"]["hr_leave_requests"]["Row"]
        }
        Returns: undefined
      }
      _hr_lv_notify_hr: {
        Args: {
          _key: string
          _title: string
          r: Database["public"]["Tables"]["hr_leave_requests"]["Row"]
        }
        Returns: undefined
      }
      _hr_lv_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_lv_pending: {
        Args: { _emp: string; _except: string; _type: string; _year: number }
        Returns: number
      }
      _hr_lv_pol_json: {
        Args: { p: Database["public"]["Tables"]["hr_leave_policies"]["Row"] }
        Returns: Json
      }
      _hr_lv_policy: {
        Args: { _date: string; _emp: string; _type: string }
        Returns: {
          allow_negative: boolean
          annual_days: number | null
          count_mode: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          max_days: number | null
          org_id: string
          school_id: string | null
          type_id: string
          uses_balance: boolean
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_leave_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _hr_lv_route: {
        Args: {
          _key: string
          r: Database["public"]["Tables"]["hr_leave_requests"]["Row"]
        }
        Returns: undefined
      }
      _hr_lv_row: {
        Args: {
          _full: boolean
          r: Database["public"]["Tables"]["hr_leave_requests"]["Row"]
        }
        Returns: Json
      }
      _hr_lv_self: { Args: { _emp: string }; Returns: boolean }
      _hr_lv_settle: {
        Args: {
          _key: string
          _reason: string
          _target: number
          r: Database["public"]["Tables"]["hr_leave_requests"]["Row"]
        }
        Returns: undefined
      }
      _hr_lv_sync: {
        Args: {
          _emp: string
          _from: string
          _new: string
          _old: string
          _to: string
        }
        Returns: undefined
      }
      _hr_lv_taken: { Args: { _req: string }; Returns: number }
      _hr_me_emp: { Args: { _org: string }; Returns: string }
      _hr_mgr_kind: { Args: { _emp: string }; Returns: string }
      _hr_mn_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_mn_ok: { Args: { _action: string; _emp: string }; Returns: boolean }
      _hr_month: { Args: { _m: string }; Returns: string }
      _hr_my_contract_v0: { Args: { _id: string }; Returns: Json }
      _hr_my_contracts_v0: { Args: { _org: string }; Returns: Json }
      _hr_my_documents_v0: { Args: { _org: string }; Returns: Json }
      _hr_my_employment_v0: { Args: { _org: string }; Returns: Json }
      _hr_my_money_v0: { Args: { _org: string }; Returns: Json }
      _hr_my_payslip_v0: { Args: { _id: string }; Returns: Json }
      _hr_name: { Args: { _u: string }; Returns: string }
      _hr_open_check: {
        Args: { _kind: string; _org: string; _rows: Json; _stage?: string }
        Returns: Json
      }
      _hr_open_gate: {
        Args: { _action: string; _kind: string; _org: string }
        Returns: boolean
      }
      _hr_open_json: {
        Args: { b: Database["public"]["Tables"]["hr_open_batches"]["Row"] }
        Returns: Json
      }
      _hr_open_row_ok: {
        Args: { _emp: string; _kind: string; _stage: string }
        Returns: boolean
      }
      _hr_org_ok: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_owner_emp: { Args: { _org: string; _uid: string }; Returns: string }
      _hr_pay_build: { Args: { _run: string }; Returns: undefined }
      _hr_pf_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_pf_check_criteria: { Args: { _c: Json }; Returns: Json }
      _hr_pf_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_pf_row: {
        Args: {
          _full: boolean
          r: Database["public"]["Tables"]["hr_pf_reviews"]["Row"]
        }
        Returns: Json
      }
      _hr_pf_sources: { Args: { _emp: string }; Returns: Json }
      _hr_pf_total: { Args: { _c: Json; _s: Json }; Returns: number }
      _hr_pf_user_can: {
        Args: { _action: string; _school: string; _uid: string }
        Returns: boolean
      }
      _hr_plan_guardian: {
        Args: { _n: string; _org: string; _ph: string }
        Returns: Json
      }
      _hr_pm_can_decide: {
        Args: { r: Database["public"]["Tables"]["hr_perm_requests"]["Row"] }
        Returns: boolean
      }
      _hr_pm_check: {
        Args: { _emp: string; _except: string; _p: Json }
        Returns: Json
      }
      _hr_pm_label: { Args: { _kind: string }; Returns: string }
      _hr_pm_notify: {
        Args: {
          _key: string
          r: Database["public"]["Tables"]["hr_perm_requests"]["Row"]
        }
        Returns: undefined
      }
      _hr_pm_range: {
        Args: {
          _df: string
          _dt: string
          _kind: string
          _tf: string
          _tt: string
        }
        Returns: unknown
      }
      _hr_pm_row: {
        Args: { r: Database["public"]["Tables"]["hr_perm_requests"]["Row"] }
        Returns: Json
      }
      _hr_pol: {
        Args: { _month: string; _org: string; _topic: string }
        Returns: {
          effective_from: string
          id: string
          org_id: string
          params: Json
          reason: string
          set_at: string
          set_by: string
          status: string
          topic: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "hr_pay_policies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _hr_pol_json: { Args: { _month: string; _org: string }; Returns: Json }
      _hr_prof_json: { Args: { _emp: string; _sens: boolean }; Returns: Json }
      _hr_purge_org: { Args: { _org: string }; Returns: undefined }
      _hr_py_notify: {
        Args: {
          _action: string
          _body: string
          _key: string
          _link: string
          _org: string
          _skip: string
          _title: string
        }
        Returns: undefined
      }
      _hr_py_ok: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_rc_any: { Args: { _action: string; _org: string }; Returns: boolean }
      _hr_rc_cand_row: {
        Args: {
          _full: boolean
          c: Database["public"]["Tables"]["hr_rc_candidates"]["Row"]
        }
        Returns: Json
      }
      _hr_rc_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_rc_vac_row: {
        Args: { v: Database["public"]["Tables"]["hr_rc_vacancies"]["Row"] }
        Returns: Json
      }
      _hr_rep_meta: { Args: never; Returns: Json }
      _hr_rep_meta_v1: { Args: never; Returns: Json }
      _hr_rep_rows: {
        Args: { _f: Json; _key: string; _org: string }
        Returns: Json
      }
      _hr_rep_rows_x: {
        Args: { _f: Json; _key: string; _org: string }
        Returns: Json
      }
      _hr_rep_sec: {
        Args: { _action: string; _org: string; _sec: string }
        Returns: boolean
      }
      _hr_run_row: {
        Args: { r: Database["public"]["Tables"]["hr_pay_runs"]["Row"] }
        Returns: Json
      }
      _hr_school_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _hr_self_live: { Args: { _emp: string }; Returns: boolean }
      _hr_settings: {
        Args: { _org: string }
        Returns: {
          alert_days_reviewed: boolean
          alerts_active: boolean
          alerts_decided_at: string | null
          alerts_decided_by: string | null
          alerts_decision_reason: string | null
          alerts_source: string | null
          contract_alert_days: number[]
          notify_employee_expiry: boolean
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "hr_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _hr_title_norm: { Args: { _t: string }; Returns: string }
      _hr_today: { Args: never; Returns: string }
      _hr_v_json: {
        Args: {
          _comp: boolean
          v: Database["public"]["Tables"]["hr_contract_versions"]["Row"]
        }
        Returns: Json
      }
      _hrc_renewal_gap: { Args: { _c: string }; Returns: number }
      _hrc_renewed_ok: { Args: { _c: string }; Returns: boolean }
      _hrs_org: {
        Args: { _action: string; _org: string; _sec: string }
        Returns: boolean
      }
      _hrs_school: {
        Args: { _action: string; _school: string; _sec: string }
        Returns: boolean
      }
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
      _identity_conflict: {
        Args: { _kind: string; _subject: string; _uid: string }
        Returns: boolean
      }
      _idl_hash: { Args: { _s: string }; Returns: string }
      _idl_issue: { Args: { _code: string; _nid: string }; Returns: Json }
      _idl_mark_sent: {
        Args: { _challenge: string; _channel: string; _status: string }
        Returns: undefined
      }
      _idl_nid: { Args: { _s: string }; Returns: string }
      _idl_phone: { Args: { _s: string }; Returns: string }
      _idl_resolve: {
        Args: { _nid: string }
        Returns: {
          phone: string
          problem: string
          user_id: string
        }[]
      }
      _idl_student: { Args: { _csmart: string; _nid: string }; Returns: Json }
      _idl_verify: {
        Args: { _challenge: string; _code: string }
        Returns: Json
      }
      _invite_valid: {
        Args: { r: Database["public"]["Tables"]["invitations"]["Row"] }
        Returns: boolean
      }
      _la_edit_days: { Args: { _school: string }; Returns: number }
      _la_first_slot: {
        Args: { _date: string; _school: string; _section: string }
        Returns: string
      }
      _la_is_daily: { Args: { _date: string; _slot: string }; Returns: boolean }
      _la_mine: { Args: { _date: string; _slot: string }; Returns: boolean }
      _la_read: { Args: { _id: string }; Returns: boolean }
      _la_taker: { Args: { _date: string; _slot: string }; Returns: string }
      _la_write_days: { Args: { _id: string }; Returns: undefined }
      _la_writer: {
        Args: { a: Database["public"]["Tables"]["lesson_attendance"]["Row"] }
        Returns: string
      }
      _link_section_room: { Args: { _classroom: string }; Returns: string }
      _live_staff: { Args: { _school: string }; Returns: boolean }
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
      _msg_file_row_ok: { Args: { _file: string }; Returns: boolean }
      _mt_action_core: {
        Args: { _action: string; _data: Json; _id: string; _rev: number }
        Returns: Json
      }
      _mt_can_read: { Args: { _id: string; _uid: string }; Returns: boolean }
      _mt_doc_state: { Args: { _d: string }; Returns: string }
      _mt_ev: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _body: string
          _req: string
          _vis: string
        }
        Returns: undefined
      }
      _mt_get_core: { Args: { _id: string }; Returns: Json }
      _mt_note: {
        Args: {
          _key: string
          _user: string
          _what: string
          r: Database["public"]["Tables"]["mt_requests"]["Row"]
        }
        Returns: undefined
      }
      _mt_notify_follow: {
        Args: {
          _key: string
          _what: string
          r: Database["public"]["Tables"]["mt_requests"]["Row"]
        }
        Returns: number
      }
      _mt_ok: {
        Args: { _action: string; _kind: string; _school: string; _uid: string }
        Returns: boolean
      }
      _mt_owners: { Args: { _org: string }; Returns: string[] }
      _mt_row: {
        Args: { r: Database["public"]["Tables"]["mt_requests"]["Row"] }
        Returns: Json
      }
      _mt_sec: { Args: { _kind: string }; Returns: string }
      _mt_team: {
        Args: {
          _uid: string
          r: Database["public"]["Tables"]["mt_requests"]["Row"]
        }
        Returns: boolean
      }
      _mt_users: {
        Args: { _action: string; _kind: string; _school: string }
        Returns: string[]
      }
      _new_card_code: { Args: never; Returns: string }
      _nid: { Args: { _v: string }; Returns: string }
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
      _od_claim: { Args: { _file: string; _org: string }; Returns: undefined }
      _od_file_ok: { Args: { _file: string }; Returns: boolean }
      _od_ok: {
        Args: {
          _action: string
          _all: boolean
          _org: string
          _schools: string[]
        }
        Returns: boolean
      }
      _od_status: { Args: { _exp: string }; Returns: string }
      _otp_may_send: { Args: { _phone: string; _uid: string }; Returns: string }
      _pc_bal: {
        Args: { _custody: string; _exclude?: string }
        Returns: {
          adjusted: number
          available: number
          book: number
          carried: number
          disbursed: number
          pending: number
          refunds: number
          returned: number
          spent: number
          topups: number
        }[]
      }
      _pc_branches: {
        Args: { _action: string; _org: string; _uid: string }
        Returns: string[]
      }
      _pc_calc: {
        Args: {
          _amount: number
          _incl: boolean
          _rate: number
          _taxable: boolean
        }
        Returns: Record<string, unknown>
      }
      _pc_can_custody: {
        Args: { _action: string; _id: string }
        Returns: boolean
      }
      _pc_can_expense: {
        Args: { _action: string; _id: string }
        Returns: boolean
      }
      _pc_check_answers: {
        Args: { _a: Json; _expense: string; _fields: Json; _strict: boolean }
        Returns: Json
      }
      _pc_check_core: { Args: { _c: Json }; Returns: Json }
      _pc_check_custom: { Args: { _f: Json }; Returns: Json }
      _pc_core_default: { Args: never; Returns: Json }
      _pc_custody_row: {
        Args: { c: Database["public"]["Tables"]["pc_custodies"]["Row"] }
        Returns: Json
      }
      _pc_expense_approved: { Args: { _eid: string }; Returns: undefined }
      _pc_expense_ext: {
        Args: { _d: Json; _eid: string; _new: boolean }
        Returns: undefined
      }
      _pc_expense_row: {
        Args: { e: Database["public"]["Tables"]["pc_expenses"]["Row"] }
        Returns: Json
      }
      _pc_expense_submit_check: { Args: { _eid: string }; Returns: undefined }
      _pc_file_ok: {
        Args: { _category: string; _id: string }
        Returns: boolean
      }
      _pc_files: { Args: { _category: string; _id: string }; Returns: Json }
      _pc_limit: { Args: { _org: string; _uid: string }; Returns: number }
      _pc_log: {
        Args: {
          _action: string
          _after: Json
          _before: Json
          _entity: string
          _id: string
          _org: string
          _reason: string
        }
        Returns: undefined
      }
      _pc_low_check: { Args: { _custody: string }; Returns: undefined }
      _pc_name: { Args: { _u: string }; Returns: string }
      _pc_need_lines_json: { Args: { _id: string }; Returns: Json }
      _pc_need_net: { Args: { _req: string }; Returns: number }
      _pc_need_notify_owners: {
        Args: {
          _body: string
          _key: string
          _org: string
          _school: string
          _title: string
        }
        Returns: undefined
      }
      _pc_need_officers: {
        Args: { _org: string; _school: string }
        Returns: string[]
      }
      _pc_need_ok: { Args: { _id: string }; Returns: boolean }
      _pc_need_route: { Args: { _id: string }; Returns: undefined }
      _pc_need_used: {
        Args: { _approved_only: boolean; _line: string }
        Returns: number
      }
      _pc_need_used_excl: {
        Args: { _eid: string; _line: string }
        Returns: number
      }
      _pc_notify: {
        Args: {
          _body: string
          _key: string
          _school: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      _pc_notify_can: {
        Args: {
          _action: string
          _body: string
          _exclude: string[]
          _key: string
          _org: string
          _school: string
          _title: string
        }
        Returns: undefined
      }
      _pc_ok: {
        Args: {
          _action: string
          _creator: string
          _holder: string
          _org: string
          _school: string
          _uid: string
        }
        Returns: boolean
      }
      _pc_overdue: {
        Args: { _exclude: string; _holder: string; _org: string }
        Returns: number
      }
      _pc_ref: {
        Args: { _kind: string; _org: string; _prefix: string }
        Returns: string
      }
      _pc_req_ok: { Args: { _action: string; _id: string }; Returns: boolean }
      _pc_request_row: {
        Args: { r: Database["public"]["Tables"]["pc_requests"]["Row"] }
        Returns: Json
      }
      _pc_safe: { Args: { _t: string }; Returns: boolean }
      _pc_settings: {
        Args: { _org: string }
        Returns: {
          block_overdue: boolean
          due_soon_days: number
          low_balance: number
          org_id: string
          purchase_request_above: number | null
          require_attachment: boolean
          rev: number
          updated_at: string
          updated_by: string | null
          vat_inclusive: boolean
          vat_rate: number
        }
        SetofOptions: {
          from: "*"
          to: "pc_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _pc_settle_check: { Args: { _id: string }; Returns: Json }
      _pc_today: { Args: never; Returns: string }
      _people_pool: {
        Args: { _org: string; _post: string; _purpose: string; _school: string }
        Returns: {
          role: string
          school_id: string
          user_id: string
        }[]
      }
      _people_pool_v6: {
        Args: { _org: string; _post: string; _purpose: string; _school: string }
        Returns: {
          role: string
          school_id: string
          user_id: string
        }[]
      }
      _perm_allows_user: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_area: { Args: { _section: string }; Returns: string }
      _perm_base: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_base_v11: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_base_v2: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_base_v7: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_base_v9: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_catalog_base: { Args: never; Returns: Json }
      _perm_catalog_v11: { Args: never; Returns: Json }
      _perm_catalog_v12: { Args: never; Returns: Json }
      _perm_catalog_v2: { Args: never; Returns: Json }
      _perm_catalog_v3: { Args: never; Returns: Json }
      _perm_catalog_v4: { Args: never; Returns: Json }
      _perm_catalog_v6: { Args: never; Returns: Json }
      _perm_catalog_v8: { Args: never; Returns: Json }
      _perm_catalog_v9: { Args: never; Returns: Json }
      _perm_denied: {
        Args: { _action: string; _org: string; _section: string; _uid: string }
        Returns: boolean
      }
      _perm_granted: {
        Args: {
          _action: string
          _school: string
          _section: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_has_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _school: string
          _uid: string
        }
        Returns: boolean
      }
      _perm_owner: { Args: { _org: string; _uid: string }; Returns: boolean }
      _perm_staff: { Args: { _org: string; _user: string }; Returns: boolean }
      _perm_valid: {
        Args: { _action: string; _scope: string; _section: string }
        Returns: boolean
      }
      _perm_valid_base: {
        Args: { _action: string; _scope: string; _section: string }
        Returns: boolean
      }
      _perm_valid_v7: {
        Args: { _action: string; _scope: string; _section: string }
        Returns: boolean
      }
      _pickup_delegate_set: {
        Args: { _d: Json; _id: string; _mode: string; _person: string }
        Returns: undefined
      }
      _pp_name: { Args: { _u: string }; Returns: string }
      _pp_note_can: {
        Args: {
          _action: string
          n: Database["public"]["Tables"]["pp_notes"]["Row"]
        }
        Returns: boolean
      }
      _pp_ok: {
        Args: { _action: string; _id: string; _kind: string }
        Returns: boolean
      }
      _pp_rec: {
        Args: { _id: string; _kind: string }
        Returns: {
          display_name: string
          full_name: string
          org: string
          schools: string[]
          status: string
          uid: string
        }[]
      }
      _pp_schools: {
        Args: { _action: string; _org: string }
        Returns: string[]
      }
      _pp_tag_apply: {
        Args: { _id: string; _kind: string; _on: boolean; _tag: string }
        Returns: string
      }
      _pp_tags_manager: { Args: { _org: string }; Returns: boolean }
      _provision_link: {
        Args: {
          _actor: string
          _kind: string
          _pending: boolean
          _subject: string
          _uid: string
        }
        Returns: string
      }
      _publish_homework_v0: { Args: { _id: string }; Returns: string }
      _regroup_counts: { Args: { _school: string }; Returns: Json }
      _report_reviewer: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _revise_homework_v0: {
        Args: { _d: Json; _id: string; _note: string }
        Returns: number
      }
      _save_homework_v0: { Args: { _d: Json; _id: string }; Returns: string }
      _scope_manager: {
        Args: { _org: string; _school: string }
        Returns: boolean
      }
      _scope_rank: { Args: { _s: string }; Returns: number }
      _section_title: { Args: { _section: string }; Returns: string }
      _section_users: {
        Args: { _guardians: boolean; _section: string; _year: string }
        Returns: string[]
      }
      _set_homework_kind_v0: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      _staff_overrides: {
        Args: {
          _actor: string
          _org: string
          _ov: Json
          _reason: string
          _uid: string
        }
        Returns: number
      }
      _staff_provision:
        | {
            Args: {
              _actor: string
              _base: string
              _is_new: boolean
              _name: string
              _org: string
              _reason: string
              _roles: Json
              _schools: string[]
              _uid: string
              _username: string
            }
            Returns: Json
          }
        | {
            Args: {
              _actor: string
              _base: string
              _is_new: boolean
              _name: string
              _org: string
              _overrides: Json
              _reason: string
              _roles: Json
              _schools: string[]
              _uid: string
              _username: string
            }
            Returns: Json
          }
      _staff_reset: {
        Args: { _actor: string; _org: string; _reason: string; _uid: string }
        Returns: undefined
      }
      _staff_title: {
        Args: { _role: string; _school: string; _uid: string }
        Returns: string
      }
      _stage_student_password: {
        Args: { _actor: string; _student: string; _uid: string }
        Returns: undefined
      }
      _start_direct_conversation_v0: {
        Args: { _other: string; _school: string }
        Returns: string
      }
      _start_family_conversation_v0: {
        Args: { _guardian: string; _staff_user: string; _student: string }
        Returns: string
      }
      _start_student_conversation_v0: {
        Args: { _student: string }
        Returns: string
      }
      _storage_file_ok: { Args: { _name: string }; Returns: boolean }
      _student_ok: {
        Args: { _student: string; _teacher: string }
        Returns: boolean
      }
      _support_action_core: {
        Args: {
          _action: string
          _reason?: string
          _rev: number
          _ticket: string
          _value?: string
        }
        Returns: undefined
      }
      _support_add_work: {
        Args: {
          _days: number[]
          _e: string
          _hours: number
          _s: string
          _start: string
        }
        Returns: string
      }
      _support_add_work_h: {
        Args: {
          _days: number[]
          _e: string
          _hours: number
          _org: string
          _s: string
          _school: string
          _start: string
        }
        Returns: string
      }
      _support_assign_target: {
        Args: {
          _uid: string
          t: Database["public"]["Tables"]["support_tickets"]["Row"]
        }
        Returns: string
      }
      _support_event: {
        Args: {
          _action: string
          _d: Json
          _from: string
          _t: string
          _to: string
        }
        Returns: undefined
      }
      _support_hours_for: {
        Args: { _dept: string; _org: string; _school: string; _scope: string }
        Returns: {
          days: number[]
          e: string
          s: string
        }[]
      }
      _support_is_follower: {
        Args: { _t: Database["public"]["Tables"]["support_tickets"]["Row"] }
        Returns: boolean
      }
      _support_notify: {
        Args: {
          _key: string
          _kind: string
          _t: Database["public"]["Tables"]["support_tickets"]["Row"]
          _title: string
          _to_managers: boolean
        }
        Returns: undefined
      }
      _support_notify_one: {
        Args: {
          _key: string
          _link: string
          _t: Database["public"]["Tables"]["support_tickets"]["Row"]
          _title: string
          _u: string
        }
        Returns: undefined
      }
      _support_ok: {
        Args: { _action: string; _school: string }
        Returns: boolean
      }
      _support_policy: {
        Args: { _org: string; _scope: string }
        Returns: {
          escalate_to: string | null
          id: string
          org_id: string | null
          reopen_days: number
          response_note: string
          sla: Json
          updated_at: string
          work_days: number[]
          work_end: string
          work_hours: string
          work_start: string
        }
        SetofOptions: {
          from: "*"
          to: "support_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _support_route_ok: {
        Args: { _school: string; _ticket: string }
        Returns: boolean
      }
      _support_settings_ok: { Args: { _org: string }; Returns: boolean }
      _support_staff_live: {
        Args: {
          _t: Database["public"]["Tables"]["support_tickets"]["Row"]
          _u: string
        }
        Returns: boolean
      }
      _support_tcan: {
        Args: {
          _action: string
          _t: Database["public"]["Tables"]["support_tickets"]["Row"]
        }
        Returns: boolean
      }
      _support_user_school: {
        Args: { _fallback: string; _org: string; _u: string }
        Returns: string
      }
      _sync_school_classes: { Args: { _school: string }; Returns: number }
      _task_target_ok: {
        Args: { _school: string; _user: string }
        Returns: boolean
      }
      _teaches_section: {
        Args: { _section: string; _user: string }
        Returns: boolean
      }
      _tmp_diag_psp: { Args: { _org: string; _uid: string }; Returns: Json }
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
      _vc_manage: { Args: { _school: string }; Returns: boolean }
      _vc_student: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      _vc_teacher: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      accept_invitation: { Args: { _token: string }; Returns: string }
      accept_my_invitations: { Args: never; Returns: number }
      account_status: {
        Args: { _ids: string[]; _kind: string }
        Returns: {
          state: string
          subject_id: string
        }[]
      }
      ack_circular: { Args: { _id: string }; Returns: number }
      ad_act: {
        Args: {
          _action: string
          _id: string
          _key: string
          _p: Json
          _rev: number
        }
        Returns: Json
      }
      ad_alerts_tick: { Args: never; Returns: number }
      ad_create: {
        Args: { _d: Json; _key: string; _org: string; _school: string }
        Returns: string
      }
      ad_get: { Args: { _id: string }; Returns: Json }
      ad_link_candidates: { Args: { _id: string; _q: string }; Returns: Json }
      ad_list: {
        Args: { _f?: Json; _limit?: number; _offset?: number; _org: string }
        Returns: Json
      }
      ad_me: { Args: { _org: string }; Returns: Json }
      ad_settings_get: { Args: { _org: string }; Returns: Json }
      ad_settings_save: {
        Args: {
          _defaults: Json
          _org: string
          _school_map: Json
          _stage_map: Json
          _year: string
        }
        Returns: undefined
      }
      ad_source_create: { Args: { _name: string; _org: string }; Returns: Json }
      ad_source_list: { Args: { _org: string }; Returns: Json }
      ad_source_rotate: { Args: { _id: string }; Returns: Json }
      ad_source_set_active: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      ad_students: {
        Args: { _f?: Json; _limit?: number; _offset?: number; _org: string }
        Returns: Json
      }
      ad_summary: { Args: { _org: string; _school?: string }; Returns: Json }
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
      adm_meeting_audience_get: { Args: { _id: string }; Returns: Json }
      adm_meeting_audience_preview: {
        Args: { _picks: string[]; _school: string; _scope: string; _t: Json }
        Returns: Json
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
      adm_meeting_set_audience: {
        Args: { _id: string; _rev: number; _t: Json }
        Returns: Json
      }
      adm_minutes_confirm: {
        Args: { _id: string; _rev: number }
        Returns: undefined
      }
      adm_minutes_save: {
        Args: { _d: Json; _meeting: string; _rev: number }
        Returns: Json
      }
      adm_my_meetings: {
        Args: never
        Returns: {
          am_organizer: boolean
          duration_min: number
          id: string
          invited_at: string
          live_status: string
          location: string
          mode: string
          my_note: string
          my_rsvp: string
          needs_rsvp: boolean
          organizer_name: string
          school_name: string
          starts_at: string
          status: string
          title: string
        }[]
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
      att_daily_settings_save: {
        Args: { _days: number; _school: string }
        Returns: undefined
      }
      att_daily_since: { Args: never; Returns: string }
      att_day_event: {
        Args: { _kind: string; _reason: string; _student: string }
        Returns: undefined
      }
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
      att_roster: {
        Args: { _school: string }
        Returns: {
          full_name: string
          id: string
          section: string
        }[]
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
      bc_add_file: {
        Args: { _id: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      bc_copy: { Args: { _id: string }; Returns: string }
      bc_discard: { Args: { _id: string; _rev: number }; Returns: undefined }
      bc_files: { Args: { _id: string }; Returns: Json }
      bc_get: { Args: { _id: string }; Returns: Json }
      bc_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      bc_my: { Args: { _id: string }; Returns: Json }
      bc_people: {
        Args: { _ids?: string[]; _org: string; _q: string; _t: Json }
        Returns: Json
      }
      bc_preview: { Args: { _org: string; _t: Json }; Returns: Json }
      bc_remove_file: { Args: { _file: string }; Returns: undefined }
      bc_save: {
        Args: {
          _client?: string
          _id: string
          _org: string
          _p: Json
          _rev?: number
        }
        Returns: Json
      }
      bc_scope: { Args: { _org: string }; Returns: Json }
      bc_send: {
        Args: { _fingerprint: string; _id: string; _rev: number }
        Returns: Json
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
      can_view_section_room: { Args: { _room: string }; Returns: boolean }
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
      class_group_add_member: {
        Args: { _conv: string; _reason: string; _user: string }
        Returns: undefined
      }
      class_group_candidates: {
        Args: { _conv: string; _q?: string }
        Returns: {
          full_name: string
          label: string
          user_id: string
        }[]
      }
      class_group_delete_message: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      class_group_log: {
        Args: { _conv: string }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          details: Json
        }[]
      }
      class_group_members: {
        Args: { _conv: string }
        Returns: {
          full_name: string
          label: string
          overridden: boolean
          override_reason: string
          reasons: string[]
          removed: boolean
          role: string
          user_id: string
        }[]
      }
      class_group_migrate: { Args: { _school: string }; Returns: Json }
      class_group_preview: {
        Args: { _school: string }
        Returns: {
          class_conv: string
          class_title: string
          course_conv: string
          course_title: string
          files: number
          messages: number
          section_label: string
          status: string
        }[]
      }
      class_group_remove_member: {
        Args: { _conv: string; _reason: string; _user: string }
        Returns: undefined
      }
      class_group_restore_auto: {
        Args: { _conv: string; _user: string }
        Returns: undefined
      }
      class_group_rollback: { Args: { _school: string }; Returns: Json }
      class_group_set_description: {
        Args: { _conv: string; _description: string }
        Returns: undefined
      }
      class_group_set_role: {
        Args: { _conv: string; _role: string; _user: string }
        Returns: undefined
      }
      class_group_successor: { Args: { _conv: string }; Returns: string }
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
      classroom_regroup: { Args: { _school?: string }; Returns: Json }
      cleanup_health: { Args: never; Returns: Json }
      conv_access_ok: { Args: { _conv: string }; Returns: boolean }
      conv_files: {
        Args: { _before: string; _conv: string; _limit?: number; _tab: string }
        Returns: {
          created_at: string
          duration: number
          id: string
          message_id: string
          mime: string
          name: string
          sender_name: string
          seq: number
          size_bytes: number
          storage_path: string
        }[]
      }
      conv_hidden_count: { Args: { _conv: string }; Returns: number }
      conv_messages: {
        Args: { _before?: number; _conv: string; _limit?: number }
        Returns: {
          body: string
          created_at: string
          deleted_at: string
          edited_at: string
          files: Json
          id: string
          kind: string
          masked: boolean
          mine: boolean
          pinned_at: string
          reply_to: string
          sender_id: string
          sender_label: string
          sender_name: string
          seq: number
        }[]
      }
      conv_send_block: { Args: { _conv: string }; Returns: string }
      conversation_people: {
        Args: { _conv: string }
        Returns: {
          full_name: string
          joined_at: string
          label: string
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
      create_evt_file: {
        Args: { _item: string; _mime: string; _name: string; _size: number }
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
      create_mt_file: {
        Args: { _id: string; _mime: string; _name: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_organization: {
        Args: { _org_name: string; _school_name: string }
        Returns: string
      }
      create_pc_file: {
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
      create_support_draft_file: {
        Args: { _mime: string; _name: string; _school: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_support_file: {
        Args: { _mime: string; _name: string; _size: number; _ticket: string }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      create_voice_file: {
        Args: { _conv: string; _duration: number; _mime: string; _size: number }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      cs_admin: { Args: { _org: string }; Returns: Json }
      cs_conv_limits: { Args: { _conv: string }; Returns: Json }
      cs_my_replies: {
        Args: { _conv: string }
        Returns: {
          body: string
          id: string
          shortcut: string
          title: string
        }[]
      }
      cs_reply_save: {
        Args: {
          _active: boolean
          _body: string
          _id: string
          _org: string
          _roles: string[]
          _shortcut: string
          _title: string
        }
        Returns: string
      }
      cs_rule_preview: {
        Args: {
          _at: string
          _first: boolean
          _org: string
          _role: string
          _school: string
        }
        Returns: Json
      }
      cs_rule_save: {
        Args: {
          _active: boolean
          _body: string
          _cooldown: number
          _hours: Json
          _id: string
          _kind: string
          _label: string
          _name: string
          _org: string
          _priority: number
          _roles: string[]
          _schools: string[]
        }
        Returns: string
      }
      cs_settings_save: {
        Args: {
          _attach: boolean
          _max_mb: number
          _max_sec: number
          _org: string
          _voice: boolean
        }
        Returns: undefined
      }
      ct_apply: {
        Args: {
          _full_confirmed: boolean
          _hash: string
          _rows: Json
          _school: string
          _year: string
        }
        Returns: Json
      }
      ct_can: { Args: { _school: string }; Returns: boolean }
      ct_preview: {
        Args: { _rows: Json; _school: string; _year: string }
        Returns: Json
      }
      ct_set: {
        Args: {
          _status: string
          _student: string
          _type: string
          _year: string
        }
        Returns: undefined
      }
      current_timetable: {
        Args: { _date: string; _school: string }
        Returns: string
      }
      cv_correct: {
        Args: {
          _id: string
          _notes: Json
          _reason: string
          _scores: Json
          _summary: string
        }
        Returns: undefined
      }
      cv_decide: {
        Args: { _approve: boolean; _id: string; _reason: string }
        Returns: undefined
      }
      cv_list: { Args: { _school: string }; Returns: Json }
      cv_plan: {
        Args: {
          _follow: string
          _id: string
          _plan: string
          _section: string
          _subject: string
          _type: string
        }
        Returns: undefined
      }
      cv_save: {
        Args: {
          _date: string
          _id: string
          _lesson: string
          _notes: Json
          _scores: Json
          _submit: boolean
          _summary: string
          _teacher: string
        }
        Returns: string
      }
      cv_teachers: { Args: { _school: string }; Returns: Json }
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
      ev_export_log: {
        Args: { _org: string; _what: string }
        Returns: undefined
      }
      ev_form_save: {
        Args: {
          _desc: string
          _items: Json
          _kind: string
          _org: string
          _publish: boolean
          _role: string
          _title: string
        }
        Returns: string
      }
      ev_forms_list: { Args: { _org: string }; Returns: Json }
      ev_g_children: { Args: never; Returns: Json }
      ev_g_save: {
        Args: {
          _answers: Json
          _comment: string
          _student: string
          _teacher: string
        }
        Returns: string
      }
      ev_g_teachers: { Args: { _student: string }; Returns: Json }
      ev_m_form: { Args: { _role: string; _school: string }; Returns: Json }
      ev_m_get: { Args: { _id: string }; Returns: Json }
      ev_m_person: {
        Args: { _role: string; _school: string; _user: string }
        Returns: Json
      }
      ev_m_save: {
        Args: {
          _answers: Json
          _approve: boolean
          _month: string
          _na: Json
          _notes: string
          _reason: string
          _role: string
          _school: string
          _user: string
        }
        Returns: string
      }
      ev_m_staff: { Args: { _month: string; _school: string }; Returns: Json }
      ev_me: { Args: { _school: string }; Returns: Json }
      ev_monthly_tick: {
        Args: { _now?: string; _only_org?: string }
        Returns: number
      }
      ev_settings_get: { Args: { _org: string }; Returns: Json }
      ev_settings_save: {
        Args: { _due_day: number; _org: string; _reminders: boolean }
        Returns: undefined
      }
      ev_summary: {
        Args: { _month: string; _org: string; _school: string }
        Returns: Json
      }
      ev_teacher_file: { Args: { _teacher: string }; Returns: Json }
      evt_app_act: {
        Args: {
          _action: string
          _id: string
          _internal?: string
          _message?: string
          _rev: number
        }
        Returns: Json
      }
      evt_app_files: { Args: { _app: string }; Returns: Json }
      evt_app_get: { Args: { _id: string }; Returns: Json }
      evt_app_note: { Args: { _body: string; _id: string }; Returns: undefined }
      evt_apply: {
        Args: {
          _answers: Json
          _client_key: string
          _item: string
          _student: string
          _version: number
        }
        Returns: Json
      }
      evt_apply_form: { Args: { _item: string }; Returns: Json }
      evt_apps: {
        Args: {
          _cat?: string
          _from?: string
          _item?: string
          _limit?: number
          _offset?: number
          _org: string
          _q?: string
          _school?: string
          _status?: string
          _to?: string
        }
        Returns: Json
      }
      evt_calendar: {
        Args: { _from: string; _org: string; _school: string; _to: string }
        Returns: Json
      }
      evt_caps: { Args: { _org: string }; Returns: Json }
      evt_consent: {
        Args: { _decision: string; _item: string; _p?: Json; _student: string }
        Returns: undefined
      }
      evt_consents: { Args: { _item: string }; Returns: Json }
      evt_family: { Args: never; Returns: Json }
      evt_file_prepare: {
        Args: {
          _client_key: string
          _field: string
          _item: string
          _mime: string
          _name: string
          _size: number
        }
        Returns: Json
      }
      evt_file_remove: { Args: { _file: string }; Returns: undefined }
      evt_files: { Args: { _item: string }; Returns: Json }
      evt_form_copy: { Args: { _from: string; _item: string }; Returns: Json }
      evt_form_get: { Args: { _item: string }; Returns: Json }
      evt_form_publish: { Args: { _item: string; _rev: number }; Returns: Json }
      evt_form_save: {
        Args: { _fields: Json; _item: string; _rev: number }
        Returns: Json
      }
      evt_form_version: {
        Args: { _item: string; _version: number }
        Returns: Json
      }
      evt_get: { Args: { _id: string }; Returns: Json }
      evt_item_tpl_preview: {
        Args: { _item: string; _which: string }
        Returns: Json
      }
      evt_item_tpl_update: {
        Args: { _item: string; _rev: number; _which: string }
        Returns: Json
      }
      evt_link: {
        Args: { _action: string; _id: string; _rev: number }
        Returns: Json
      }
      evt_list: {
        Args: {
          _kind?: string
          _org: string
          _q?: string
          _school?: string
          _status?: string
        }
        Returns: Json
      }
      evt_mark: {
        Args: {
          _app: string
          _session: string
          _status: string
          _student: string
        }
        Returns: undefined
      }
      evt_report: {
        Args: { _kind?: string; _org: string; _school?: string }
        Returns: Json
      }
      evt_roster: { Args: { _item: string }; Returns: Json }
      evt_save: { Args: { _p: Json }; Returns: Json }
      evt_set_status: {
        Args: { _action: string; _id: string; _reason?: string; _rev: number }
        Returns: Json
      }
      evt_staff_set: {
        Args: { _caps: string[]; _item: string; _user: string }
        Returns: undefined
      }
      evt_tpl_effective: {
        Args: { _kind: string; _school: string }
        Returns: Json
      }
      evt_tpl_get: {
        Args: { _kind: string; _org: string; _school: string }
        Returns: Json
      }
      evt_tpl_overview: { Args: { _org: string }; Returns: Json }
      evt_tpl_publish: {
        Args: { _kind: string; _org: string; _rev: number; _school: string }
        Returns: Json
      }
      evt_tpl_save: {
        Args: {
          _body: Json
          _kind: string
          _org: string
          _rev: number
          _school: string
        }
        Returns: Json
      }
      evt_tpl_use: {
        Args: { _custom: boolean; _kind: string; _school: string }
        Returns: undefined
      }
      extend_homework: {
        Args: { _due: string; _id: string; _reason: string; _student: string }
        Returns: undefined
      }
      family_attendance: { Args: { _student: string }; Returns: Json }
      family_child: { Args: { _student: string }; Returns: Json }
      family_children: { Args: never; Returns: Json }
      family_contacts: {
        Args: { _student: string }
        Returns: {
          full_name: string
          guardian_id: string
          relationship: string
        }[]
      }
      fin_pay_get: { Args: { _school: string }; Returns: Json }
      fin_pay_save: { Args: { _p: Json; _school: string }; Returns: Json }
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
      gv_act: {
        Args: { _action: string; _id: string; _p?: Json; _rev: number }
        Returns: Json
      }
      gv_caps: { Args: { _school: string }; Returns: Json }
      gv_closure_add: {
        Args: { _date: string; _reason: string; _school: string }
        Returns: undefined
      }
      gv_closure_del: { Args: { _id: string }; Returns: undefined }
      gv_create: { Args: { _p: Json }; Returns: string }
      gv_expire_due: { Args: { _school?: string }; Returns: number }
      gv_get: { Args: { _id: string }; Returns: Json }
      gv_guardians: { Args: { _student: string }; Returns: Json }
      gv_list: {
        Args: {
          _from?: string
          _q?: string
          _school: string
          _status?: string
          _to?: string
          _view: string
        }
        Returns: Json
      }
      gv_my_children: { Args: never; Returns: Json }
      gv_settings_get: { Args: { _school: string }; Returns: Json }
      gv_settings_save: {
        Args: { _p: Json; _school: string }
        Returns: undefined
      }
      gv_signal_visible: {
        Args: { _school: string; _visit: string }
        Returns: boolean
      }
      gv_slots: {
        Args: { _exclude?: string; _from: string; _school: string; _to: string }
        Returns: {
          at: string
          day: string
          free: boolean
        }[]
      }
      gv_students: { Args: { _q: string; _school: string }; Returns: Json }
      handover_pickup: { Args: { _id: string }; Returns: undefined }
      has_school_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _school: string
        }
        Returns: boolean
      }
      home_work: { Args: { _school: string }; Returns: Json }
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
      hr_address_get: { Args: { _emp: string }; Returns: Json }
      hr_address_save: {
        Args: { _emp: string; _p: Json; _reason?: string }
        Returns: Json
      }
      hr_advance_act: {
        Args: {
          _action: string
          _id: string
          _reason: string
          _ref: string
          _rev: number
        }
        Returns: undefined
      }
      hr_advance_list: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_advance_request: { Args: { _org: string; _p: Json }; Returns: string }
      hr_advance_save: { Args: { _org: string; _p: Json }; Returns: string }
      hr_asset_ack: { Args: { _custody: string }; Returns: undefined }
      hr_asset_caps: { Args: { _org: string }; Returns: Json }
      hr_asset_close: {
        Args: {
          _condition: string
          _custody: string
          _note: string
          _outcome: string
          _to_emp?: string
        }
        Returns: string
      }
      hr_asset_emp_open: { Args: { _emp: string }; Returns: Json }
      hr_asset_hand: {
        Args: { _asset: string; _condition: string; _emp: string }
        Returns: string
      }
      hr_asset_list: {
        Args: { _org: string; _q?: string; _school?: string; _status?: string }
        Returns: Json
      }
      hr_asset_my: { Args: { _org: string }; Returns: Json }
      hr_asset_people: { Args: { _school: string }; Returns: Json }
      hr_asset_save: {
        Args: {
          _category: string
          _id: string
          _name: string
          _notes: string
          _org: string
          _school: string
          _serial: string
        }
        Returns: string
      }
      hr_asset_set_status: {
        Args: { _asset: string; _reason: string; _status: string }
        Returns: undefined
      }
      hr_assignment_save: {
        Args: { _employee: string; _id: string; _p: Json; _reason?: string }
        Returns: string
      }
      hr_att_assign: {
        Args: {
          _emps: string[]
          _from: string
          _org: string
          _shift: string
          _to: string
        }
        Returns: Json
      }
      hr_att_assign_end: {
        Args: { _end: string; _id: string; _reason: string }
        Returns: undefined
      }
      hr_att_assignments: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_att_board: {
        Args: { _date: string; _f?: Json; _org: string }
        Returns: Json
      }
      hr_att_caps: { Args: { _org: string }; Returns: Json }
      hr_att_close: { Args: { _date: string; _school: string }; Returns: Json }
      hr_att_corr_decide: {
        Args: { _approve: boolean; _id: string; _reason: string }
        Returns: undefined
      }
      hr_att_corr_list: {
        Args: { _org: string; _status?: string }
        Returns: Json
      }
      hr_att_corr_request: {
        Args: {
          _at: string
          _date: string
          _kind: string
          _org: string
          _reason: string
        }
        Returns: string
      }
      hr_att_corr_withdraw: { Args: { _id: string }; Returns: undefined }
      hr_att_device_save: {
        Args: { _name: string; _org: string; _school: string }
        Returns: Json
      }
      hr_att_device_toggle: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      hr_att_emp_days: {
        Args: { _emp: string; _from: string; _to: string }
        Returns: Json
      }
      hr_att_holiday_delete: { Args: { _id: string }; Returns: undefined }
      hr_att_holiday_save: {
        Args: { _date: string; _name: string; _org: string; _school: string }
        Returns: string
      }
      hr_att_my: {
        Args: { _from: string; _org: string; _to: string }
        Returns: Json
      }
      hr_att_punch_add: {
        Args: {
          _at: string
          _emp: string
          _key: string
          _reason: string
          _source: string
        }
        Returns: Json
      }
      hr_att_reopen: {
        Args: { _date: string; _reason: string; _school: string }
        Returns: undefined
      }
      hr_att_report: {
        Args: { _f?: Json; _from: string; _org: string; _to: string }
        Returns: Json
      }
      hr_att_self_punch: {
        Args: {
          _accuracy: number
          _key: string
          _lat: number
          _lng: number
          _org: string
          _read_at: string
          _school: string
        }
        Returns: Json
      }
      hr_att_settings_save: {
        Args: { _org: string; _require_location?: boolean; _self: boolean }
        Returns: undefined
      }
      hr_att_setup: { Args: { _org: string }; Returns: Json }
      hr_att_shift_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_att_site_save: {
        Args: {
          _accuracy: number
          _lat: number
          _lng: number
          _radius: number
          _school: string
        }
        Returns: undefined
      }
      hr_att_sites_list: { Args: { _org: string }; Returns: Json }
      hr_att_team: { Args: { _date: string; _org: string }; Returns: Json }
      hr_att_unassigned: { Args: { _org: string }; Returns: Json }
      hr_candidates: { Args: { _org: string }; Returns: Json }
      hr_cat_list: { Args: { _org: string }; Returns: Json }
      hr_cat_save: {
        Args: { _active: boolean; _id: string; _name: string; _org: string }
        Returns: string
      }
      hr_contract_ack: {
        Args: {
          _decision: string
          _id: string
          _paper?: boolean
          _reason?: string
          _version: number
        }
        Returns: undefined
      }
      hr_contract_alerts_tick: { Args: never; Returns: number }
      hr_contract_approver_check: { Args: { _id: string }; Returns: Json }
      hr_contract_caps: { Args: { _org: string }; Returns: Json }
      hr_contract_end: {
        Args: { _action: string; _date: string; _id: string; _reason: string }
        Returns: undefined
      }
      hr_contract_get: { Args: { _id: string }; Returns: Json }
      hr_contract_issue: {
        Args: { _id: string; _reason?: string; _version: number }
        Returns: undefined
      }
      hr_contract_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_contract_save: {
        Args: { _id: string; _org: string; _p: Json; _reason?: string }
        Returns: string
      }
      hr_contract_withdraw: {
        Args: { _id: string; _reason: string; _version: number }
        Returns: undefined
      }
      hr_decision_act: {
        Args: { _action: string; _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_decision_list: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_decision_save: { Args: { _org: string; _p: Json }; Returns: string }
      hr_doc_alerts_tick: { Args: never; Returns: number }
      hr_doc_caps: { Args: { _org: string }; Returns: Json }
      hr_doc_file: { Args: { _version: string }; Returns: Json }
      hr_doc_get: { Args: { _id: string }; Returns: Json }
      hr_doc_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_doc_review: {
        Args: { _decision: string; _reason?: string; _version: string }
        Returns: undefined
      }
      hr_doc_type_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_doc_types_list: { Args: { _org: string }; Returns: Json }
      hr_doc_upload_done: { Args: { _version: string }; Returns: undefined }
      hr_doc_upload_start: {
        Args: {
          _mime: string
          _name: string
          _org: string
          _p: Json
          _size: number
        }
        Returns: Json
      }
      hr_emp_money: { Args: { _emp: string }; Returns: Json }
      hr_employee_create_login: {
        Args: {
          _base: string
          _org: string
          _p: Json
          _reason?: string
          _uid: string
        }
        Returns: string
      }
      hr_employee_get: { Args: { _id: string }; Returns: Json }
      hr_employee_link_guardian: {
        Args: {
          _base: string
          _org: string
          _p: Json
          _reason?: string
          _uid: string
        }
        Returns: string
      }
      hr_employee_link_login: {
        Args: { _org: string; _p: Json; _reason?: string; _uid: string }
        Returns: string
      }
      hr_employee_list: {
        Args: { _org: string; _q?: string; _school?: string; _status?: string }
        Returns: Json
      }
      hr_employee_profile_get: { Args: { _emp: string }; Returns: Json }
      hr_employee_profile_save: {
        Args: {
          _emp: string
          _mode?: string
          _org: string
          _p: Json
          _reason?: string
        }
        Returns: Json
      }
      hr_employee_save: {
        Args: { _id: string; _org: string; _p: Json; _reason?: string }
        Returns: string
      }
      hr_ext_list: { Args: { _org: string }; Returns: Json }
      hr_ext_people: { Args: { _ext: string; _school: string }; Returns: Json }
      hr_ext_set: {
        Args: { _ext: string; _on: boolean; _org: string; _reason: string }
        Returns: undefined
      }
      hr_hs_assign: {
        Args: { _emp: string; _note?: string; _start: string; _unit: string }
        Returns: string
      }
      hr_hs_history: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_hs_list: { Args: { _org: string }; Returns: Json }
      hr_hs_move: {
        Args: { _date: string; _reason: string; _stay: string; _unit: string }
        Returns: string
      }
      hr_hs_my: { Args: { _org: string }; Returns: Json }
      hr_hs_property_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_hs_unit_save: {
        Args: { _id: string; _p: Json; _property: string }
        Returns: string
      }
      hr_hs_vacate: {
        Args: { _date: string; _reason: string; _stay: string }
        Returns: undefined
      }
      hr_id_readiness: {
        Args: { _org: string; _school?: string }
        Returns: Json
      }
      hr_in_alerts_tick: { Args: never; Returns: number }
      hr_in_class_save: {
        Args: { _id: string; _p: Json; _policy: string }
        Returns: string
      }
      hr_in_company_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_in_member_add: {
        Args: { _class: string; _emp: string; _p: Json }
        Returns: string
      }
      hr_in_member_end: {
        Args: { _date: string; _id: string; _reason: string }
        Returns: number
      }
      hr_in_members: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_in_my: { Args: { _org: string }; Returns: Json }
      hr_in_overview: { Args: { _org: string }; Returns: Json }
      hr_in_policy_renew: {
        Args: { _carry?: boolean; _p: Json; _policy: string }
        Returns: string
      }
      hr_in_policy_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_leave_adjust: {
        Args: {
          _days: number
          _emp: string
          _key: string
          _reason: string
          _type: string
          _year: number
        }
        Returns: undefined
      }
      hr_leave_balances: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_leave_cancel: {
        Args: { _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_leave_caps: { Args: { _org: string }; Returns: Json }
      hr_leave_change: {
        Args: { _id: string; _reason: string; _to: string }
        Returns: string
      }
      hr_leave_decide: {
        Args: { _decision: string; _id: string; _reason?: string; _rev: number }
        Returns: undefined
      }
      hr_leave_get: { Args: { _id: string }; Returns: Json }
      hr_leave_grant: {
        Args: { _org: string; _school?: string; _type: string; _year: number }
        Returns: Json
      }
      hr_leave_ledger: { Args: { _emp: string; _year: number }; Returns: Json }
      hr_leave_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_leave_my: { Args: { _org: string }; Returns: Json }
      hr_leave_policy_save: {
        Args: { _org: string; _p: Json; _type: string }
        Returns: string
      }
      hr_leave_preview: {
        Args: { _from: string; _org: string; _to: string; _type: string }
        Returns: Json
      }
      hr_leave_request: {
        Args: {
          _from: string
          _note: string
          _org: string
          _to: string
          _type: string
        }
        Returns: string
      }
      hr_leave_return: {
        Args: { _back: string; _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_leave_setup: { Args: { _org: string }; Returns: Json }
      hr_leave_team: { Args: { _org: string }; Returns: Json }
      hr_leave_type_save: {
        Args: { _active: boolean; _id: string; _name: string; _org: string }
        Returns: string
      }
      hr_leave_update: {
        Args: {
          _from: string
          _id: string
          _note: string
          _rev: number
          _to: string
        }
        Returns: undefined
      }
      hr_leave_workdays_save: {
        Args: { _days: number[]; _org: string }
        Returns: undefined
      }
      hr_letter_cancel: {
        Args: { _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_letter_caps: { Args: { _org: string }; Returns: Json }
      hr_letter_create: {
        Args: {
          _addressee: string
          _employee: string
          _org: string
          _purpose: string
          _template: string
        }
        Returns: string
      }
      hr_letter_decide: {
        Args: { _decision: string; _id: string; _reason?: string; _rev: number }
        Returns: undefined
      }
      hr_letter_get: { Args: { _id: string }; Returns: Json }
      hr_letter_issue: { Args: { _id: string; _rev: number }; Returns: Json }
      hr_letter_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_letter_mine: { Args: { _org: string }; Returns: Json }
      hr_letter_preview: {
        Args: { _body: string; _employee: string; _org: string }
        Returns: Json
      }
      hr_letter_reissue: {
        Args: { _id: string; _reason: string }
        Returns: string
      }
      hr_letter_request: {
        Args: {
          _addressee: string
          _org: string
          _purpose: string
          _template: string
        }
        Returns: string
      }
      hr_letter_template_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_letter_templates: { Args: { _org: string }; Returns: Json }
      hr_letter_update: {
        Args: {
          _addressee: string
          _id: string
          _purpose: string
          _rev: number
        }
        Returns: undefined
      }
      hr_letter_vars: { Args: never; Returns: Json }
      hr_login_central_roles: { Args: { _org: string }; Returns: string[] }
      hr_login_plan: { Args: { _org: string; _rows: Json }; Returns: Json }
      hr_login_precheck: {
        Args: { _nid: string; _org: string; _phone: string }
        Returns: Json
      }
      hr_login_roles: {
        Args: { _org: string; _school: string }
        Returns: string[]
      }
      hr_me: { Args: { _org: string }; Returns: Json }
      hr_money_caps: { Args: { _org: string }; Returns: Json }
      hr_money_people: { Args: { _org: string }; Returns: Json }
      hr_my_contract: { Args: { _id: string }; Returns: Json }
      hr_my_contracts: { Args: { _org: string }; Returns: Json }
      hr_my_documents: { Args: { _org: string }; Returns: Json }
      hr_my_employment: { Args: { _org: string }; Returns: Json }
      hr_my_money: { Args: { _org: string }; Returns: Json }
      hr_my_payslip: { Args: { _id: string }; Returns: Json }
      hr_open_approve: { Args: { _id: string; _rev: number }; Returns: Json }
      hr_open_cancel: {
        Args: { _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_open_list: { Args: { _kind: string; _org: string }; Returns: Json }
      hr_open_preview: {
        Args: { _kind: string; _org: string; _rows: Json }
        Returns: Json
      }
      hr_open_save: {
        Args: { _kind: string; _org: string; _p: Json }
        Returns: string
      }
      hr_org_owners: { Args: { _org: string }; Returns: Json }
      hr_pay_exception_set: {
        Args: { _on: boolean; _org: string; _reason: string }
        Returns: undefined
      }
      hr_pay_item_save: {
        Args: {
          _active: boolean
          _id: string
          _kind: string
          _name: string
          _org: string
        }
        Returns: string
      }
      hr_pay_line_resolve: {
        Args: {
          _emp: string
          _mode: string
          _reason: string
          _rev: number
          _run: string
        }
        Returns: undefined
      }
      hr_pay_policies_list: { Args: { _org: string }; Returns: Json }
      hr_pay_policy_save: {
        Args: { _org: string; _p: Json; _topic: string }
        Returns: string
      }
      hr_pay_run_act: {
        Args: {
          _action: string
          _id: string
          _reason: string
          _ref: string
          _rev: number
        }
        Returns: undefined
      }
      hr_pay_run_create: {
        Args: { _month: string; _org: string }
        Returns: string
      }
      hr_pay_run_get: { Args: { _id: string }; Returns: Json }
      hr_pay_runs: { Args: { _org: string }; Returns: Json }
      hr_pay_settings_save: {
        Args: { _org: string; _p: Json }
        Returns: undefined
      }
      hr_pay_setup: { Args: { _org: string }; Returns: Json }
      hr_perm_cancel: {
        Args: { _id: string; _rev: number }
        Returns: undefined
      }
      hr_perm_decide: {
        Args: { _decision: string; _id: string; _reason?: string; _rev: number }
        Returns: undefined
      }
      hr_perm_list: { Args: { _f?: Json; _org: string }; Returns: Json }
      hr_perm_my: { Args: { _org: string }; Returns: Json }
      hr_perm_request: { Args: { _org: string; _p: Json }; Returns: string }
      hr_pf_assign: {
        Args: {
          _cycle: string
          _emp: string
          _evaluator: string
          _form: string
        }
        Returns: string
      }
      hr_pf_cycle_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_pf_evaluators: { Args: { _school: string }; Returns: Json }
      hr_pf_form_save: {
        Args: { _id: string; _org: string; _p: Json }
        Returns: string
      }
      hr_pf_get: { Args: { _id: string }; Returns: Json }
      hr_pf_list: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_pf_my: { Args: { _org: string }; Returns: Json }
      hr_pf_people: { Args: { _school: string }; Returns: Json }
      hr_pf_publish: { Args: { _id: string }; Returns: undefined }
      hr_pf_resolve: {
        Args: { _amend: boolean; _id: string; _note: string; _total?: number }
        Returns: undefined
      }
      hr_pf_respond: {
        Args: { _ack: boolean; _id: string; _text: string }
        Returns: undefined
      }
      hr_pf_review: {
        Args: { _approve: boolean; _id: string; _note: string }
        Returns: undefined
      }
      hr_pf_save: {
        Args: { _id: string; _p: Json; _submit?: boolean }
        Returns: Json
      }
      hr_pf_setup: { Args: { _org: string }; Returns: Json }
      hr_rc_candidate_get: { Args: { _id: string }; Returns: Json }
      hr_rc_candidate_save: {
        Args: { _p: Json; _vac: string }
        Returns: string
      }
      hr_rc_candidate_stage: {
        Args: { _id: string; _reason: string; _rev: number; _stage: string }
        Returns: undefined
      }
      hr_rc_candidates: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_rc_convert: {
        Args: { _cand: string; _p: Json; _rev: number }
        Returns: string
      }
      hr_rc_interview_add: {
        Args: { _cand: string; _p: Json }
        Returns: string
      }
      hr_rc_offer_act: {
        Args: { _action: string; _offer: string; _reason: string; _ref: string }
        Returns: undefined
      }
      hr_rc_offer_save: {
        Args: { _cand: string; _p: Json; _rev: number }
        Returns: string
      }
      hr_rc_vacancies: { Args: { _f: Json; _org: string }; Returns: Json }
      hr_rc_vacancy_act: {
        Args: { _action: string; _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      hr_rc_vacancy_save: { Args: { _org: string; _p: Json }; Returns: string }
      hr_report: {
        Args: { _f: Json; _key: string; _mode?: string; _org: string }
        Returns: Json
      }
      hr_report_catalog: { Args: { _org: string }; Returns: Json }
      hr_self_access_set: {
        Args: { _active: boolean; _emp: string; _reason?: string }
        Returns: Json
      }
      hr_settings_get: { Args: { _org: string }; Returns: Json }
      hr_settings_save: {
        Args: { _days: number[]; _notify_employee: boolean; _org: string }
        Returns: undefined
      }
      hr_settings_set_alerts: {
        Args: { _active: boolean; _org: string; _reason?: string }
        Returns: undefined
      }
      hr_team: { Args: { _org: string }; Returns: Json }
      hr_template_list: { Args: { _org: string }; Returns: Json }
      hr_template_save: {
        Args: {
          _active?: boolean
          _body: string
          _id: string
          _name: string
          _org: string
        }
        Returns: string
      }
      hr_title_role_list: { Args: { _org: string }; Returns: Json }
      hr_title_role_set: {
        Args: { _base: string; _org: string; _title: string }
        Returns: undefined
      }
      hub_dept_people: {
        Args: { _org: string; _schools: string[] }
        Returns: Json
      }
      hw_family: { Args: { _hw: string; _student: string }; Returns: boolean }
      hw_staff: { Args: { _hw: string }; Returns: boolean }
      hw_state: { Args: { _hw: string; _student: string }; Returns: Json }
      hw_teacher: { Args: { _hw: string }; Returns: boolean }
      hw_tick: { Args: never; Returns: Json }
      import_guardian_row: {
        Args: { _dry?: boolean; _row: Json; _school: string }
        Returns: Json
      }
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
      la_approve: { Args: { _id: string; _rev: number }; Returns: undefined }
      la_exception_open: {
        Args: { _date: string; _reason: string; _slot: string }
        Returns: string
      }
      la_get: { Args: { _id: string }; Returns: Json }
      la_my_lessons: { Args: { _date?: string }; Returns: Json }
      la_open: { Args: { _date: string; _slot: string }; Returns: string }
      la_report_missing: {
        Args: { _note?: string; _slot: string; _student: string }
        Returns: undefined
      }
      la_save: {
        Args: { _id: string; _marks: Json; _reason?: string; _rev: number }
        Returns: number
      }
      la_school_day: {
        Args: { _date?: string; _school: string }
        Returns: Json
      }
      la_section_today: { Args: { _slot: string }; Returns: Json }
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
      mt_action: {
        Args: { _action: string; _data: Json; _id: string; _rev: number }
        Returns: Json
      }
      mt_alerts_tick: { Args: never; Returns: number }
      mt_bus_log: { Args: { _bus: string }; Returns: Json }
      mt_bus_save: {
        Args: { _data: Json; _id: string; _school: string }
        Returns: string
      }
      mt_bus_set_status: {
        Args: { _bus: string; _note: string; _status: string }
        Returns: undefined
      }
      mt_buses_list: { Args: { _org: string }; Returns: Json }
      mt_candidates: { Args: { _id: string }; Returns: Json }
      mt_categories_list: {
        Args: { _kind: string; _org: string }
        Returns: Json
      }
      mt_category_add: {
        Args: { _kind: string; _name: string; _org: string; _parent: string }
        Returns: string
      }
      mt_create: {
        Args: { _data: Json; _key: string; _kind: string; _school: string }
        Returns: string
      }
      mt_file_remove: { Args: { _file: string }; Returns: undefined }
      mt_get: { Args: { _id: string }; Returns: Json }
      mt_list: { Args: { _f: Json; _org: string }; Returns: Json }
      mt_me: { Args: { _org: string }; Returns: Json }
      mt_need_create: {
        Args: { _d: Json; _id: string; _key: string }
        Returns: string
      }
      mt_need_info: { Args: { _id: string }; Returns: Json }
      mt_parts_suggest: {
        Args: { _id: string; _lines: Json }
        Returns: undefined
      }
      mt_settings_save: {
        Args: { _org: string; _reopen_days: number }
        Returns: undefined
      }
      my_access_paused: { Args: never; Returns: boolean }
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
      my_link_pending: { Args: never; Returns: boolean }
      my_profile: { Args: { _school: string }; Returns: Json }
      my_section_groups: {
        Args: { _school: string }
        Returns: {
          can_manage: boolean
          children: string
          conversation_id: string
          last_at: string
          members: number
          post_policy: string
          section_id: string
          section_label: string
          students: number
          teachers: string
          title: string
          unread: number
        }[]
      }
      my_teacher_ids: { Args: never; Returns: string[] }
      norm_phone: { Args: { _p: string }; Returns: string }
      od_caps: { Args: { _org: string }; Returns: Json }
      od_draft_file: {
        Args: {
          _mime: string
          _name: string
          _org: string
          _school: string
          _size: number
        }
        Returns: {
          id: string
          storage_path: string
        }[]
      }
      od_list: {
        Args: {
          _org: string
          _q?: string
          _school?: string
          _status?: string
          _what: string
        }
        Returns: Json
      }
      od_save_contractor: { Args: { _org: string; _p: Json }; Returns: string }
      od_save_doc: { Args: { _org: string; _p: Json }; Returns: string }
      open_circular: { Args: { _id: string }; Returns: undefined }
      org_school_save: {
        Args: {
          _city?: string
          _code?: string
          _id: string
          _name: string
          _org: string
          _stage_type?: string
        }
        Returns: string
      }
      org_school_set_active: {
        Args: { _active: boolean; _id: string; _reason?: string }
        Returns: number
      }
      org_school_set_gender: {
        Args: { _gender: string; _id: string }
        Returns: undefined
      }
      org_schools_overview: {
        Args: { _org: string }
        Returns: {
          city: string
          code: string
          id: string
          is_active: boolean
          name: string
          paused: number
          pending_invites: number
          staff: Json
          staff_total: number
          stage_type: string
          students: number
        }[]
      }
      org_sections_get: { Args: { _org: string }; Returns: Json }
      pc_ack: { Args: { _move: string }; Returns: undefined }
      pc_alerts_tick: { Args: never; Returns: number }
      pc_branch_overview: { Args: { _org: string }; Returns: Json }
      pc_carry: {
        Args: {
          _amount: number
          _from: string
          _key: string
          _reason: string
          _to: string
        }
        Returns: string
      }
      pc_category_save: {
        Args: { _archived: boolean; _id: string; _name: string; _org: string }
        Returns: string
      }
      pc_custody_action: {
        Args: {
          _action: string
          _exception?: string
          _id: string
          _reason: string
          _rev: number
        }
        Returns: undefined
      }
      pc_custody_caps: { Args: { _id: string }; Returns: Json }
      pc_custody_close: {
        Args: { _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      pc_custody_get: { Args: { _id: string }; Returns: Json }
      pc_custody_list: {
        Args: {
          _from?: string
          _limit: number
          _mine: boolean
          _offset: number
          _org: string
          _q: string
          _school: string
          _status: string
          _to?: string
        }
        Returns: Json
      }
      pc_custody_save: {
        Args: {
          _amount: number
          _due: string
          _holder: string
          _id: string
          _key: string
          _org: string
          _purpose: string
          _rev: number
          _school: string
          _school_ids: string[]
        }
        Returns: string
      }
      pc_custody_save_approve: {
        Args: {
          _amount: number
          _due: string
          _holder: string
          _key: string
          _org: string
          _purpose: string
          _school: string
          _school_ids: string[]
        }
        Returns: string
      }
      pc_disburse: {
        Args: {
          _doc_date: string
          _external_ref: string
          _file: string
          _id: string
          _key: string
          _method: string
          _note: string
          _rev: number
        }
        Returns: string
      }
      pc_expense_action: {
        Args: { _action: string; _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      pc_expense_get: { Args: { _id: string }; Returns: Json }
      pc_expense_list: {
        Args: {
          _category: string
          _custody: string
          _from: string
          _limit: number
          _offset: number
          _org: string
          _q: string
          _school: string
          _status: string
          _to: string
        }
        Returns: Json
      }
      pc_expense_review_edit: {
        Args: { _id: string; _p: Json; _reason: string; _rev: number }
        Returns: undefined
      }
      pc_expense_save: {
        Args: {
          _d: Json
          _id: string
          _key: string
          _org: string
          _rev: number
        }
        Returns: string
      }
      pc_file_remove: { Args: { _file: string }; Returns: undefined }
      pc_form_discard: { Args: { _org: string }; Returns: undefined }
      pc_form_get: { Args: { _org: string }; Returns: Json }
      pc_form_publish: {
        Args: { _org: string; _reason: string }
        Returns: string
      }
      pc_form_save: {
        Args: { _core: Json; _fields: Json; _note: string; _org: string }
        Returns: string
      }
      pc_me: { Args: { _org: string }; Returns: Json }
      pc_need_action: {
        Args: {
          _action: string
          _id: string
          _reason: string
          _rev: number
          _user: string
        }
        Returns: undefined
      }
      pc_need_get: { Args: { _id: string }; Returns: Json }
      pc_need_list: {
        Args: {
          _from?: string
          _limit: number
          _offset: number
          _org: string
          _q?: string
          _status: string
          _to?: string
        }
        Returns: Json
      }
      pc_need_save: {
        Args: {
          _d: Json
          _id: string
          _key: string
          _org: string
          _rev: number
        }
        Returns: string
      }
      pc_refund_create: {
        Args: {
          _amount: number
          _expense: string
          _key: string
          _reason: string
        }
        Returns: string
      }
      pc_refund_decide: {
        Args: { _collect: boolean; _id: string; _reason: string }
        Returns: undefined
      }
      pc_report: {
        Args: {
          _d: Json
          _kind: string
          _limit: number
          _offset: number
          _org: string
        }
        Returns: Json
      }
      pc_request_action: {
        Args: { _action: string; _id: string; _reason: string; _rev: number }
        Returns: undefined
      }
      pc_request_get: { Args: { _id: string }; Returns: Json }
      pc_request_list: {
        Args: {
          _custody: string
          _from?: string
          _kind: string
          _limit: number
          _offset: number
          _org: string
          _q: string
          _status: string
          _to?: string
        }
        Returns: Json
      }
      pc_request_save: {
        Args: {
          _d: Json
          _id: string
          _key: string
          _org: string
          _rev: number
        }
        Returns: string
      }
      pc_return_cash: {
        Args: {
          _amount: number
          _custody: string
          _doc_date: string
          _file: string
          _key: string
          _method: string
          _note: string
        }
        Returns: string
      }
      pc_settings_log: { Args: { _org: string }; Returns: Json }
      pc_settings_save: {
        Args: {
          _block_overdue: boolean
          _due_soon?: number
          _low_balance: number
          _org: string
          _purchase_above?: number
          _reason: string
          _require_attachment: boolean
          _rev: number
          _vat_inclusive: boolean
          _vat_rate: number
        }
        Returns: undefined
      }
      pc_summary: {
        Args: { _from: string; _org: string; _school: string; _to: string }
        Returns: Json
      }
      pc_tasks: { Args: { _org: string }; Returns: Json }
      pc_topup_disburse: {
        Args: {
          _doc_date: string
          _external_ref: string
          _file: string
          _id: string
          _key: string
          _method: string
          _note: string
          _rev: number
        }
        Returns: string
      }
      pc_transfer_accept: { Args: { _id: string }; Returns: string }
      people_dn_apply: { Args: { _org: string }; Returns: Json }
      people_dn_check: {
        Args: { _name: string; _nid: string; _org: string; _user: string }
        Returns: Json
      }
      people_dn_preview: { Args: { _org: string }; Returns: Json }
      people_pick: {
        Args: {
          _branch?: string
          _dept?: string
          _ids?: string[]
          _limit?: number
          _org?: string
          _post?: string
          _purpose: string
          _q?: string
          _role?: string
          _school: string
        }
        Returns: {
          dept_id: string
          dept_name: string
          full_name: string
          roles: string[]
          school_id: string
          school_name: string
          total: number
          user_id: string
        }[]
      }
      people_pick_facets: {
        Args: {
          _org?: string
          _post?: string
          _purpose: string
          _school: string
        }
        Returns: {
          id: string
          kind: string
          label: string
        }[]
      }
      perm_allows: {
        Args: { _action: string; _school: string; _section: string }
        Returns: boolean
      }
      perm_apply: {
        Args: { _changes: Json; _org: string; _reason: string; _user: string }
        Returns: undefined
      }
      perm_assign: {
        Args: {
          _assign: boolean
          _limit: number
          _org: string
          _reason: string
          _role: string
          _school_ids: string[]
          _user: string
        }
        Returns: undefined
      }
      perm_catalog: { Args: never; Returns: Json }
      perm_disabled_areas: { Args: { _org: string }; Returns: string[] }
      perm_effective: { Args: { _org: string; _user: string }; Returns: Json }
      perm_log_list: { Args: { _org: string }; Returns: Json }
      perm_my_school: { Args: { _school: string }; Returns: Json }
      perm_override_set: {
        Args: {
          _action: string
          _effect: string
          _org: string
          _reason: string
          _scope: string
          _section: string
          _user: string
        }
        Returns: undefined
      }
      perm_people: { Args: { _org: string }; Returns: Json }
      perm_preview: {
        Args: { _changes: Json; _org: string; _user: string }
        Returns: Json
      }
      perm_preview_staff: {
        Args: {
          _base: string
          _org: string
          _overrides: Json
          _roles: Json
          _schools: string[]
          _uid: string
        }
        Returns: Json
      }
      perm_role_archive: {
        Args: { _archive: boolean; _id: string; _org: string; _reason: string }
        Returns: undefined
      }
      perm_role_save: {
        Args: {
          _description: string
          _grants: Json
          _id: string
          _name: string
          _org: string
          _reason: string
        }
        Returns: string
      }
      perm_roles_list: { Args: { _org: string }; Returns: Json }
      perm_scope: {
        Args: { _action: string; _org: string; _section: string; _user: string }
        Returns: string
      }
      perm_section_people: { Args: { _org: string }; Returns: Json }
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
      platform_org_save: {
        Args: {
          _name: string
          _nid: string
          _org: string
          _owner: string
          _owner_name: string
          _phone: string
        }
        Returns: undefined
      }
      platform_orgs: { Args: never; Returns: Json }
      platform_overview: { Args: never; Returns: Json }
      platform_section_log: { Args: { _org: string }; Returns: Json }
      platform_set_section: {
        Args: {
          _enabled: boolean
          _org: string
          _reason: string
          _section: string
        }
        Returns: undefined
      }
      pp_access_preview: {
        Args: {
          _action: string
          _ids: string[]
          _kind: string
          _school: string
        }
        Returns: Json
      }
      pp_bulk: {
        Args: {
          _action: string
          _ids: string[]
          _key: string
          _kind: string
          _reason?: string
          _school: string
          _tag?: string
        }
        Returns: Json
      }
      pp_caps: { Args: { _school: string }; Returns: Json }
      pp_card: { Args: { _id: string; _kind: string }; Returns: Json }
      pp_export_log: {
        Args: { _count: number; _key: string; _kind: string; _school: string }
        Returns: undefined
      }
      pp_note_add: {
        Args: { _body: string; _id: string; _kind: string; _school: string }
        Returns: string
      }
      pp_note_edit: {
        Args: {
          _body: string
          _note: string
          _reason?: string
          _remove?: boolean
        }
        Returns: undefined
      }
      pp_tag_ids: {
        Args: { _kind: string; _school: string; _tag: string }
        Returns: string[]
      }
      pp_tag_list: { Args: { _org: string }; Returns: Json }
      pp_tag_save: {
        Args: {
          _active: boolean
          _color: string
          _id: string
          _kinds: string[]
          _name: string
          _org: string
        }
        Returns: string
      }
      pp_tag_set: {
        Args: { _id: string; _kind: string; _on: boolean; _tag: string }
        Returns: undefined
      }
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
      schedule_slot_subjects: {
        Args: { _timetable: string }
        Returns: {
          slot_id: string
          subject: string
        }[]
      }
      schedule_teacher_names: {
        Args: { _timetable: string }
        Returns: {
          full_name: string
          teacher_id: string
        }[]
      }
      school_org: { Args: { _school: string }; Returns: string }
      school_set_logo: {
        Args: { _path: string; _school: string }
        Returns: undefined
      }
      school_today: { Args: never; Returns: string }
      school_today_org: { Args: { _org: string }; Returns: string }
      search_messages: {
        Args: { _q: string; _school?: string }
        Returns: {
          body: string
          conv_title: string
          conversation_id: string
          created_at: string
          message_id: string
          sender_name: string
          seq: number
        }[]
      }
      section_enabled: {
        Args: { _org: string; _section: string }
        Returns: boolean
      }
      section_room_get: { Args: { _room: string }; Returns: Json }
      section_rooms_list: { Args: { _school: string }; Returns: Json }
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
      set_active_context: {
        Args: { _role: string; _school: string }
        Returns: undefined
      }
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
      set_my_avatar: { Args: { _path: string }; Returns: undefined }
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
      staff_logins_list: {
        Args: { _org: string }
        Returns: {
          pending: boolean
          user_id: string
          username: string
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
      staff_username_free: { Args: { _username: string }; Returns: boolean }
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
      support_action: {
        Args: {
          _action: string
          _reason?: string
          _rev: number
          _ticket: string
          _value?: string
        }
        Returns: undefined
      }
      support_add_note: {
        Args: {
          _body: string
          _client_key?: string
          _kind: string
          _recipient: string
          _ticket: string
        }
        Returns: string
      }
      support_assignees: {
        Args: { _school?: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      support_can_read: { Args: { _ticket: string }; Returns: boolean }
      support_caps: { Args: { _org: string }; Returns: Json }
      support_create: {
        Args: {
          _body: string
          _category?: string
          _client_key?: string
          _priority?: string
          _school: string
          _scope: string
          _student?: string
          _title: string
        }
        Returns: string
      }
      support_dept_options: {
        Args: { _school?: string }
        Returns: {
          id: string
          name: string
          school_name: string
        }[]
      }
      support_edit_message: {
        Args: { _body: string; _message: string; _reason: string }
        Returns: undefined
      }
      support_escalate: {
        Args: {
          _body: string
          _client_key?: string
          _ticket: string
          _title: string
        }
        Returns: string
      }
      support_escalate_candidates: {
        Args: { _org: string }
        Returns: {
          full_name: string
          roles: string
          school_name: string
          user_id: string
        }[]
      }
      support_files: {
        Args: { _ticket: string }
        Returns: {
          created_at: string
          id: string
          name: string
          size_bytes: number
          storage_path: string
          uploaded_by: string
          uploader: string
        }[]
      }
      support_follower_candidates: {
        Args: { _q?: string; _ticket: string }
        Returns: {
          dept_name: string
          name: string
          role: string
          school_name: string
          user_id: string
        }[]
      }
      support_get: { Args: { _ticket: string }; Returns: Json }
      support_handler: {
        Args: { _t: Database["public"]["Tables"]["support_tickets"]["Row"] }
        Returns: boolean
      }
      support_holiday_delete: { Args: { _id: string }; Returns: undefined }
      support_holiday_save: {
        Args: {
          _from: string
          _name: string
          _org: string
          _school: string
          _to: string
        }
        Returns: string
      }
      support_hours_delete: { Args: { _id: string }; Returns: undefined }
      support_hours_list: { Args: { _org: string }; Returns: Json }
      support_hours_save: {
        Args: {
          _days: number[]
          _dept: string
          _end: string
          _org: string
          _school: string
          _start: string
        }
        Returns: string
      }
      support_info_answer: {
        Args: { _answer: string; _req: string }
        Returns: undefined
      }
      support_info_cancel: { Args: { _req: string }; Returns: undefined }
      support_info_inbox: {
        Args: never
        Returns: {
          answer: string
          answered_at: string
          asked_by_name: string
          created_at: string
          id: string
          question: string
          ref: string
          school_name: string
          status: string
        }[]
      }
      support_list: {
        Args: {
          _assignee?: string
          _box: string
          _category?: string
          _dept?: string
          _from?: string
          _limit?: number
          _offset?: number
          _priority?: string
          _q?: string
          _school?: string
          _status?: string
          _to?: string
        }
        Returns: {
          assignee_name: string
          category: string
          created_at: string
          department_name: string
          id: string
          overdue: boolean
          priority: string
          ref: string
          requester_name: string
          requester_role: string
          resolve_due: string
          response_due: string
          school_name: string
          scope: string
          status: string
          title: string
          total: number
          updated_at: string
        }[]
      }
      support_manager: {
        Args: { _t: Database["public"]["Tables"]["support_tickets"]["Row"] }
        Returns: boolean
      }
      support_message_history: {
        Args: { _message: string }
        Returns: {
          created_at: string
          old_body: string
          reason: string
        }[]
      }
      support_my_children: {
        Args: { _school: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      support_new_candidates: {
        Args: { _q?: string; _school: string }
        Returns: {
          name: string
          role: string
          school_name: string
          user_id: string
        }[]
      }
      support_open: {
        Args: {
          _assignee?: string
          _body: string
          _category?: string
          _client_key?: string
          _dept?: string
          _files?: string[]
          _priority?: string
          _school: string
          _title: string
        }
        Returns: string
      }
      support_release_file: { Args: { _file: string }; Returns: undefined }
      support_reply: {
        Args: { _body: string; _client_key?: string; _ticket: string }
        Returns: string
      }
      support_request_info: {
        Args: {
          _client_key?: string
          _question: string
          _ticket: string
          _to: string
        }
        Returns: string
      }
      support_route_candidates: {
        Args: { _dept?: string; _q?: string; _school: string; _ticket?: string }
        Returns: {
          dept_name: string
          name: string
          role: string
          school_name: string
          user_id: string
        }[]
      }
      support_route_departments: {
        Args: { _school: string; _ticket?: string }
        Returns: {
          eligible: number
          id: string
          name: string
        }[]
      }
      support_save_category: {
        Args: { _active: boolean; _id: string; _name: string; _org: string }
        Returns: string
      }
      support_save_settings: {
        Args: {
          _days: number[]
          _end: string
          _escalate: string
          _note: string
          _org: string
          _reopen: number
          _sla: Json
          _start: string
        }
        Returns: undefined
      }
      support_set_department: {
        Args: { _dept: string; _rev: number; _ticket: string }
        Returns: undefined
      }
      support_set_follower: {
        Args: { _on: boolean; _ticket: string; _user: string }
        Returns: undefined
      }
      support_sla_tick: { Args: { _only?: string[] }; Returns: number }
      support_stats: {
        Args: { _from?: string; _school?: string; _to?: string }
        Returns: Json
      }
      support_summary: { Args: { _school?: string }; Returns: Json }
      sync_class_group: {
        Args: { _section: string; _year: string }
        Returns: string
      }
      sync_course_group: { Args: { _course: string }; Returns: string }
      sync_derived_group: { Args: { _conv: string }; Returns: number }
      sync_section_group: { Args: { _section: string }; Returns: string }
      teacher_id_status: {
        Args: { _school: string }
        Returns: {
          has_account: boolean
          has_phone: boolean
          hr_national_id: string
          national_id: string
          problem: string
          state: string
          teacher_id: string
        }[]
      }
      teacher_nid_save: {
        Args: { _nid: string; _teacher: string }
        Returns: string
      }
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
      vc_attendance: { Args: { _id: string }; Returns: Json }
      vc_cancel: { Args: { _id: string; _reason: string }; Returns: undefined }
      vc_courses: { Args: { _school: string }; Returns: Json }
      vc_list: {
        Args: { _course: string; _from: string; _school: string; _to: string }
        Returns: Json
      }
      vc_report: {
        Args: { _from: string; _school: string; _to: string }
        Returns: Json
      }
      vc_save: {
        Args: {
          _course: string
          _duration: number
          _id: string
          _rev: number
          _starts: string
          _teacher: string
          _title: string
        }
        Returns: string
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
