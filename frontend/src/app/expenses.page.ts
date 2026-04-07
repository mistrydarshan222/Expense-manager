import { DatePipe, DOCUMENT, NgClass } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';

import { Expense } from './api.types';
import { AppStore } from './app.store';

type TimeRange = 'all' | 'lastMonth' | 'thisMonth' | 'thisWeek' | 'today';

@Component({
  selector: 'app-expenses-page',
  imports: [ReactiveFormsModule, DatePipe, NgClass],
  templateUrl: './expenses.page.html',
  styleUrl: './expenses.page.scss'
})
export class ExpensesPageComponent {
  protected readonly store = inject(AppStore);
  private readonly fb = inject(FormBuilder);
  private readonly document = inject(DOCUMENT);
  protected readonly editingExpenseId = signal<string | null>(null);
  protected readonly isEditingExpense = computed(() => this.editingExpenseId() !== null);

  protected readonly expenseForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(2)]],
    categoryId: ['', [Validators.required]],
    expenseDate: [new Date().toISOString().slice(0, 10), [Validators.required]],
    finalAmount: [0, [Validators.required, Validators.min(0.01)]],
    merchantName: [''],
    paymentMethod: [''],
    notes: ['']
  });

  protected readonly filterForm = this.fb.nonNullable.group({
    timeRange: ['all' as TimeRange],
    search: [''],
    categoryId: ['all'],
    paymentMethod: ['all'],
    currency: ['all']
  });

  private readonly filters = toSignal(
    this.filterForm.valueChanges.pipe(startWith(this.filterForm.getRawValue())),
    { initialValue: this.filterForm.getRawValue() }
  );

  protected readonly filteredExpenses = computed(() => {
    const {
      timeRange = 'all',
      search = '',
      categoryId = 'all',
      paymentMethod = 'all',
      currency = 'all'
    } = this.filters();
    const searchValue = search.trim().toLowerCase();

    return this.store.expenses().filter((expense) => {
      const expenseDate = new Date(expense.expenseDate);

      const matchesTimeRange = this.matchesTimeRange(expenseDate, timeRange);
      const matchesSearch =
        !searchValue ||
        expense.title.toLowerCase().includes(searchValue) ||
        (expense.merchantName ?? '').toLowerCase().includes(searchValue) ||
        (expense.notes ?? '').toLowerCase().includes(searchValue);
      const matchesCategory = categoryId === 'all' || expense.categoryId === categoryId;
      const matchesPaymentMethod = paymentMethod === 'all' || (expense.paymentMethod ?? '') === paymentMethod;
      const matchesCurrency = currency === 'all' || expense.currency === currency;

      return matchesTimeRange && matchesSearch && matchesCategory && matchesPaymentMethod && matchesCurrency;
    });
  });

  protected readonly filteredTotalsByCurrency = computed(() => {
    const totals = new Map<string, number>();

    for (const expense of this.filteredExpenses()) {
      const currency = expense.currency || 'USD';
      totals.set(currency, (totals.get(currency) ?? 0) + Number(expense.finalAmount));
    }

    return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
  });

  constructor() {
    effect(() => {
      const categories = this.store.categories();
      if (!this.expenseForm.value.categoryId && categories.length > 0) {
        this.expenseForm.patchValue({ categoryId: categories[0].id });
      }
    });

    effect(() => {
      const methods = this.store.paymentMethods();
      if (!this.expenseForm.value.paymentMethod && methods.length > 0) {
        this.expenseForm.patchValue({ paymentMethod: methods[0].name });
      }
    });
  }

  protected saveExpense() {
    if (this.expenseForm.invalid) {
      this.expenseForm.markAllAsTouched();
      return;
    }

    const formValue = this.expenseForm.getRawValue();
    const payload = {
      ...formValue,
      finalAmount: Number(formValue.finalAmount),
      currency: this.store.preferredCurrency()
    };

    const editingExpenseId = this.editingExpenseId();

    if (!editingExpenseId) {
      return;
    }

    this.store.updateExpense(editingExpenseId, payload, () => this.resetExpenseForm());
  }

  protected setTimeRange(timeRange: TimeRange) {
    this.filterForm.patchValue({ timeRange });
  }

  protected startEditExpense(expense: Expense) {
    this.editingExpenseId.set(expense.id);
    this.expenseForm.patchValue({
      title: expense.title,
      categoryId: expense.categoryId ?? '',
      expenseDate: expense.expenseDate.slice(0, 10),
      finalAmount: Number(expense.finalAmount),
      merchantName: expense.merchantName ?? '',
      paymentMethod: expense.paymentMethod ?? this.store.paymentMethods()[0]?.name ?? '',
      notes: expense.notes ?? ''
    });
    this.store.statusMessage.set(`Editing "${expense.title}". Update any field and save.`);
    queueMicrotask(() => {
      const editSection = this.document.getElementById('expense-editor');
      editSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  protected cancelEditExpense() {
    this.resetExpenseForm();
    this.store.statusMessage.set('Edit cancelled. You can continue browsing expenses.');
  }

  protected deleteExpense(expenseId: string) {
    this.store.deleteExpense(expenseId);
  }

  protected clearFilters() {
    this.filterForm.reset({
      timeRange: 'all',
      search: '',
      categoryId: 'all',
      paymentMethod: 'all',
      currency: 'all'
    });
  }

  protected resetExpenseForm() {
    this.editingExpenseId.set(null);
    this.expenseForm.patchValue({
      title: '',
      categoryId: this.store.categories()[0]?.id ?? '',
      expenseDate: new Date().toISOString().slice(0, 10),
      finalAmount: 0,
      merchantName: '',
      paymentMethod: this.store.paymentMethods()[0]?.name ?? '',
      notes: ''
    });
  }

  protected async downloadStatementPdf() {
    const expenses = this.filteredExpenses();
    const totals = this.filteredTotalsByCurrency();
    const { timeRange = 'all' } = this.filters();
    const userName = this.store.userName();
    const generatedAt = new Date();
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const logo = await this.loadLogoForPdf();
    const pdfBytes = this.createStyledPdf({
      userName,
      generatedAt: dateFormatter.format(generatedAt),
      timeRange: this.labelForTimeRange(timeRange),
      totals,
      expenses,
      dateFormatter,
      logo
    });
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense-statement-${timeRange}-${generatedAt.toISOString().slice(0, 10)}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected paymentMethodClass(method: string | null) {
    const value = (method ?? '').toLowerCase();

    if (value.includes('cash')) {
      return 'method-badge-cash';
    }

    if (
      value.includes('visa') ||
      value.includes('mastercard') ||
      value.includes('amex') ||
      value.includes('credit') ||
      value.includes('debit') ||
      value.includes('card')
    ) {
      return 'method-badge-card';
    }

    if (
      value.includes('bank') ||
      value.includes('transfer') ||
      value.includes('wire') ||
      value.includes('upi')
    ) {
      return 'method-badge-bank';
    }

    return 'method-badge-default';
  }

  private labelForTimeRange(timeRange: TimeRange) {
    switch (timeRange) {
      case 'today':
        return 'Today';
      case 'thisWeek':
        return 'This week';
      case 'thisMonth':
        return 'This month';
      case 'lastMonth':
        return 'Last month';
      case 'all':
      default:
        return 'All time';
    }
  }

  private getStatementMeta(timeRange: string) {
    const now = new Date();
    const dateFormatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    switch (timeRange) {
      case 'Today':
        return { periodLabel: dateFormatter.format(startOfToday) };
      case 'This week': {
        const weekday = startOfToday.getDay();
        const diffToMonday = weekday === 0 ? 6 : weekday - 1;
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
        return { periodLabel: `${dateFormatter.format(startOfWeek)} - ${dateFormatter.format(endOfToday)}` };
      }
      case 'This month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return { periodLabel: `${dateFormatter.format(startOfMonth)} - ${dateFormatter.format(endOfToday)}` };
      }
      case 'Last month': {
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        return { periodLabel: `${dateFormatter.format(startOfLastMonth)} - ${dateFormatter.format(endOfLastMonth)}` };
      }
      case 'All time':
      default:
        return { periodLabel: 'Full history' };
    }
  }

  private createStyledPdf(input: {
    userName: string;
    generatedAt: string;
    timeRange: string;
    totals: Array<{ currency: string; amount: number }>;
    expenses: ReturnType<ExpensesPageComponent['filteredExpenses']>;
    dateFormatter: Intl.DateTimeFormat;
    logo: { bytes: Uint8Array; width: number; height: number } | null;
  }) {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;
    const headerHeight = 86;
    const contentWidth = pageWidth - margin * 2;
    const pages: string[] = [];
    let currentY = pageHeight;
    let stream = '';
    const statementMeta = this.getStatementMeta(input.timeRange);
    const totalTransactions = input.expenses.length;
    const categoryCount = new Set(input.expenses.map((expense) => expense.category?.name || 'Uncategorized')).size;
    const paymentCount = new Set(input.expenses.map((expense) => expense.paymentMethod || 'Unassigned')).size;

    const startPage = () => {
      currentY = pageHeight - margin;
      stream += this.drawRect(0, pageHeight - headerHeight, pageWidth, headerHeight, '#1F2937');
      stream += this.drawRect(0, pageHeight - headerHeight - 8, pageWidth, 8, '#10B981');

      if (input.logo) {
        const logoWidth = 52;
        const logoHeight = (input.logo.height / input.logo.width) * logoWidth;
        const logoY = pageHeight - 64;
        stream += this.drawImage('Im1', margin, logoY, logoWidth, logoHeight);
        stream += this.drawText('ExpenseFlow Statement', margin + 66, pageHeight - 34, 20, '#FFFFFF', 'F2');
        stream += this.drawText('Expense history overview', margin + 66, pageHeight - 54, 10, '#CBD5E1', 'F1');
      } else {
        stream += this.drawText('ExpenseFlow Statement', margin, pageHeight - 34, 20, '#FFFFFF', 'F2');
        stream += this.drawText('Expense history overview', margin, pageHeight - 54, 10, '#CBD5E1', 'F1');
      }

      stream += this.drawText('STATEMENT PERIOD', pageWidth - margin - 138, pageHeight - 28, 8, '#94A3B8', 'F2');
      stream += this.drawText(statementMeta.periodLabel, pageWidth - margin - 138, pageHeight - 46, 12, '#FFFFFF', 'F2');
      stream += this.drawText(`Generated ${input.generatedAt}`, pageWidth - margin - 138, pageHeight - 62, 9, '#CBD5E1', 'F1');

      currentY = pageHeight - headerHeight - 20;
    };

    const ensureSpace = (heightNeeded: number) => {
      if (currentY - heightNeeded < margin) {
        pages.push(stream);
        stream = '';
        startPage();
      }
    };

    startPage();

    const summaryTop = currentY;
    const detailsWidth = contentWidth;
    const balanceWidth = Math.floor((contentWidth - 14) / 2);
    // stream += this.drawText('Summary of your account', margin, summaryTop, 15, '#0F766E', 'F2');
    // currentY -= 24;

    stream += this.drawRect(margin, currentY - 128, detailsWidth, 120, '#FFFFFF', 12, '#D7E0EA');

    const leftLabelX = margin + 12;
    const leftValueX = margin + 130;
    const rightLabelX = margin + detailsWidth / 2 + 16;
    const rightValueX = margin + detailsWidth / 2 + 132;

    const detailRows = [
      ['Account holder', input.userName],
      ['Statement period', statementMeta.periodLabel],
      ['Transactions', `${totalTransactions}`],
      ['Categories used', `${categoryCount}`],
      ['Payment methods', `${paymentCount}`]
    ];

    detailRows.forEach(([label, value], index) => {
      const y = currentY - 28 - index * 22;
      stream += this.drawText(label, leftLabelX, y, 9, '#475569', 'F1');
      stream += this.drawText(value, leftValueX, y, 9, '#111827', 'F2');
    });

    const rightLabels = [
      ['Primary range', input.timeRange],
      ['Generated on', input.generatedAt],
      ['Matching filters', `${totalTransactions} result${totalTransactions === 1 ? '' : 's'}`]
    ];

    rightLabels.forEach(([label, value], index) => {
      const y = currentY - 28 - index * 22;
      stream += this.drawText(label, rightLabelX, y, 9, '#475569', 'F1');
      stream += this.drawText(value, rightValueX, y, 9, '#111827', 'F2');
    });

    const balanceY = currentY - 144;
    stream += this.drawRect(margin, balanceY - 102, balanceWidth, 102, '#F8FAFC', 14, '#CFE0F2');
    stream += this.drawRect(margin, balanceY - 102, balanceWidth, 8, '#123B67', 14);
    stream += this.drawText('Statement balance', margin + 16, balanceY - 24, 11, '#123B67', 'F2');
    stream += this.drawText('Current filtered total', margin + 16, balanceY - 40, 9, '#64748B', 'F1');

    let summaryY = balanceY - 66;
    input.totals.forEach((total) => {
      stream += this.drawText(total.currency, margin + 16, summaryY, 9, '#64748B', 'F1');
      stream += this.drawText(this.store.formatCurrency(total.amount, total.currency), margin + 16, summaryY - 16, 15, '#0F172A', 'F2');
      summaryY -= 28;
    });

    currentY = balanceY - 126;

    const drawTableHeader = () => {
      stream += this.drawText('Details of your transactions', margin, currentY, 13, '#0F766E', 'F2');
      currentY -= 18;
      stream += this.drawRect(margin, currentY - 24, contentWidth, 24, '#F3F7FB');
      stream += this.drawText('Date', margin + 12, currentY - 15, 9, '#6B7280', 'F2');
      stream += this.drawText('Description', margin + 96, currentY - 15, 9, '#6B7280', 'F2');
      stream += this.drawText('Payment', pageWidth - margin - 126, currentY - 15, 9, '#6B7280', 'F2');
      stream += this.drawText('Amount', pageWidth - margin - 64, currentY - 15, 9, '#6B7280', 'F2');
      currentY -= 34;
    };

    drawTableHeader();

    for (const expense of input.expenses) {
      const title = expense.title || 'Expense';
      const date = input.dateFormatter.format(new Date(expense.expenseDate));
      const category = expense.category?.name || 'Uncategorized';
      const merchant = expense.merchantName || 'No merchant';
      const paymentMethod = expense.paymentMethod || 'No payment method';
      const amount = this.store.formatCurrency(expense.finalAmount, expense.currency);
      const descriptionLines = this.wrapText(`${title} - ${category}`, 30);
      const merchantLines = this.wrapText(`Merchant: ${merchant}`, 30);
      const paymentLines = this.wrapText(paymentMethod, 12);
      const noteLines = expense.notes ? this.wrapText(expense.notes, 70) : [];
      const detailLineCount = Math.max(descriptionLines.length + merchantLines.length, paymentLines.length);
      const blockHeight = 24 + detailLineCount * 12 + (noteLines.length > 0 ? noteLines.length * 11 + 10 : 0);

      ensureSpace(blockHeight + 12);
      if (currentY === pageHeight - headerHeight - 22) {
        drawTableHeader();
      }

      stream += this.drawLine(margin, currentY, pageWidth - margin, currentY, '#E5E7EB', 1);
      stream += this.drawText(date, margin + 12, currentY - 18, 10, '#1F2937', 'F1');

      let textY = currentY - 18;
      for (const line of descriptionLines) {
        stream += this.drawText(line, margin + 96, textY, 10, line === descriptionLines[0] ? '#1F2937' : '#6B7280', line === descriptionLines[0] ? 'F2' : 'F1');
        textY -= 12;
      }

      for (const line of merchantLines) {
        stream += this.drawText(line, margin + 96, textY, 10, '#6B7280', 'F1');
        textY -= 12;
      }

      let paymentY = currentY - 18;
      for (const line of paymentLines) {
        stream += this.drawText(line, pageWidth - margin - 126, paymentY, 10, '#4B5563', 'F1');
        paymentY -= 12;
      }

      stream += this.drawText(amount, pageWidth - margin - 64, currentY - 18, 11, '#0F766E', 'F2');

      if (noteLines.length > 0) {
        let noteY = currentY - 24 - detailLineCount * 12;
        stream += this.drawText('Note:', margin + 96, noteY, 9, '#6B7280', 'F2');
        noteY -= 11;
        for (const line of noteLines) {
          stream += this.drawText(line, margin + 124, noteY, 9, '#6B7280', 'F1');
          noteY -= 11;
        }
      }

      currentY -= blockHeight;
    }

    pages.push(stream);
    const objects: string[] = [];

    objects.push('<< /Type /Catalog /Pages 2 0 R >>');

    const kidsRefs = pages.map((_, pageIndex) => `${3 + pageIndex * 2} 0 R`).join(' ');
    objects.push(`<< /Type /Pages /Count ${pages.length} /Kids [${kidsRefs}] >>`);

    pages.forEach((pageStream, pageIndex) => {
      const pageObjectNumber = 3 + pageIndex * 2;
      const contentObjectNumber = pageObjectNumber + 1;
      const font1ObjectNumber = 3 + pages.length * 2;
      const font2ObjectNumber = font1ObjectNumber + 1;
      const imageResource = input.logo ? ` /XObject << /Im1 ${font2ObjectNumber + 1} 0 R >>` : '';
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${font1ObjectNumber} 0 R /F2 ${font2ObjectNumber} 0 R >>${imageResource} >> /Contents ${contentObjectNumber} 0 R >>`);
      objects.push(`<< /Length ${pageStream.length} >>\nstream\n${pageStream}\nendstream`);
    });

    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');

    if (input.logo) {
      objects.push(`<< /Type /XObject /Subtype /Image /Width ${input.logo.width} /Height ${input.logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${input.logo.bytes.length} >>\nstream\n${this.binaryToLatin1(input.logo.bytes)}\nendstream`);
    }

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];

    objects.forEach((object, index) => {
      offsets.push(pdf.length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';

    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${offsets[index].toString().padStart(10, '0')} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    return this.latin1ToBytes(pdf);
  }

  private drawText(text: string, x: number, y: number, size: number, color: string, font: 'F1' | 'F2' = 'F1') {
    const { r, g, b } = this.hexToRgb(color);
    return `BT /${font} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${y} Tm (${this.escapePdfText(text)}) Tj ET\n`;
  }

  private drawCenteredText(text: string, centerX: number, y: number, size: number, color: string, font: 'F1' | 'F2' = 'F1') {
    const estimatedWidth = text.length * size * 0.28;
    return this.drawText(text, centerX - estimatedWidth / 2, y, size, color, font);
  }

  private drawImage(name: string, x: number, y: number, width: number, height: number) {
    return `q ${width} 0 0 ${height} ${x} ${y} cm /${name} Do Q\n`;
  }

  private drawLine(x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
    const { r, g, b } = this.hexToRgb(color);
    return `${r} ${g} ${b} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S\n`;
  }

  private drawRect(x: number, y: number, width: number, height: number, fill: string, radius = 0, stroke?: string) {
    const fillRgb = this.hexToRgb(fill);
    const strokePart = stroke ? (() => {
      const strokeRgb = this.hexToRgb(stroke);
      return `${strokeRgb.r} ${strokeRgb.g} ${strokeRgb.b} RG `;
    })() : '';

    if (radius <= 0) {
      return `${fillRgb.r} ${fillRgb.g} ${fillRgb.b} rg ${strokePart}${x} ${y} ${width} ${height} re ${stroke ? 'B' : 'f'}\n`;
    }

    const r = Math.min(radius, width / 2, height / 2);
    const right = x + width;
    const top = y + height;
    const c = 0.5522847498 * r;

    return [
      `${fillRgb.r} ${fillRgb.g} ${fillRgb.b} rg ${strokePart}`,
      `${x + r} ${y} m`,
      `${right - r} ${y} l`,
      `${right - r + c} ${y} ${right} ${y + r - c} ${right} ${y + r} c`,
      `${right} ${top - r} l`,
      `${right} ${top - r + c} ${right - r + c} ${top} ${right - r} ${top} c`,
      `${x + r} ${top} l`,
      `${x + r - c} ${top} ${x} ${top - r + c} ${x} ${top - r} c`,
      `${x} ${y + r} l`,
      `${x} ${y + r - c} ${x + r - c} ${y} ${x + r} ${y} c`,
      `${stroke ? 'B' : 'f'}`
    ].join(' ') + '\n';
  }

  private wrapText(text: string, maxChars: number) {
    if (!text) {
      return [''];
    }

    if (text.length <= maxChars) {
      return [text];
    }

    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;

      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) {
          lines.push(current);
        }
        current = word;
      }
    }

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  private escapePdfText(text: string) {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  private binaryToLatin1(bytes: Uint8Array) {
    let result = '';
    for (const byte of bytes) {
      result += String.fromCharCode(byte);
    }
    return result;
  }

  private latin1ToBytes(value: string) {
    const bytes = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) {
      bytes[index] = value.charCodeAt(index) & 0xff;
    }
    return bytes;
  }

  private async loadLogoForPdf() {
    try {
      const response = await fetch('expenseflow-logo-creative.svg');
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const context = canvas.getContext('2d');

      if (!context) {
        return null;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(imageBitmap, 0, 0);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const base64 = dataUrl.split(',')[1] ?? '';
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      return {
        bytes,
        width: canvas.width,
        height: canvas.height
      };
    } catch {
      return null;
    }
  }

  private hexToRgb(hex: string) {
    const normalized = hex.replace('#', '');
    const safe = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    const value = Number.parseInt(safe, 16);

    return {
      r: ((value >> 16) & 255) / 255,
      g: ((value >> 8) & 255) / 255,
      b: (value & 255) / 255
    };
  }

  private matchesTimeRange(expenseDate: Date, timeRange: TimeRange) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    switch (timeRange) {
      case 'today':
        return expenseDate >= startOfToday && expenseDate < startOfTomorrow;
      case 'thisWeek': {
        const weekday = startOfToday.getDay();
        const diffToMonday = weekday === 0 ? 6 : weekday - 1;
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfToday.getDate() - diffToMonday);
        return expenseDate >= startOfWeek && expenseDate < startOfTomorrow;
      }
      case 'thisMonth': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return expenseDate >= startOfMonth && expenseDate < startOfTomorrow;
      }
      case 'lastMonth': {
        const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return expenseDate >= startOfLastMonth && expenseDate < startOfCurrentMonth;
      }
      case 'all':
      default:
        return true;
    }
  }
}
