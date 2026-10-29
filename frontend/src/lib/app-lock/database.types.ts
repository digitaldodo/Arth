export interface AppLockDatabase {
  public: {
    Tables: {
      app_lock_credentials: {
        Row: {
          credential_id: string;
          user_id: string;
          device_id: string;
          public_key: string;
          counter: number;
          transports: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          credential_id: string;
          user_id: string;
          device_id: string;
          public_key: string;
          counter?: number;
          transports?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<AppLockDatabase['public']['Tables']['app_lock_credentials']['Insert']>;
        Relationships: [];
      };
      app_lock_challenges: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          ceremony: 'registration' | 'authentication';
          challenge: string | null;
          consumed_at: string | null;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          device_id: string;
          ceremony: 'registration' | 'authentication';
          challenge: string;
          consumed_at?: string | null;
          expires_at: string;
          created_at?: string;
        };
        Update: Partial<AppLockDatabase['public']['Tables']['app_lock_challenges']['Row']>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
