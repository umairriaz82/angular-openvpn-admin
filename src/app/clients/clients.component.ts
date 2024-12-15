import { Component } from '@angular/core';

@Component({
  selector: 'app-clients',
  standalone: true,
  templateUrl: './clients.component.html',
  styleUrls: ['./clients.component.scss'],
})
export class ClientsComponent {
  clients = [
    { name: 'Client 1', status: 'Active' },
    { name: 'Client 2', status: 'Inactive' },
  ];
}
