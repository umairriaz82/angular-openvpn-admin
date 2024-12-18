import { AfterViewInit, Component, HostBinding, OnInit } from '@angular/core';
import { RouterOutlet, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { CommonModule } from '@angular/common';
import KTComponents from '../metronic/core/index';
import KTLayout from '../metronic/app/layouts/demo1';

@Component({
	selector: 'app-root',
	standalone: true,
	imports: [RouterOutlet, CommonModule],
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit, OnInit {
	title = 'angular-openvpn';
	@HostBinding('class') hostClass = 'flex grow';
	username: string = '';
	isAuthenticated: boolean = false;

	constructor(
		private authService: AuthService,
		private router: Router
	) {}

	ngAfterViewInit(): void {
		KTComponents.init();
		KTLayout.init();
	}

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
	}

	logout(): void {
		this.authService.logout();
		this.router.navigate(['/login']);
	}
}

