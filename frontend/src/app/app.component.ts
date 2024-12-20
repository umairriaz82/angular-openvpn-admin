import { AfterViewInit, Component, HostBinding } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
export class AppComponent implements AfterViewInit {
	@HostBinding('class') hostClass = 'flex grow';

	ngAfterViewInit(): void {
		KTComponents.init();
		KTLayout.init();
	}
}

