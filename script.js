document.addEventListener('DOMContentLoaded', () => {
    // --- Modal Logic ---
    const modal = document.getElementById('info-modal');
    const openBtn = document.getElementById('open-modal-btn');
    const closeBtn = document.getElementById('close-modal-btn');
    const cancelBtn = document.getElementById('cancel-modal-btn');
    const backdrop = document.getElementById('modal-backdrop');
    const heroLearnMoreBtn = document.getElementById('hero-learn-more');

    // Mobile Menu Logic
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileOpenModalBtn = document.getElementById('mobile-open-modal-btn');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    if (mobileOpenModalBtn) {
        mobileOpenModalBtn.addEventListener('click', () => {
            toggleModal();
            // Close mobile menu on click
            mobileMenu.classList.add('hidden');
        });
    }

    function toggleModal() {
        modal.classList.toggle('hidden');
    }

    if (openBtn) openBtn.addEventListener('click', toggleModal);
    if (heroLearnMoreBtn) heroLearnMoreBtn.addEventListener('click', toggleModal);
    if (closeBtn) closeBtn.addEventListener('click', toggleModal);
    if (cancelBtn) cancelBtn.addEventListener('click', toggleModal);
    if (backdrop) backdrop.addEventListener('click', toggleModal);

    // --- PDF Logic ---
    const fileInput = document.getElementById('pdf-file');
    const processBtn = document.getElementById('process-btn');
    const messageArea = document.getElementById('message-area');
    const fileNameDisplay = document.getElementById('file-name');

    let selectedFile = null;

    // Actualizar nombre del archivo y habilitar botón
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            selectedFile = e.target.files[0];
            fileNameDisplay.textContent = selectedFile.name;
            processBtn.disabled = false;
            messageArea.innerHTML = '';
        } else {
            selectedFile = null;
            fileNameDisplay.textContent = 'Ningún archivo seleccionado';
            processBtn.disabled = true;
        }
    });

    processBtn.addEventListener('click', async () => {
        if (!selectedFile) return;

        try {
            updateStatus('Procesando PDF...', 'neutral');
            processBtn.disabled = true;

            await processPDF(selectedFile);

        } catch (error) {
            console.error(error);
            updateStatus('Error al procesar el PDF: ' + error.message, 'error');
            processBtn.disabled = false;
        }
    });

    function updateStatus(message, type) {
        messageArea.innerHTML = message;
        // Reset classes
        messageArea.className = 'message-area text-center text-sm space-y-2 mt-4';

        if (type === 'error') {
            messageArea.innerHTML = `<div class="text-red-500 font-medium bg-red-50 p-3 rounded-lg border border-red-100">${message}</div>`;
        }
        // Success case is now fully handled by the caller passing detailed HTML, so we just render it.
    }

    async function processPDF(file) {
        // 1. Cargar y Preparación
        const arrayBuffer = await file.arrayBuffer();
        const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer);

        // 2. Normalización de Páginas (Múltiplo de 4)
        const pageCount = srcDoc.getPageCount();
        const remainder = pageCount % 4;
        const pagesToAdd = remainder === 0 ? 0 : 4 - remainder;

        if (pagesToAdd > 0) {
            // Añadir páginas en blanco del mismo tamaño que la primera página
            const firstPage = srcDoc.getPages()[0];
            const { width, height } = firstPage.getSize();
            for (let i = 0; i < pagesToAdd; i++) {
                srcDoc.addPage([width, height]);
            }
        }

        const normalizedPageCount = srcDoc.getPageCount();

        // Crear documento nuevo
        const imposedDoc = await PDFLib.PDFDocument.create();

        // Asumimos que todas las páginas tienen el mismo tamaño que la primera
        const { width: originalWidth, height: originalHeight } = srcDoc.getPages()[0].getSize();

        // 3. Imposition
        let marginMM = parseFloat(document.getElementById('margin-mm').value) || 0;
        // Limit margin to max 10mm as requested
        if (marginMM > 10) marginMM = 10;
        if (marginMM < 0) marginMM = 0;

        const marginPoints = marginMM * 2.83465; // 1 mm = 2.83465 pt

        // El documento de salida tendrá el doble de ancho + margenes
        const outputWidth = (originalWidth * 2) + (marginPoints * 2);
        const outputHeight = originalHeight + (marginPoints * 2);

        // Copiar todas las páginas al nuevo documento para poder incrustarlas
        // (Nota: copyPages devuelve referencias a las páginas que podemos incrustar)
        // Pero para "incrustar" páginas de un doc a otro en pdf-lib usamos embedPage (si son diferentes docs)
        // o simplemente accedemos si es el mismo. Aquí son diferentes.
        // Como copiaremos en orden arbitrario, mejor copiamos todas primero o usamos indices.
        // La forma eficiente es `copyPages` pasando los indices que necesitamos.

        const totalSheets = normalizedPageCount / 4;

        for (let s = 0; s < totalSheets; s++) {
            // Índices para Cara A (Front)
            // hoja_1_cara_A = [P_n, P_1] (Indices base 0: n-1, 0)
            const frontLeftIdx = normalizedPageCount - 1 - (2 * s);
            const frontRightIdx = 0 + (2 * s);

            const shouldAddMarks = document.getElementById('add-crop-marks').checked;

            await addImposedPage(imposedDoc, srcDoc, frontLeftIdx, frontRightIdx, outputWidth, outputHeight, originalWidth, marginPoints, shouldAddMarks);

            // Índices para Cara B (Back)
            // hoja_1_cara_B = [P_2, P_{n-1}] (Indices base 0: 1, n-2)
            const backLeftIdx = 0 + (2 * s) + 1;
            const backRightIdx = normalizedPageCount - 1 - (2 * s) - 1;

            await addImposedPage(imposedDoc, srcDoc, backLeftIdx, backRightIdx, outputWidth, outputHeight, originalWidth, marginPoints, shouldAddMarks);
        }

        // 4. Exportación
        const pdfBytes = await imposedDoc.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `booklet_${file.name}`;
        downloadLink.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            Descargar Booklet PDF
        `;
        downloadLink.className = 'mt-4 inline-flex items-center justify-center w-full px-4 py-3 bg-emerald-500 text-white font-bold rounded-xl shadow-lg hover:bg-emerald-600 transition transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500';

        // Limpiar mensaje anterior y mostrar éxito
        updateStatus(`
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-3">
                <p class="text-emerald-700 font-medium">¡Proceso completado con éxito!</p>
                <p class="text-emerald-600 text-sm">${normalizedPageCount} páginas procesadas en ${totalSheets} hojas.</p>
            </div>
        `, 'success');

        messageArea.appendChild(downloadLink);

        processBtn.disabled = false;
    }

    async function addImposedPage(targetDoc, sourceDoc, leftIdx, rightIdx, pdfWidth, pdfHeight, pageW, marginPt, addMarks = false) {
        const page = targetDoc.addPage([pdfWidth, pdfHeight]);

        // Copiar las dos páginas específicas
        const [leftPage] = await targetDoc.embedPages([sourceDoc.getPages()[leftIdx]]);
        const [rightPage] = await targetDoc.embedPages([sourceDoc.getPages()[rightIdx]]);

        // Calcular posiciones con margen
        // El margen se añade a todos los lados del pliego final?
        // Normalmente el bleed es alrededor de CADA página si fuera corte individual,
        // pero en booklet (saddle stitch) el bleed importante es EXTERIOR.
        // Aquí simplificaremos poniendo el pliego centrado en la hoja grande.
        // X: marginPt (izquierda) -> P1 -> P2 -> marginPt (derecha)
        // Y: marginPt (abajo) -> P -> marginPt (arriba)

        const contentHeight = pdfHeight - (marginPt * 2);
        // Nota: pdfHeight ya incluye el margen * 2 según mi calculo anterior

        // Dibujar página izquierda
        page.drawPage(leftPage, {
            x: marginPt,
            y: marginPt,
            width: pageW,
            height: contentHeight
        });

        // Dibujar página derecha
        page.drawPage(rightPage, {
            x: marginPt + pageW,
            y: marginPt,
            width: pageW,
            height: contentHeight
        });

        if (addMarks) {
            drawCropMarks(page, pdfWidth, pdfHeight, pageW, marginPt); // pageW es el ancho de una sola pagina original
        }
    }

    function drawCropMarks(page, totalWidth, totalHeight, singlePageWidth, margin) {
        const markLength = 10;
        const color = PDFLib.rgb(0, 0, 0);
        const thickness = 0.5;

        // Coordenadas del "Trim Box" (el contenido real)
        const trimLeft = margin;
        const trimBottom = margin;
        const trimTop = totalHeight - margin;
        const trimRight = totalWidth - margin;
        const centerX = margin + singlePageWidth; // Centro exacto entre las dos paginas

        // --- Marcas de Doblez (Centro) ---
        // Arriba Centro
        page.drawLine({
            start: { x: centerX, y: totalHeight }, // Desde borde hoja
            end: { x: centerX, y: trimTop }, // Hasta borde contenido
            thickness,
            color,
        });
        // Abajo Centro
        page.drawLine({
            start: { x: centerX, y: 0 },
            end: { x: centerX, y: trimBottom },
            thickness,
            color,
        });

        // --- Marcas de Corte (Esquinas del Trim Box) ---

        // Función helper para dibujar "corner marks"
        // Horizontal line
        const drawH = (x, y, len) => page.drawLine({ start: { x: x, y: y }, end: { x: x + len, y: y }, thickness, color });
        // Vertical line
        const drawV = (x, y, len) => page.drawLine({ start: { x: x, y: y }, end: { x: x, y: y + len }, thickness, color });

        // TL (Top Left)
        drawV(trimLeft, totalHeight, -markLength); // Desde arriba hacia abajo hasta el trim
        drawH(0, trimTop, markLength);             // Desde izq hacia derecha hasta el trim (o cerca)
        // Ajuste: normalmente las marcas estan FUERA del trim box.
        // Si margin=0, no se verían o taparían contenido.
        // Si hay margin, dibujamos en el margen.

        // Re-definamos para que queden bonitas en el margen:
        // Linea vertical alineada con trimLeft, desde (totalHeight) hasta (trimTop + offset?) o (totalHeight - markLength)
        // Optaré por standard crop marks style: lines separated from the corner slightly.

        const offset = 2; // separation from corner

        // Top Left Corner
        page.drawLine({ start: { x: trimLeft, y: totalHeight }, end: { x: trimLeft, y: trimTop + offset }, thickness, color }); // V
        page.drawLine({ start: { x: 0, y: trimTop }, end: { x: trimLeft - offset, y: trimTop }, thickness, color }); // H

        // Top Right Corner
        page.drawLine({ start: { x: trimRight, y: totalHeight }, end: { x: trimRight, y: trimTop + offset }, thickness, color }); // V
        page.drawLine({ start: { x: totalWidth, y: trimTop }, end: { x: trimRight + offset, y: trimTop }, thickness, color }); // H

        // Bottom Left Corner
        page.drawLine({ start: { x: trimLeft, y: 0 }, end: { x: trimLeft, y: trimBottom - offset }, thickness, color }); // V
        page.drawLine({ start: { x: 0, y: trimBottom }, end: { x: trimLeft - offset, y: trimBottom }, thickness, color }); // H

        // Bottom Right Corner
        page.drawLine({ start: { x: trimRight, y: 0 }, end: { x: trimRight, y: trimBottom - offset }, thickness, color }); // V
        page.drawLine({ start: { x: totalWidth, y: trimBottom }, end: { x: trimRight + offset, y: trimBottom }, thickness, color }); // H
    }
});
