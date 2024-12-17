import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VpnService } from '../../services/vpn.service';
import { VpnClient } from '../../interfaces/client.interface';
import { BytesPipe } from '../../pipes/bytes.pipe';

@Component({
    selector: 'app-index',
    standalone: true,
    imports: [CommonModule, BytesPipe],
    templateUrl: './index.component.html',
    styleUrls: ['./index.component.scss']
})
export class IndexComponent implements OnInit, OnDestroy {
    clients: VpnClient[] = [];
    private updateInterval: any;
    error: string = '';
    lastUpdated: Date = new Date();

    constructor(private vpnService: VpnService) {}

    ngOnInit() {
        this.loadClients();
        // Poll for updates every 5 seconds
        this.updateInterval = setInterval(() => {
            this.loadClients();
        }, 5000);
    }

    ngOnDestroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }

    loadClients() {
        console.log('Fetching clients...'); // Debug log
        this.lastUpdated = new Date();
        this.vpnService.getClients().subscribe({
            next: (clients) => {
                console.log('Received clients:', clients); // Debug log
                this.clients = clients;
            },
            error: (error) => {
                console.error('Error loading clients:', error);
                this.error = 'Failed to load clients';
            }
        });
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

    downloadConfig(clientName: string) {
        console.log(`Initiating download for ${clientName}`);
        this.vpnService.downloadConfig(clientName).subscribe({
            next: (blob: Blob) => {
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${clientName}.ovpn`;
                
                // Append to body, click and remove
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                console.log(`Download completed for ${clientName}`);
            },
            error: (error) => {
                console.error('Error downloading config:', error);
                this.error = `Failed to download configuration for ${clientName}`;
            }
        });
    }
}
