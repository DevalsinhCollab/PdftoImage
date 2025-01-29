import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { tmpdir } from 'os';

const app = express();
const PORT = 8001;

app.use(express.json({ limit: '50mb' })); // Increase limit for large PDF files

// Function to decode Base64 to a Buffer
const base64ToBuffer = (base64String) => Buffer.from(base64String, 'base64');

// Function to encode Buffer to Base64
const pdfToBase64 = (pdfBuffer) => Buffer.from(pdfBuffer).toString('base64');

// Function to save Base64 output to `output.js`
const saveBase64ToFile = async (base64Data) => {
    const outputFilePath = path.join(process.cwd(), 'output.js');
    const outputContent = `const base64PdfOutput = '${base64Data}';\nexport { base64PdfOutput };`;

    await fs.writeFile(outputFilePath, outputContent, 'utf8');
    console.log('✅ Base64 output saved to output.js');
}

// Function to convert PDF to images using pdftoppm
const pdfToImages = async (pdfBuffer) => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf_to_images_'));
    const tempPdfPath = path.join(tempDir, 'temp.pdf');

    await fs.writeFile(tempPdfPath, pdfBuffer);

    return new Promise((resolve, reject) => {
        const outputFilePattern = path.join(tempDir, 'page');

        exec(`pdftoppm "${tempPdfPath}" "${outputFilePattern}" -png`, async (error, stdout, stderr) => {
            if (error) {
                return reject(`Error executing pdftoppm: ${stderr}`);
            }

            try {
                const imageFiles = (await fs.readdir(tempDir))
                    .filter(file => file.endsWith('.png'))
                    .map(file => path.join(tempDir, file));

                resolve(imageFiles);
            } catch (err) {
                reject(`Error reading image files: ${err}`);
            }
        });
    });
}

// Function to merge images and convert back to PDF
const imagesToPdf = async (images) => {
    const pdfDoc = await PDFDocument.create();
    const a4Width = 595, a4Height = 842; // A4 dimensions

    await Promise.all(images.map(async (image) => {
        const imageBuffer = await sharp(image).toBuffer();
        const img = await pdfDoc.embedPng(imageBuffer);
        const page = pdfDoc.addPage([a4Width, a4Height]);
        page.drawImage(img, { x: 0, y: 0, width: a4Width, height: a4Height });
    }));

    return await pdfDoc.save();
}

app.get('/', (req, res) => {
    res.send('Hello World');
});

// API Endpoint: Convert PDF to images and back to PDF in Base64 format
app.post('/api/convertPdf', async (req, res) => {
    try {
        const { base64Pdf } = req.body;
        if (!base64Pdf) return res.status(400).json({ error: "Base64 PDF data is required" });

        console.time('⏳ Total Processing Time');

        console.time('⏳ Decoding Base64 input');
        const pdfBuffer = base64ToBuffer(base64Pdf);
        console.timeEnd('⏳ Decoding Base64 input');

        console.time('⏳ Converting PDF to images');
        const images = await pdfToImages(pdfBuffer);
        console.timeEnd('⏳ Converting PDF to images');

        console.time('⏳ Merging images into a new PDF');
        const mergedPdf = await imagesToPdf(images);
        console.timeEnd('⏳ Merging images into a new PDF');

        console.time('⏳ Converting final PDF to Base64');
        const base64Output = pdfToBase64(mergedPdf);
        console.timeEnd('⏳ Converting final PDF to Base64');

        // Save the output to a file
        // await saveBase64ToFile(base64Output);

        console.timeEnd('⏳ Total Processing Time');

        return res.json({ data: base64Output });
    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: "Internal Server Error", details: error.toString() });
    }
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on ${PORT}`);
});