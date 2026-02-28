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
    put<T>(path: string, body?: unknown): Promise<T>;
    delete<T>(path: string): Promise<T>;
}
export {};
