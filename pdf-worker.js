// pdf-worker.js — Worker thread for parallel PDF generation
// Offloads CPU-intensive puppeteer operations to separate threads

import { parentPort, workerData } from 'worker_threads';

async function generatePDF() {
  const { htmlContent, outputPath } = workerData;
  
  try {
    // Dynamic import — puppeteer is optional
    let puppeteer;
    try {
      puppeteer = (await import("puppeteer")).default;
    } catch (err) {
      parentPort.postMessage({ 
        success: false, 
        error: 'puppeteer not installed',
        path: outputPath 
      });
      return;
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: "networkidle0" });
      await page.pdf({
        path: outputPath,
        format: "A4",
        printBackground: true,
        margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      });
      
      parentPort.postMessage({ 
        success: true, 
        path: outputPath 
      });
    } finally {
      await browser.close();
    }
  } catch (error) {
    parentPort.postMessage({ 
      success: false, 
      error: error.message,
      path: outputPath 
    });
  }
}

generatePDF();

// Made with Bob
