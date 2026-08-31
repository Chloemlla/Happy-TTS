export const exportToPdf = async (previewEl: HTMLElement) => {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ]);

  // G12-07：预览容器是固定高度的滚动容器，直接截图只会截到首屏。
  // 克隆到离屏容器并解除高度/滚动限制，再对克隆体截图，保证长文全部进入 PDF。
  const clone = previewEl.cloneNode(true) as HTMLElement;
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  clone.style.maxHeight = 'none';
  clone.style.width = '794px';

  const offscreen = document.createElement('div');
  offscreen.style.position = 'absolute';
  offscreen.style.left = '-10000px';
  offscreen.style.top = '0';
  offscreen.style.width = '794px';
  offscreen.style.height = 'auto';
  offscreen.style.overflow = 'visible';
  offscreen.appendChild(clone);
  document.body.appendChild(offscreen);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');

    const imgWidth = 210; // A4 width in mm
    const pageHeight = 295; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // G12-07：用 > 0 而不是 >= 0，避免 imgHeight 恰为 pageHeight 整数倍时多插一张空白页
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`markdown-export-${Date.now()}.pdf`);
  } finally {
    document.body.removeChild(offscreen);
  }
};
