const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const sharp = require('sharp')
const { PDFDocument } = require('pdf-lib')
const { base64PdfInput } = require('./utils.js')

// Function to decode Base64 to a Buffer
function base64ToBuffer(base64String) {
    return Buffer.from(base64String, 'base64');
}

// Function to encode Buffer to Base64
function pdfToBase64(pdfBuffer) {
    return Buffer.from(pdfBuffer).toString('base64');
}

// Function to save Base64 output to `output.js`
function saveBase64ToFile(base64Data) {
    const outputFilePath = path.join(process.cwd(), 'output.js'); // Use correct path
    const outputContent = `const base64PdfOutput = '${base64Data}';\nexport { base64PdfOutput };`;

    fs.writeFileSync(outputFilePath, outputContent, 'utf8');
    console.log('✅ Base64 output saved to output.js');
}

// Function to convert PDF to images using pdftoppm
async function pdfToImages(pdfBuffer) {
    const outputDir = path.join(process.cwd(), 'output_images');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });  // Ensure directory exists
    }

    const tempPdfPath = path.join(outputDir, 'temp.pdf');
    fs.writeFileSync(tempPdfPath, pdfBuffer);

    return new Promise((resolve, reject) => {
        const outputFilePattern = path.join(outputDir, 'page');

        // Convert PDF to images using pdftoppm
        exec(`pdftoppm "${tempPdfPath}" "${outputFilePattern}" -png`, (error, stdout, stderr) => {
            if (error) {
                return reject(`Error executing pdftoppm: ${stderr}`);
            }

            const imageFiles = fs.readdirSync(outputDir)
                .filter(file => file.endsWith('.png'))
                .map(file => path.join(outputDir, file));

            resolve(imageFiles);
        });
    });
}

// Function to merge images and convert back to PDF
async function imagesToPdf(images) {
    const pdfDoc = await PDFDocument.create();
    const a4Width = 595, a4Height = 842; // A4 dimensions

    for (const image of images) {
        const imageBuffer = await sharp(image).toBuffer();
        const img = await pdfDoc.embedPng(imageBuffer);

        const page = pdfDoc.addPage([a4Width, a4Height]);
        page.drawImage(img, { x: 0, y: 0, width: a4Width, height: a4Height });
    }

    return await pdfDoc.save();
}

// Main function to process the PDF
async function processPdf(base64Pdf) {
    try {
        console.log('⏳ Decoding Base64 input...');
        const pdfBuffer = base64ToBuffer(base64Pdf);

        console.log('⏳ Converting PDF to images...');
        const images = await pdfToImages(pdfBuffer);

        console.log('⏳ Merging images into a new PDF...');
        const mergedPdf = await imagesToPdf(images);

        console.log('⏳ Converting final PDF to Base64...');
        const base64Output = pdfToBase64(mergedPdf);

        console.log(base64Output, "base64Output===========")

        saveBase64ToFile(base64Output);

        console.log('🎉 Process completed successfully!');
    } catch (error) {
        console.error('❌ Error processing PDF:', error);
    }
}

processPdf(base64PdfInput);