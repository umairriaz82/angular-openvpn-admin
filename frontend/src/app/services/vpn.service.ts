// frontend/src/app/services/vpn.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, catchError, throwError } from 'rxjs';
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
        return this.http.get<VpnClient[]>(`${this.apiUrl}/clients`, { headers: this.getHeaders() })
            .pipe(
                tap(clients => console.log('Received clients:', clients)),
                catchError(error => {
                    console.error('Error fetching clients:', error);
                    return throwError(() => error);
                })
            );
    }

    createClient(name: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/clients`, { name }, { headers: this.getHeaders() });
    }

    deleteClient(name: string): Observable<any> {
        return this.http.delete(`${this.apiUrl}/clients/${name}`, { headers: this.getHeaders() });
    }

    downloadConfig(clientName: string): Observable<Blob> {
        return this.http.get(`${this.apiUrl}/clients/${clientName}/config`, {
            headers: this.getHeaders(),
            responseType: 'blob'
        }).pipe(
            tap(() => console.log(`Downloading config for ${clientName}`)),
            catchError(error => {
                console.error('Error downloading config:', error);
                return throwError(() => error);
            })
        );
    }
}