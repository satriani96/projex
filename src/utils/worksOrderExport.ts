/**
 * Works order → PDF for printing. Android browser print is unreliable; a generated
 * PDF opens in the system viewer where print/save works consistently.
 */

export interface WorksOrderExportData {
  job_number: string;
  customer_name: string;
  company: string;
  phone_number: string;
  email: string;
  address: string;
  due_date: string | null;
  material: string;
  status: string;
  job_description: string;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Prefixed classes so Tailwind/global CSS (.grid, .header, etc.) cannot override export layout. */
const WORKS_ORDER_STYLES = `
  .wo-root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; width: 100%; color: #111; }
  .wo-root h1, .wo-root h2 { margin: 0 0 10px 0; padding: 0; }
  .wo-top { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 20px; }
  .wo-top img { height: 32px; width: auto; }
  .wo-top h1 { font-size: 22pt; margin: 0; }
  .wo-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .wo-block { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
  .wo-block h2 { font-size: 14pt; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  .wo-details p { margin: 0 0 8px 0; font-size: 11pt; }
  .wo-details strong { display: inline-block; width: 110px; color: #555; }
  .wo-span-cols { grid-column: 1 / -1; }
  .wo-desc { white-space: pre-wrap; font-size: 11pt; }
`;

function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            })
    )
  ).then(() => undefined);
}

function fieldOrNA(value: string | null | undefined, escape: (s: string) => string): string {
  const t = value?.trim();
  return escape(t && t.length > 0 ? t : 'N/A');
}

/**
 * Inner markup (no outer html/body). Same structure is used for PDF capture and browser print.
 */
export function buildWorksOrderInnerHtml(
  data: WorksOrderExportData,
  sketchImageHtml: string,
  logoSrc: string
): string {
  const e = escapeHtml;
  const desc = data.job_description?.trim()
    ? e(data.job_description)
    : e('No description provided.');
  const statusLabel = e((data.status || '').replace(/_/g, ' '));

  return `
    <div class="wo-root">
      <div class="wo-top">
        <img src="${logoSrc}" alt="Projex Logo" />
        <h1>Works Order: Job #${e(data.job_number)}</h1>
      </div>
      <div class="wo-cols">
        <div class="wo-block">
          <h2>Customer Details</h2>
          <div class="wo-details">
            <p><strong>Customer:</strong> ${fieldOrNA(data.customer_name, e)}</p>
            <p><strong>Company:</strong> ${fieldOrNA(data.company, e)}</p>
            <p><strong>Phone:</strong> ${fieldOrNA(data.phone_number, e)}</p>
            <p><strong>Email:</strong> ${fieldOrNA(data.email, e)}</p>
            <p><strong>Address:</strong> ${fieldOrNA(data.address, e)}</p>
          </div>
        </div>
        <div class="wo-block">
          <h2>Job Details</h2>
          <div class="wo-details">
            <p><strong>Due Date:</strong> ${data.due_date ? e(data.due_date) : e('N/A')}</p>
            <p><strong>Material:</strong> ${fieldOrNA(data.material, e)}</p>
            <p><strong>Status:</strong> ${statusLabel}</p>
          </div>
        </div>
        <div class="wo-block wo-span-cols">
          <h2>Job Description</h2>
          <p class="wo-desc">${desc}</p>
        </div>
        ${sketchImageHtml}
      </div>
    </div>
  `;
}

/** PDF bytes for opening in a new tab or triggering download. */
export async function createWorksOrderPdfBlob(innerHtml: string, jobNumber: string): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;

  // html2canvas often returns a blank image for nodes far off-screen or not yet painted.
  const backdrop = document.createElement('div');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:2147483646',
    'box-sizing:border-box',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'padding-top:max(16px, env(safe-area-inset-top))',
    'padding-bottom:max(16px, env(safe-area-inset-bottom))',
    'padding-left:max(16px, env(safe-area-inset-left))',
    'padding-right:max(16px, env(safe-area-inset-right))',
    'overflow:auto',
    'touch-action:pan-y',
    'background:rgba(255,255,255,0.96)',
  ].join(';');

  const status = document.createElement('p');
  status.textContent = 'Preparing works order for print…';
  status.style.cssText = 'margin:0 0 12px;font:14px system-ui,sans-serif;color:#374151';

  const sheet = document.createElement('div');
  sheet.style.cssText = [
    'width:794px',
    'max-width:100%',
    'box-sizing:border-box',
    'background:#fff',
    'color:#111',
    'padding:24px',
    'box-shadow:0 4px 24px rgba(0,0,0,0.12)',
  ].join(';');
  sheet.innerHTML = innerHtml;

  const styleEl = document.createElement('style');
  styleEl.setAttribute('data-works-order-export', '');
  styleEl.textContent = WORKS_ORDER_STYLES;
  document.head.appendChild(styleEl);

  backdrop.appendChild(status);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);

  const safeName = jobNumber.replace(/[^\w.-]+/g, '_');
  const filename = `Works-Order-Job-${safeName}.pdf`;

  try {
    await waitForImages(sheet);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const out = await html2pdf()
      .set({
        margin: 10,
        filename,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(sheet)
      .outputPdf('blob');

    if (!(out instanceof Blob)) {
      throw new Error('PDF export did not return a blob');
    }
    return out;
  } finally {
    styleEl.remove();
    document.body.removeChild(backdrop);
  }
}
