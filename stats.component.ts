import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-stats',
  standalone: true,
  template: `
    <h2>Statistics</h2>
    <p>Bytes Received: {{ stats?.bytesReceived }}</p>
    <p>Bytes Sent: {{ stats?.bytesSent }}</p>
  `,
})
export class StatsComponent {
  stats: any;

  constructor(private http: HttpClient) {
    this.fetchStats();
  }

  fetchStats() {
    this.http.get('/api/stats').subscribe(data => (this.stats = data));
  }
}