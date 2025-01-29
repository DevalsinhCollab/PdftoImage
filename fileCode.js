const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const sharp = require('sharp')
const { PDFDocument } = require('pdf-lib')
const { fileURLToPath } = require('url')
const { dirname } = require('path')

// Get the current directory using import.meta.url
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Function to convert PDF to images using pdftoppm
async function pdfToImages(pdfPath) {
  const outputDir = path.join(__dirname, 'output_images');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const outputFilePattern = path.join(outputDir, 'page-%d.png');

  return new Promise((resolve, reject) => {
    // Using pdftoppm to convert PDF to PNG images
    exec(`pdftoppm "${pdfPath}" "${outputFilePattern}" -png`, (error, stdout, stderr) => {
      if (error) {
        reject(`Error executing pdftoppm: ${stderr}`);
      } else {
        // List the generated image files
        const imageFiles = fs.readdirSync(outputDir).filter(file => file.endsWith('.png'));
        resolve(imageFiles.map(file => path.join(outputDir, file)));
      }
    });
  });
}

// Function to merge images and convert back to PDF
async function imagesToPdf(images) {
  const pdfDoc = await PDFDocument.create();

  // A4 size in points: 595 x 842
  const a4Width = 595;
  const a4Height = 842;
  
  for (const image of images) {
    const imageBuffer = await sharp(image).toBuffer();
    const img = await pdfDoc.embedPng(imageBuffer); // use embedPng for PNG images

    // Set A4 size for each page
    const page = pdfDoc.addPage([a4Width, a4Height]);
    page.drawImage(img, { x: 0, y: 0, width: a4Width, height: a4Height });
  }

  const pdfBytes = await pdfDoc.save();
  return pdfBytes;
}

// Main function to process the PDF
async function processPdf(pdfPath) {
  try {
    const images = await pdfToImages(pdfPath);
    console.log('PDF converted to images');

    // Merge images into a new PDF
    const mergedPdf = await imagesToPdf(images);
    const outputPdfPath = path.join(__dirname, 'output', 'merged_output.pdf');

    // Save the merged PDF
    fs.writeFileSync(outputPdfPath, mergedPdf);
    console.log('Merged PDF saved to:', outputPdfPath);
  } catch (error) {
    console.error('Error processing PDF:', error);
  }
}

// Call the main function
const inputPdfPath = path.join(__dirname, 'Kota_Agreement_Draft.pdf');
processPdf(inputPdfPath);