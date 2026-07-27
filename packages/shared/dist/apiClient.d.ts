type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;
type OnUnauthorized = () => Promise<string | null>;
export declare class ApiClient {
    private baseUrl;
    private getToken;
    private fetcher;
    private onUnauthorized?;
    constructor(baseUrl: string, getToken: () => string | null, fetcher?: Fetcher, onUnauthorized?: OnUnauthorized);
    request<T>(method: string, path: string, body?: unknown): Promise<T>;
    get<T>(path: string): Promise<T>;
    post<T>(path: string, body?: unknown): Promise<T>;
    patch<T>(path: string, body?: unknown): Promise<T>;
    put<T>(path: string, body?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
    searchUsers(query: string, groupId?: string): Promise<{
        users: Array<{
            id: string;
            username: string;
            has_avatar: boolean;
            status: 'member' | 'invited' | null;
        }>;
    }>;
    inviteUserToGroup(groupId: string, username: string): Promise<{
        success: boolean;
        invite_id: string;
        invited_user: {
            id: string;
            username: string;
        };
        expires_at: string;
    }>;
    respondToInvitation(inviteId: string, action: 'accept' | 'decline' | 'dismiss'): Promise<{
        success: boolean;
        action: string;
        group?: {
            id: string;
            name: string;
        };
    }>;
    createInviteLink(groupId: string): Promise<{
        invite_code: string;
        expires_at: string;
        invite_link: string;
    }>;
    getInviteInfo(code: string): Promise<{
        group_id: string;
        group_name: string;
        code: string;
        expires_at: string;
    }>;
    joinGroupWithCode(groupId: string, inviteCode: string): Promise<{
        status: 'joined' | 'already_member';
    }>;
    uploadAvatar(data: string, mimeType: string): Promise<{
        ok: boolean;
    }>;
    deleteAvatar(): Promise<{
        ok: boolean;
    }>;
    getAvatarUrl(userId: string): string;
    getMyInvitations(): Promise<{
        invitations: Array<{
            id: string;
            group: {
                id: string;
                name: string;
                cadence: string;
                weekly_frequency: number | null;
                call_duration_minutes: number;
                member_count: number;
            };
            invited_by: string;
            created_at: string;
            expires_at: string;
        }>;
    }>;
}
export {};
