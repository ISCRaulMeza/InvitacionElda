import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { trigger, transition, style, animate } from '@angular/animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  animations: [
    trigger('riseIn', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(22px)' }),
        animate('700ms 180ms cubic-bezier(.2,.8,.2,1)', style({ opacity: 1, transform: 'translateY(0)' }))
      ])
    ])
  ]
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChildren('flipSection') flipSections!: QueryList<ElementRef<HTMLElement>>;

  flippedSections = new Set<number>();
  private lastScrollY = 0;
  private observer?: IntersectionObserver;
  private scrollTicking = false;

  readonly steps = [
    { number: '01', title: 'Empieza caminando', icon: '🚶' },
    { number: '02', title: 'Combina caminata + trote', icon: '🏃' },
    { number: '03', title: 'Conquista los 3 km', icon: '🏁' }
  ];

  readonly details = [
    ['📅', 'Fecha', 'ENERO 2027'], ['🏃', 'Distancia', '3 kil\u00F3metros'], ['🎂', 'Motivo', 'Birthday Run de Elda Meza'],
    ['📍', 'Lugar', 'Pr\u00F3ximamente'], ['⏰', 'Horario', 'Pr\u00F3ximamente'], ['🗺️', 'Ruta', 'Pr\u00F3ximamente']
  ];

  ngAfterViewInit(): void {
    this.lastScrollY = this.getScrollY();

    if (!('IntersectionObserver' in window)) {
      this.flippedSections = new Set(this.flipSections.map((_, index) => index));
      return;
    }

    this.observer = new IntersectionObserver((entries) => {
      let changed = false;
      entries.forEach((entry) => {
        const index = this.flipSections.toArray().findIndex((section) => section.nativeElement === entry.target);
        if (entry.isIntersecting && index >= 0 && !this.flippedSections.has(index)) {
          this.flippedSections.add(index);
          changed = true;
        }
      });
      if (changed) this.flippedSections = new Set(this.flippedSections);
    }, { threshold: 0.28, rootMargin: '-4% 0px -4% 0px' });

    this.flipSections.forEach((section) => this.observer?.observe(section.nativeElement));
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    window.requestAnimationFrame(() => {
      const currentY = this.getScrollY();
      if (currentY < this.lastScrollY - 4) {
        let changed = false;
        this.flipSections.forEach((section, index) => {
          if (section.nativeElement.getBoundingClientRect().top > window.innerHeight * 0.42 && this.flippedSections.delete(index)) {
            changed = true;
          }
        });
        if (changed) this.flippedSections = new Set(this.flippedSections);
      }
      this.lastScrollY = currentY;
      this.scrollTicking = false;
    });
  }

  nextSection(index: number): void {
    const next = this.flipSections.toArray()[index + 1];
    if (next) this.scrollToElement(next.nativeElement, 'center');
  }

  backToStart(): void {
    const hero = document.querySelector<HTMLElement>('.hero');
    if (hero) this.scrollToElement(hero, 'start');
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private getScrollY(): number {
    return Math.max(0, window.pageYOffset || document.documentElement.scrollTop || 0);
  }

  private scrollToElement(element: HTMLElement, block: ScrollLogicalPosition): void {
    try {
      element.scrollIntoView({ behavior: 'smooth', block });
    } catch {
      window.scrollTo(0, element.getBoundingClientRect().top + this.getScrollY());
    }
  }
}
