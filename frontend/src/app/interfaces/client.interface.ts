export interface VpnClient {
    id: number;
    name: string;
    created_at: string;
    last_connected: string;
    bytes_received: number;
    bytes_sent: number;
    status: 'connected' | 'disconnected';
}
