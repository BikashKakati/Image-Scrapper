// https://www.amazon.in/HABER-Chevron-Cloev-Collection-Multi-use-Absorbent/dp/${asin}?th=1

const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  const inputFile = req.file.path;
  const workbook = new ExcelJS.Workbook();
  const outputFile = 'output.xlsx';

  try {
    await workbook.xlsx.readFile(inputFile);
    const worksheet = workbook.getWorksheet(1);
    const asinList = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber !== 1) {
        const asinCell = row.getCell(1);
        const asin = asinCell.value;
        asinList.push(asin);
      }
    });

    for (let i = 0; i < asinList.length; i++) {
      const asin = asinList[i];
      const productUrl = `https://www.amazon.in/HABER-Chevron-Cloev-Collection-Multi-use-Absorbent/dp/${asin}?th=1`;

      try {
        const response = await axios.get(productUrl);
        const $ = cheerio.load(response.data);
        const imageLink = $('#imgTagWrapperId img').attr('src');

        if (imageLink) {
          const cellAddress = `B${i + 2}`;
          const cell = worksheet.getCell(cellAddress);
          cell.value = imageLink;
        } else {
          console.warn(`Failed to find image link for ASIN ${asin}`);
        }
      } catch (error) {
        console.error(`Failed to fetch product details for ASIN ${asin}: ${error.message}`);
      }
    }

    await workbook.xlsx.writeFile(outputFile);

    res.setHeader('Content-Disposition', 'attachment; filename="output.xlsx"');
    res.sendFile(outputFile, { root: __dirname });
  } catch (error) {
    console.error(`Failed to process the uploaded file: ${error.message}`);
    res.status(500).send('Error processing the uploaded file');
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

