import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VpnService } from '../../services/vpn.service';
import { VpnClient } from '../../interfaces/client.interface';
import { BytesPipe } from '../../pipes/bytes.pipe';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

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

    showModal = false;
    newClientName = '';
    clientNameError: string | null = null;

    showDeleteModal = false;
    clientToDelete: string | null = null;

    username: string = '';
    isAuthenticated = false;

    isCreatingClient = false;
    isDeletingClient = false;

    constructor(
        private vpnService: VpnService,
        private authService: AuthService,
        private router: Router
    ) {}

    ngOnInit(): void {
        this.authService.isAuthenticated().subscribe(
            isAuth => {
                this.isAuthenticated = isAuth;
                if (isAuth) {
                    const token = this.authService.getToken();
                    if (token) {
                        try {
                            const tokenData = JSON.parse(atob(token.split('.')[1]));
                            this.username = tokenData.username;
                        } catch (e) {
                            console.error('Error decoding token:', e);
                        }
                    }
                } else {
                    this.router.navigate(['/login']);
                }
            }
        );
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
        this.showModal = true;
        this.newClientName = '';
        this.clientNameError = null;
    }

    closeModal() {
        this.showModal = false;
        this.newClientName = '';
        this.clientNameError = null;
    }

    validateClientName(name: string) {
        // Check for spaces
        if (name.includes(' ')) {
            this.clientNameError = 'Client name cannot contain spaces';
            return false;
        }

        // Check for special characters (allow only alphanumeric and hyphen/underscore)
        if (!/^[a-zA-Z0-9_-]*$/.test(name)) {
            this.clientNameError = 'Client name can only contain letters, numbers, hyphens, and underscores';
            return false;
        }

        // Check minimum length
        if (name.length < 3) {
            this.clientNameError = 'Client name must be at least 3 characters long';
            return false;
        }

        // Check maximum length
        if (name.length > 32) {
            this.clientNameError = 'Client name cannot exceed 32 characters';
            return false;
        }

        this.clientNameError = null;
        return true;
    }

    isValidClientName(name: string): boolean {
        return name.length >= 3 && 
               name.length <= 32 && 
               !name.includes(' ') && 
               /^[a-zA-Z0-9_-]*$/.test(name);
    }

    confirmCreateClient() {
        if (!this.isValidClientName(this.newClientName)) {
            return;
        }

        this.isCreatingClient = true;
        this.vpnService.createClient(this.newClientName).subscribe({
            next: (response) => {
                this.closeModal();
                this.loadClients();
                this.error = null;
            },
            error: (error) => {
                this.clientNameError = error.error.message || 'Failed to create client';
            },
            complete: () => {
                this.isCreatingClient = false;
            }
        });
    }

    deleteClient(name: string) {
        this.clientToDelete = name;
        this.showDeleteModal = true;
    }

    closeDeleteModal() {
        this.showDeleteModal = false;
        this.clientToDelete = null;
    }

    confirmDelete() {
        if (!this.clientToDelete) return;

        this.isDeletingClient = true;
        console.log(`Attempting to delete client: ${this.clientToDelete}`);
        
        this.vpnService.deleteClient(this.clientToDelete).subscribe({
            next: (response) => {
                console.log(`Delete response:`, response);
                this.error = '';
                this.loadClients();
                this.closeDeleteModal();
            },
            error: (error) => {
                console.error('Delete error:', error);
                this.error = `Failed to delete client ${this.clientToDelete}: ${error.message}`;
                this.loadClients();
                this.closeDeleteModal();
            },
            complete: () => {
                this.isDeletingClient = false;
            }
        });
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

    logout() {
        this.authService.logout();
        this.router.navigate(['/login']);
    }
}
