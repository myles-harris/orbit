type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

// Return a new access token, or null if refresh failed (triggers logout)
type OnUnauthorized = () => Promise<string | null>;

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private fetcher: Fetcher;
  private onUnauthorized?: OnUnauthorized;

  constructor(
    baseUrl: string,
    getToken: () => string | null,
    fetcher?: Fetcher,
    onUnauthorized?: OnUnauthorized
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.getToken = getToken;
    this.fetcher = fetcher || fetch;
    this.onUnauthorized = onUnauthorized;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();

    console.log('[ApiClient] Request:', {
      method,
      path,
      baseUrl: this.baseUrl,
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
    });

    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log('[ApiClient] Response:', {
      status: res.status,
      ok: res.ok,
      path,
    });

    // Attempt token refresh on 401, then retry once
    if (res.status === 401 && this.onUnauthorized) {
      const newToken = await this.onUnauthorized();
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        const retryRes = await this.fetcher(`${this.baseUrl}${path}`, {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (retryRes.ok) return (await retryRes.json()) as T;
        const errorText = await retryRes.text();
        throw new Error(`HTTP ${retryRes.status}: ${errorText}`);
      }
      throw new Error('HTTP 401: session_expired');
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[ApiClient] Error response:', {
        status: res.status,
        body: errorText,
      });
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    return (await res.json()) as T;
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  // User search
  async searchUsers(query: string, groupId?: string): Promise<{ users: Array<{ id: string; username: string }> }> {
    const params = new URLSearchParams({ q: query });
    if (groupId) params.append('groupId', groupId);
    return this.get(`/users/search?${params.toString()}`);
  }

  // Direct invitations
  async inviteUserToGroup(groupId: string, username: string): Promise<{
    success: boolean;
    invite_id: string;
    invited_user: { id: string; username: string };
    expires_at: string;
  }> {
    return this.post(`/groups/${groupId}/invite-user`, { username });
  }

  async respondToInvitation(inviteId: string, action: 'accept' | 'decline' | 'dismiss'): Promise<{
    success: boolean;
    action: string;
    group?: { id: string; name: string };
  }> {
    return this.post(`/groups/invites/${inviteId}/respond`, { action });
  }

  async getMyInvitations(): Promise<{
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
  }> {
    return this.get('/me/invitations');
  }
}

