export type UserDTO = {
  id: string;
  phone: string;
  username: string;
  time_zone: string;
  notify_sound: boolean;
  notify_vibrate: boolean;
  notify_break_focus: boolean;
  created_at: string;
  has_avatar: boolean;
  avatar_updated_at: string | null;
};

export type GroupMember = { user_id: string; role: 'owner' | 'member' };

export type GroupDTO = {
  id: string;
  name: string;
  owner_id: string;
  cadence: 'daily' | 'weekly';
  daily_frequency?: number | null;
  weekly_frequency?: number | null;
  call_duration_minutes: number;
  // Whole hours, 0–23, in `time_zone` — the group's own zone, not the viewer's.
  call_window_start: number;
  call_window_end: number;
  time_zone: string;
  is_muted?: boolean;
  member_count: number;
  members: GroupMember[];
  current_call?: CallSessionDTO | null;
  last_call?: { id: string; ended_at: string } | null;
  created_at: string;
};

export type CallSessionDTO = {
  id: string;
  group_id: string;
  status: 'active' | 'scheduled' | 'ended';
  started_at?: string | null;
  ends_at?: string | null;
  ended_at?: string | null;
  participant_count?: number;
  room_name?: string;
};

