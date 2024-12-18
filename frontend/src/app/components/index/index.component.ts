import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VpnService } from '../../services/vpn.service';
import { VpnClient } from '../../interfaces/client.interface';
import { BytesPipe } from '../../pipes/bytes.pipe';

@Component({
    selector: 'app-index',
    standalone: true,
    imports: [CommonModule, FormsModule, BytesPipe],
    templateUrl: './index.component.html',
    styleUrls: ['./index.component.scss']
})
export class IndexComponent implements OnInit, OnDestroy {
    clients: VpnClient[] = [];
    filteredClients: VpnClient[] = [];
    private updateInterval: any;
    error: string = '';
    lastUpdated: Date = new Date();
    
    // Search and pagination
    searchTerm: string = '';
    currentPage: number = 1;
    itemsPerPage: number = 10;
    pageSizeOptions: number[] = [5, 10, 25, 50];
    
    // Add Math object
    protected Math = Math;

    constructor(private vpnService: VpnService) {}

    ngOnInit() {
        this.loadClients();
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
        this.lastUpdated = new Date();
        this.vpnService.getClients().subscribe({
            next: (clients) => {
                this.clients = clients;
                this.applyFilter();
            },
            error: (error) => {
                console.error('Error loading clients:', error);
                this.error = 'Failed to load clients';
            }
        });
    }

    // Search and pagination methods
    applyFilter() {
        this.filteredClients = this.clients.filter(client =>
            client.name.toLowerCase().includes(this.searchTerm.toLowerCase())
        );
    }

    onSearch(event: any) {
        this.searchTerm = typeof event === 'string' ? event : (event.target as HTMLInputElement).value;
        this.currentPage = 1; // Reset to first page on search
        this.applyFilter();
    }

    onPageSizeChange(event: Event) {
        this.itemsPerPage = Number((event.target as HTMLSelectElement).value);
        this.currentPage = 1; // Reset to first page when changing page size
    }

    get totalPages(): number {
        return Math.ceil(this.filteredClients.length / this.itemsPerPage);
    }

    get paginatedClients(): VpnClient[] {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        return this.filteredClients.slice(startIndex, startIndex + this.itemsPerPage);
    }

    previousPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
        }
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
        if (confirm(`Are you sure you want to delete client "${name}"?`)) {
            console.log(`Attempting to delete client: ${name}`);
            this.vpnService.deleteClient(name).subscribe({
                next: (response) => {
                    console.log(`Delete response:`, response);
                    this.error = ''; // Clear any existing errors
                    this.loadClients(); // Reload the client list
                },
                error: (error) => {
                    console.error('Delete error:', error);
                    this.error = `Failed to delete client ${name}: ${error.message}`;
                    
                    // Reload clients list anyway to ensure UI is in sync
                    this.loadClients();
                }
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
