const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");
const { tmpdir } = require("os");

const app = express();
const PORT = 8001;

app.use(express.json({ limit: '50mb' })); // Increase limit for large PDF files

// Function to decode Base64 to a Buffer
const base64ToBuffer = (base64String) => Buffer.from(base64String, 'base64');

// Function to encode Buffer to Base64
const pdfToBase64 = (pdfBuffer) => Buffer.from(pdfBuffer).toString('base64');

// Function to convert PDF to high-quality images using pdftoppm
const pdfToImages = async (pdfBuffer) => {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'pdf_to_images_'));
    const tempPdfPath = path.join(tempDir, 'temp.pdf');

    await fs.writeFile(tempPdfPath, pdfBuffer);

    return new Promise((resolve, reject) => {
        const outputFilePattern = path.join(tempDir, 'page');

        // Increase DPI to 300 for higher quality images
        exec(`pdftoppm -png -rx 300 -ry 300 "${tempPdfPath}" "${outputFilePattern}"`, async (error, stdout, stderr) => {
            if (error) {
                return reject(`Error executing pdftoppm: ${stderr}`);
            }

            try {
                let imageFiles = await fs.readdir(tempDir);

                // Sort images numerically to maintain page order
                imageFiles = imageFiles
                    .filter(file => file.endsWith('.png'))
                    .sort((a, b) => {
                        const numA = parseInt(a.match(/\d+/)[0], 10);
                        const numB = parseInt(b.match(/\d+/)[0], 10);
                        return numA - numB;
                    })
                    .map(file => path.join(tempDir, file));

                resolve(imageFiles);
            } catch (err) {
                reject(`Error reading image files: ${err}`);
            }
        });
    });
};

// Function to merge high-quality images into a PDF
const imagesToPdf = async (images) => {
    const pdfDoc = await PDFDocument.create();
    const a4Width = 595, a4Height = 842; // A4 dimensions

    for (const image of images) {
        // Process image with sharp() to maintain quality
        const imageBuffer = await sharp(image)
            .resize({ width: a4Width, fit: 'inside' }) // Keep width same, fit inside page
            .png({ quality: 90 }) // Higher quality PNG
            .toBuffer();

        const img = await pdfDoc.embedPng(imageBuffer);

        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([a4Width, a4Height]);

        // Center image on page
        const x = (a4Width - width) / 2;
        const y = (a4Height - height) / 2;
        page.drawImage(img, { x, y, width, height });
    }

    return await pdfDoc.save();
};

app.get('/', (req, res) => {
    res.send('Hello World');
});

// API Endpoint: Convert PDF to high-quality images and back to PDF in Base64 format
app.post('/api/convertPdf', async (req, res) => {
    try {
        const { base64Pdf } = req.body;
        if (!base64Pdf) return res.status(400).json({ error: "Base64 PDF data is required" });

        console.time('⏳ Total Processing Time');

        console.time('⏳ Decoding Base64 input');
        const pdfBuffer = base64ToBuffer(base64Pdf);
        console.timeEnd('⏳ Decoding Base64 input');

        console.time('⏳ Converting PDF to high-quality images');
        const images = await pdfToImages(pdfBuffer);
        console.timeEnd('⏳ Converting PDF to high-quality images');

        console.time('⏳ Merging high-quality images into a new PDF');
        const mergedPdf = await imagesToPdf(images);
        console.timeEnd('⏳ Merging high-quality images into a new PDF');

        console.time('⏳ Converting final PDF to Base64');
        const base64Output = pdfToBase64(mergedPdf);
        console.timeEnd('⏳ Converting final PDF to Base64');

        console.timeEnd('⏳ Total Processing Time');

        return res.status(200).json({
            success: true,
            message: "Document converted successfully",
            data: base64Output,
        });
    } catch (error) {
        console.error('❌ Error:', error);
        return res.status(500).json({ error: "Internal Server Error", details: error.toString() });
    }
});

// Start Express Server
app.listen(PORT, () => {
    console.log(`🚀 Server is running on ${PORT}`);
});