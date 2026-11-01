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
          id: string
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
          id?: string
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
          id?: string
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
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          id?: string
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          created_at?: string
          id?: string
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
          updated_at: string
        }
        Insert: {
          day_end?: string | null
          day_start?: string | null
          school_id: string
          study_days?: number[]
          updated_at?: string
        }
        Update: {
          day_end?: string | null
          day_start?: string | null
          school_id?: string
          study_days?: number[]
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
      teacher_unavailability: {
        Row: {
          created_at: string
          day: number
          id: string
          note: string | null
          period_id: string
          school_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          day: number
          id?: string
          note?: string | null
          period_id: string
          school_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          day?: number
          id?: string
          note?: string | null
          period_id?: string
          school_id?: string
          teacher_id?: string
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
      _apply_invitation: {
        Args: {
          _em: string
          _uid: string
          r: Database["public"]["Tables"]["invitations"]["Row"]
        }
        Returns: undefined
      }
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
      _group_admin: { Args: { _conv: string }; Returns: boolean }
      _invite_valid: {
        Args: { r: Database["public"]["Tables"]["invitations"]["Row"] }
        Returns: boolean
      }
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
      _teaches_section: {
        Args: { _section: string; _user: string }
        Returns: boolean
      }
      accept_invitation: { Args: { _token: string }; Returns: string }
      accept_my_invitations: { Args: never; Returns: number }
      ack_circular: { Args: { _id: string }; Returns: number }
      add_circular_recipients: {
        Args: { _id: string; _require_ack?: boolean; _users: string[] }
        Returns: number
      }
      add_group_members: {
        Args: { _conv: string; _users: string[] }
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
      available_substitutes: {
        Args: { _date: string; _slot: string }
        Returns: {
          full_name: string
          same_department: boolean
          teacher_id: string
        }[]
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
      create_circular_file: {
        Args: { _circular: string; _mime: string; _name: string; _size: number }
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
      decide_report: {
        Args: {
          _decision: string
          _hide?: boolean
          _id: string
          _status: string
        }
        Returns: undefined
      }
      delete_message: { Args: { _id: string }; Returns: undefined }
      dept_teacher_ids: { Args: never; Returns: string[] }
      edit_message: { Args: { _body: string; _id: string }; Returns: undefined }
      end_assignment: { Args: { _id: string }; Returns: undefined }
      ensure_classroom: { Args: { _course: string }; Returns: string }
      family_contacts: {
        Args: { _student: string }
        Returns: {
          full_name: string
          guardian_id: string
          relationship: string
        }[]
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
      has_school_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _school: string
        }
        Returns: boolean
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
      is_student_self: { Args: { _student: string }; Returns: boolean }
      is_supervised_course: { Args: { _course: string }; Returns: boolean }
      is_supervised_student: { Args: { _student: string }; Returns: boolean }
      is_teacher_of_student: { Args: { _student: string }; Returns: boolean }
      leave_group: { Args: { _conv: string }; Returns: undefined }
      mark_conversation_read: {
        Args: { _conv: string; _seq: number }
        Returns: undefined
      }
      mark_notifications_read: { Args: { _ids?: string[] }; Returns: number }
      my_class_groups: {
        Args: { _school: string }
        Returns: {
          conversation_id: string
          section_id: string
          students: number
          subjects: string
          title: string
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
      pin_message: { Args: { _id: string; _pin: boolean }; Returns: undefined }
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
      publish_timetable: {
        Args: { _effective_from: string; _id: string }
        Returns: number
      }
      record_absence: {
        Args: { _date: string; _note?: string; _teacher: string }
        Returns: string
      }
      remind_circular_ack: { Args: { _id: string }; Returns: number }
      remove_group_member: {
        Args: { _conv: string; _user: string }
        Returns: undefined
      }
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
      resend_invitation: { Args: { _id: string }; Returns: string }
      revise_circular: {
        Args: {
          _body: string
          _id: string
          _requires_new_ack: boolean
          _title: string
        }
        Returns: number
      }
      revoke_invitation: { Args: { _id: string }; Returns: undefined }
      run_file_cleanup: { Args: never; Returns: Json }
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
      schedule_teacher_names: {
        Args: { _timetable: string }
        Returns: {
          full_name: string
          teacher_id: string
        }[]
      }
      school_org: { Args: { _school: string }; Returns: string }
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
      set_member_prefs: {
        Args: { _archived: boolean; _conv: string; _muted: boolean }
        Returns: undefined
      }
      set_membership_active: {
        Args: { _active: boolean; _id: string; _reason?: string }
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
      supervised_teacher_ids: { Args: never; Returns: string[] }
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
      verify_guardian_link: { Args: { _id: string }; Returns: undefined }
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
