import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { trigger, transition, style, animate } from '@angular/animations';
import { jsPDF } from 'jspdf';

interface Attendee {
  number: number;
  name: string;
  confirmedAt: string;
}

interface ApiResponse {
  ok: boolean;
  message?: string;
  number?: number;
  attendees?: Attendee[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  readonly isAdminView = window.location.pathname.replace(/\/+$/, '').endsWith('/adminList');
  readonly mapUrl: SafeResourceUrl;
  readonly directionsUrl = 'https://www.google.com/maps/search/?api=1&query=Parque+Metropolitano+de+Guadalajara';

  flippedSections = new Set<number>();
  guestName = '';
  attendanceConfirmed = false;
  rsvpLoading = false;
  rsvpError = '';
  assignedNumber?: number;

  adminPassword = '';
  adminUnlocked = false;
  adminLoading = false;
  adminError = '';
  attendees: Attendee[] = [];

  private lastScrollY = 0;
  private observer?: IntersectionObserver;
  private scrollTicking = false;
  private requestId = this.createRequestId();

  readonly steps = [
    { number: '01', title: 'Empieza caminando', icon: '🚶' },
    { number: '02', title: 'Combina caminata + trote', icon: '🏃' },
    { number: '03', title: 'Conquista los 3 km', icon: '🏁' }
  ];

  readonly details = [
    ['📅', 'Fecha', 'SÁBADO 9 DE ENERO · 2027'],
    ['🕗', 'Llegada', '8:00 A. M.'],
    ['🚩', 'Banderazo de salida', '8:30 A. M.'],
    ['📍', 'Lugar', 'PARQUE METROPOLITANO DE GUADALAJARA'],
    ['🏃', 'Distancia', '3 KILÓMETROS'],
    ['🎂', 'Motivo', 'MI BIRTHDAY RUN · ELDA MEZA']
  ];

  constructor(sanitizer: DomSanitizer) {
    this.mapUrl = sanitizer.bypassSecurityTrustResourceUrl('https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3732.9774204991654!2d-103.44231322631674!3d20.67049759999027!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8428aebac7b26f9b%3A0x7823b6a09cde5bb6!2sParque%20Metropolitano%20de%20Guadalajara!5e0!3m2!1ses!2smx!4v1791395380747!5m2!1ses!2smx');
  }

  ngAfterViewInit(): void {
    if (this.isAdminView) return;
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
    }, { threshold: 0.22, rootMargin: '-3% 0px -3% 0px' });

    this.flipSections.forEach((section) => this.observer?.observe(section.nativeElement));
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.isAdminView || this.scrollTicking) return;
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

  async submitRsvp(): Promise<void> {
    this.rsvpError = '';
    const name = this.guestName.trim();
    if (name.length < 2) {
      this.rsvpError = 'Escribe tu nombre para poder registrarte.';
      return;
    }
    if (!this.attendanceConfirmed) {
      this.rsvpError = 'Marca la casilla para confirmar tu asistencia.';
      return;
    }

    this.rsvpLoading = true;
    try {
      const result = await this.callApi({ action: 'confirm', name, requestId: this.requestId });
      if (!result.ok || !result.number) throw new Error(result.message || 'No pude guardar tu confirmación.');
      this.assignedNumber = result.number;
      this.requestId = this.createRequestId();
    } catch (error) {
      this.rsvpError = error instanceof Error ? error.message : 'No pude guardar tu confirmación. Intenta otra vez.';
    } finally {
      this.rsvpLoading = false;
    }
  }

  async unlockAdmin(): Promise<void> {
    this.adminError = '';
    if (!this.adminPassword) {
      this.adminError = 'Escribe la contraseña.';
      return;
    }
    await this.loadAttendees();
  }

  async refreshAdmin(): Promise<void> {
    await this.loadAttendees();
  }

  lockAdmin(): void {
    this.adminUnlocked = false;
    this.adminPassword = '';
    this.attendees = [];
    this.adminError = '';
  }

  downloadCsv(): void {
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Número', 'Nombre', 'Confirmó el'].map(escape).join(','),
      ...this.attendees.map((person) => [person.number, person.name, person.confirmedAt].map(escape).join(','))
    ];
    this.downloadBlob(new Blob([`\ufeff${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), 'asistentes-birthday-run-2027.csv');
  }

  downloadPdf(): void {
    const pdf = new jsPDF();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 42;

    const drawHeader = (): void => {
      pdf.setFillColor(23, 19, 31);
      pdf.rect(0, 0, 210, 28, 'F');
      pdf.setTextColor(255, 211, 78);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('BIRTHDAY RUN 2027 - ELDA MEZA', 14, 18);
      pdf.setTextColor(23, 19, 31);
      pdf.setFontSize(11);
    };

    drawHeader();
    pdf.text(`Lista de asistentes confirmados: ${this.attendees.length}`, 14, 36);
    this.attendees.forEach((person) => {
      if (y > pageHeight - 18) {
        pdf.addPage();
        drawHeader();
        y = 38;
      }
      const shade = person.number % 2 === 0 ? 247 : 255;
      pdf.setFillColor(shade, shade === 247 ? 243 : 255, shade === 247 ? 249 : 255);
      pdf.roundedRect(14, y - 6, 182, 11, 2, 2, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.text(`#${person.number}`, 18, y + 1);
      pdf.setFont('helvetica', 'normal');
      pdf.text(person.name, 38, y + 1, { maxWidth: 98 });
      pdf.setFontSize(8);
      pdf.setTextColor(105, 98, 108);
      pdf.text(person.confirmedAt, 142, y + 1, { maxWidth: 50 });
      pdf.setTextColor(23, 19, 31);
      pdf.setFontSize(11);
      y += 13;
    });
    pdf.save('asistentes-birthday-run-2027.pdf');
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  private async loadAttendees(): Promise<void> {
    this.adminLoading = true;
    this.adminError = '';
    try {
      const result = await this.callApi({ action: 'list', password: this.adminPassword });
      if (!result.ok || !result.attendees) throw new Error(result.message || 'No fue posible cargar la lista.');
      this.attendees = result.attendees;
      this.adminUnlocked = true;
    } catch (error) {
      this.adminUnlocked = false;
      this.adminError = error instanceof Error ? error.message : 'No fue posible cargar la lista.';
    } finally {
      this.adminLoading = false;
    }
  }

  private async callApi(body: Record<string, string>): Promise<ApiResponse> {
    const response = await fetch(new URL('api/rsvp.php', document.baseURI), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    });
    let result: ApiResponse;
    try {
      result = await response.json() as ApiResponse;
    } catch {
      throw new Error('El servidor no respondió correctamente. Intenta de nuevo en un momento.');
    }
    if (!response.ok) throw new Error(result.message || 'Ocurrió un error en el servidor.');
    return result;
  }

  private createRequestId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
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
