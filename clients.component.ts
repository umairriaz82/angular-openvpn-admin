import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-clients',
  standalone: true,
  template: `
    <h2>Manage Clients</h2>
    <button (click)="addClient()">Add Client</button>
    <div *ngFor="let client of clients">
      <p>{{ client.name }} ({{ client.status }})</p>
      <button (click)="deleteClient(client.id)">Delete</button>
    </div>
  `,
})
export class ClientsComponent {
  clients: any[] = [];

  constructor(private http: HttpClient) {
    this.fetchClients();
  }

  fetchClients() {
    this.http.get<any[]>('/api/clients').subscribe(data => (this.clients = data));
  }

  addClient() {
    this.http.post('/api/clients', { name: 'New Client' }).subscribe(() => this.fetchClients());
  }

  deleteClient(id: number) {
    this.http.delete(`/api/clients/${id}`).subscribe(() => this.fetchClients());
  }
}