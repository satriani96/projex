/**
 * Works order HTML/PDF export. PDF download avoids Android WebView print bugs;
 * browser print remains available for desktops.
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

const WORKS_ORDER_STYLES = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #111; }
  .page { width: 100%; }
  h1, h2 { margin: 0 0 10px 0; padding: 0; }
  .header { display: flex; align-items: center; gap: 15px; border-bottom: 2px solid black; padding-bottom: 8px; margin-bottom: 20px; }
  .header img { height: 32px; width: auto; }
  .header h1 { font-size: 22pt; margin: 0; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .section { border: 1px solid #ccc; padding: 15px; border-radius: 8px; margin-bottom: 20px; page-break-inside: avoid; }
  .section h2 { font-size: 14pt; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
  .details p { margin: 0 0 8px 0; font-size: 11pt; }
  .details strong { display: inline-block; width: 110px; color: #555; }
  .full-width { grid-column: 1 / -1; }
  .description { white-space: pre-wrap; font-size: 11pt; }
`;

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
    <div class="page">
      <div class="header">
        <img src="${logoSrc}" alt="Projex Logo" />
        <h1>Works Order: Job #${e(data.job_number)}</h1>
      </div>
      <div class="grid">
        <div class="section">
          <h2>Customer Details</h2>
          <div class="details">
            <p><strong>Customer:</strong> ${fieldOrNA(data.customer_name, e)}</p>
            <p><strong>Company:</strong> ${fieldOrNA(data.company, e)}</p>
            <p><strong>Phone:</strong> ${fieldOrNA(data.phone_number, e)}</p>
            <p><strong>Email:</strong> ${fieldOrNA(data.email, e)}</p>
            <p><strong>Address:</strong> ${fieldOrNA(data.address, e)}</p>
          </div>
        </div>
        <div class="section">
          <h2>Job Details</h2>
          <div class="details">
            <p><strong>Due Date:</strong> ${data.due_date ? e(data.due_date) : e('N/A')}</p>
            <p><strong>Material:</strong> ${fieldOrNA(data.material, e)}</p>
            <p><strong>Status:</strong> ${statusLabel}</p>
          </div>
        </div>
        <div class="section full-width">
          <h2>Job Description</h2>
          <p class="description">${desc}</p>
        </div>
        ${sketchImageHtml}
      </div>
    </div>
  `;
}

export async function downloadWorksOrderPdf(innerHtml: string, jobNumber: string): Promise<void> {
  const html2pdf = (await import('html2pdf.js')).default;

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-12000px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.background = '#fff';
  container.innerHTML = `<style>${WORKS_ORDER_STYLES}</style>${innerHtml}`;

  document.body.appendChild(container);

  const safeName = jobNumber.replace(/[^\w.-]+/g, '_');
  const filename = `Works-Order-Job-${safeName}.pdf`;

  try {
    await html2pdf()
      .set({
        margin: 8,
        filename,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}

export function openWorksOrderBrowserPrint(innerHtml: string, jobNumber: string): void {
  const title = `Works Order - Job #${escapeHtml(jobNumber)}`;
  const printContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>${WORKS_ORDER_STYLES}
      @page { size: A4; margin: 20mm; }
    </style>
  </head>
  <body>
    ${innerHtml}
    <script>
      window.onload = function() {
        window.print();
        window.onafterprint = function() { window.close(); };
      };
    </script>
  </body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
  }
}
