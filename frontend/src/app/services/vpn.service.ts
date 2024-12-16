// frontend/src/app/services/vpn.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { VpnClient } from '../interfaces/client.interface';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class VpnService {
    private apiUrl = '/api';

    constructor(
        private http: HttpClient,
        private authService: AuthService
    ) { }

    private getHeaders(): HttpHeaders {
        return new HttpHeaders({
            'Authorization': `Bearer ${this.authService.getToken()}`
        });
    }

    getClients(): Observable<VpnClient[]> {
        return this.http.get<VpnClient[]>(`${this.apiUrl}/clients`, { headers: this.getHeaders() });
    }

    createClient(name: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/clients`, { name }, { headers: this.getHeaders() });
    }

    deleteClient(name: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/clients/${name}`, { headers: this.getHeaders() });
    }

    downloadClientConfig(name: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/clients/${name}/config`, {
            headers: this.getHeaders(),
            responseType: 'blob'
        });
    }
}