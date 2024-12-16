import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private apiUrl = '/api';
    private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

    constructor(private http: HttpClient) {
        this.isAuthenticatedSubject.next(!!localStorage.getItem('token'));
    }

    login(username: string, password: string): Observable<any> {
        return this.http.post(`${this.apiUrl}/login`, { username, password })
            .pipe(
                tap((response: any) => {
                    localStorage.setItem('token', response.token);
                    this.isAuthenticatedSubject.next(true);
                })
            );
    }

    logout(): void {
        localStorage.removeItem('token');
        this.isAuthenticatedSubject.next(false);
    }

    isAuthenticated(): Observable<boolean> {
        return this.isAuthenticatedSubject.asObservable();
    }

    getToken(): string | null {
        return localStorage.getItem('token');
    }
}
