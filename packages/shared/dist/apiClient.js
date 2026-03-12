export class ApiClient {
    baseUrl;
    getToken;
    fetcher;
    onUnauthorized;
    constructor(baseUrl, getToken, fetcher, onUnauthorized) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.getToken = getToken;
        this.fetcher = fetcher || fetch;
        this.onUnauthorized = onUnauthorized;
    }
    async request(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        console.log('[ApiClient] Request:', {
            method,
            path,
            baseUrl: this.baseUrl,
            hasToken: !!token,
            tokenPreview: token ? `${token.substring(0, 20)}...` : 'null',
        });
        if (token)
            headers['Authorization'] = `Bearer ${token}`;
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
                if (retryRes.ok)
                    return (await retryRes.json());
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
        return (await res.json());
    }
    async get(path) {
        return this.request('GET', path);
    }
    async post(path, body) {
        return this.request('POST', path, body);
    }
    async put(path, body) {
        return this.request('PUT', path, body);
    }
    async delete(path) {
        return this.request('DELETE', path);
    }
    // User search
    async searchUsers(query, groupId) {
        const params = new URLSearchParams({ q: query });
        if (groupId)
            params.append('groupId', groupId);
        return this.get(`/users/search?${params.toString()}`);
    }
    // Direct invitations
    async inviteUserToGroup(groupId, username) {
        return this.post(`/groups/${groupId}/invite-user`, { username });
    }
    async respondToInvitation(inviteId, action) {
        return this.post(`/groups/invites/${inviteId}/respond`, { action });
    }
    async getMyInvitations() {
        return this.get('/me/invitations');
    }
}
