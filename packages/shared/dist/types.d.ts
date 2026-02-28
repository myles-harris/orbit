export type UserDTO = {
    id: string;
    phone: string;
    username: string;
    time_zone: string;
    created_at: string;
};
export type GroupMember = {
    user_id: string;
    role: 'owner' | 'member';
};
export type GroupDTO = {
    id: string;
    name: string;
    owner_id: string;
    cadence: 'daily' | 'weekly';
    weekly_frequency?: number | null;
    call_duration_minutes: number;
    member_count: number;
    members: GroupMember[];
    current_call?: CallSessionDTO | null;
    last_call?: {
        id: string;
        ended_at: string;
    } | null;
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
