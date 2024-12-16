import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VpnService } from '../../services/vpn.service';
import { VpnClient } from '../../interfaces/client.interface';

@Component({
    selector: 'app-index',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './index.component.html',
    styleUrls: ['./index.component.scss']
})
export class IndexComponent implements OnInit {
    clients: VpnClient[] = [];

    constructor(private vpnService: VpnService) {}

    ngOnInit() {
        this.loadClients();
    }

    loadClients() {
        this.vpnService.getClients().subscribe(
            clients => this.clients = clients
        );
    }

    createNewClient() {
        const name = prompt('Enter client name:');
        if (name) {
            this.vpnService.createClient(name).subscribe(() => {
                this.loadClients();
            });
        }
    }

    deleteClient(name: string) {
        if (confirm(`Are you sure you want to delete client ${name}?`)) {
            this.vpnService.deleteClient(name).subscribe(() => {
                this.loadClients();
            });
        }
    }

    downloadConfig(name: string) {
        this.vpnService.downloadClientConfig(name).subscribe(blob => {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${name}.ovpn`;
            link.click();
            window.URL.revokeObjectURL(url);
        });
    }
}
