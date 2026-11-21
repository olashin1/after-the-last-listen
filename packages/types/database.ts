
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "catalog": {
          Tables: {
            "album_artists": {
                  Row: {
                    "album_id": number,"artist_id": number,"position": number
                  }
                  ComputedFields: never
                  Insert: {
                    "album_id": number,"artist_id": number,"position": number
                  }
                  Update: {
                    "album_id"?: number,"artist_id"?: number,"position"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "album_artists_album_id_fkey"
      columns: ["album_id"]
isOneToOne: false
      referencedRelation: "albums"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "album_artists_artist_id_fkey"
      columns: ["artist_id"]
isOneToOne: false
      referencedRelation: "artists"
      referencedColumns: ["id"]
    }
                  ]
                },"albums": {
                  Row: {
                    "artist_credit": string,"canonical_release_mbid": string | null,"first_release_date": string | null,"id": number,"link_count": number,"mbid": string,"popularity": number,"primary_type": string,"release_count": number,"retired": boolean,"search_text": string,"secondary_types": (string)[],"title": string,"tracks_loaded_at": string | null,"tracks_release_mbid": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist_credit": string,"canonical_release_mbid"?: string | null,"first_release_date"?: string | null,"id"?: never,"link_count"?: number,"mbid": string,"popularity"?: number,"primary_type": string,"release_count"?: number,"retired"?: boolean,"search_text"?: never,"secondary_types"?: (string)[],"title": string,"tracks_loaded_at"?: string | null,"tracks_release_mbid"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "artist_credit"?: string,"canonical_release_mbid"?: string | null,"first_release_date"?: string | null,"id"?: never,"link_count"?: number,"mbid"?: string,"popularity"?: number,"primary_type"?: string,"release_count"?: number,"retired"?: boolean,"search_text"?: never,"secondary_types"?: (string)[],"title"?: string,"tracks_loaded_at"?: string | null,"tracks_release_mbid"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"artists": {
                  Row: {
                    "disambiguation": string | null,"id": number,"mbid": string,"name": string,"retired": boolean,"sort_name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "disambiguation"?: string | null,"id"?: never,"mbid": string,"name": string,"retired"?: boolean,"sort_name": string,"updated_at"?: string
                  }
                  Update: {
                    "disambiguation"?: string | null,"id"?: never,"mbid"?: string,"name"?: string,"retired"?: boolean,"sort_name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"mbid_redirects": {
                  Row: {
                    "created_at": string,"entity": string,"new_mbid": string,"old_mbid": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entity": string,"new_mbid": string,"old_mbid": string
                  }
                  Update: {
                    "created_at"?: string,"entity"?: string,"new_mbid"?: string,"old_mbid"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tracks": {
                  Row: {
                    "album_id": number,"disc_number": number,"length_ms": number | null,"position": number,"recording_mbid": string,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "album_id": number,"disc_number": number,"length_ms"?: number | null,"position": number,"recording_mbid": string,"title": string
                  }
                  Update: {
                    "album_id"?: number,"disc_number"?: number,"length_ms"?: number | null,"position"?: number,"recording_mbid"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tracks_album_id_fkey"
      columns: ["album_id"]
isOneToOne: false
      referencedRelation: "albums"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "normalize_text":
{ Args: { "p_text": string }; Returns: string
                           },
"search_albums_weighted":
{ Args: { "p_lim": number,"p_q": string,"p_threshold"?: number,"p_w_full"?: number,"p_w_pop": number,"p_w_sim": number,"p_w_type": number }; Returns: {
              "artist_credit": string,"first_release_date": string,"id": number,"mbid": string,"primary_type": string,"score": number,"secondary_types": (string)[],"title": string
            }[]
                           },
"search_key":
{ Args: { "p_artist_credit": string,"p_title": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "profiles": {
                  Row: {
                    "avatar_url": string | null,"bio": string | null,"created_at": string,"display_name": string | null,"user_id": string,"username": string,"visibility": Database["public"]['Enums']["profile_visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"user_id": string,"username": string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Update: {
                    "avatar_url"?: string | null,"bio"?: string | null,"created_at"?: string,"display_name"?: string | null,"user_id"?: string,"username"?: string,"visibility"?: Database["public"]['Enums']["profile_visibility"]
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "can_view_user_content":
{ Args: { "p_owner": string }; Returns: boolean
                           },
"check_username":
{ Args: { "p_username": string }; Returns: string
                           },
"get_album":
{ Args: { "p_album_id": number }; Returns: {
              "artist_credit": string,"canonical_release_mbid": string,"first_release_date": string,"id": number,"mbid": string,"primary_type": string,"retired": boolean,"secondary_types": (string)[],"title": string,"tracks_current": boolean
            }[]
                           },
"get_album_tracks":
{ Args: { "p_album_id": number }; Returns: {
              "disc_number": number,"length_ms": number,"position": number,"recording_mbid": string,"title": string
            }[]
                           },
"is_valid_username":
{ Args: { "p_username": string }; Returns: boolean
                           },
"remove_avatar":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"search_albums":
{ Args: { "lim"?: number,"q": string }; Returns: {
              "artist_credit": string,"first_release_date": string,"id": number,"mbid": string,"primary_type": string,"score": number,"secondary_types": (string)[],"title": string
            }[]
                           },
"set_album_tracks":
{ Args: { "p_album_id": number,"p_release_mbid": string,"p_tracks": Json }; Returns: number
                           },
"set_avatar":
{ Args: { "p_path": string }; Returns: string
                           },
"update_profile":
{ Args: { "p_bio": string,"p_display_name": string,"p_username": string,"p_visibility": Database["public"]['Enums']["profile_visibility"] }; Returns: {
              "avatar_url": string | null,
"bio": string | null,
"created_at": string,
"display_name": string | null,
"user_id": string,
"username": string,
"visibility": Database["public"]['Enums']["profile_visibility"]
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "profile_visibility": "public"|"private"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "catalog": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "profile_visibility": ["public", "private"]
          }
        }
} as const
