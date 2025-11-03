type Fetcher = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;
  private fetcher: Fetcher;

  constructor(baseUrl: string, getToken: () => string | null, fetcher?: Fetcher) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.getToken = getToken;
    this.fetcher = fetcher || fetch;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}

