const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const axios = require('axios');
const cheerio = require('cheerio');
const { promisify } = require('util');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.static('public'));

// Define a function to scrape image links, category hierarchy, and product names for a single ASIN
const scrapeProductInfo = async (asin) => {
  try {
    const productUrl = `https://www.amazon.in/dp/${asin}`;
    const response = await axios.get(productUrl);
    const $ = cheerio.load(response.data);
    
    // Scrape image link
    const imageLink = $('#imgTagWrapperId img').attr('src');

    // Scrape category hierarchy
    const categoryHierarchy = [];
    $('ul.a-unordered-list li span.a-list-item a.a-link-normal').each((index, element) => {
      const category = $(element).text().trim();
      categoryHierarchy.push(category);
    });

    // Scrape product name
    const productName = $('#title span#productTitle').text().trim();

    return {
      asin,
      imageLink,
      categoryHierarchy: categoryHierarchy.join(' > ').replace(" > Flash Player",""),
      productName,
    };
  } catch (error) {
    console.error(`Failed to fetch product details for ASIN ${asin}: ${error.message}`);
    return null;
  }
};

// Define a function to scrape image links, category hierarchy, and product names for a list of ASINs
const scrapeProductInfoList = async (asinList) => {
  const productInfoList = [];

  // Implement parallel scraping using Promise.all or other async libraries.
  // Use a proxy pool if necessary to distribute requests.
  const scrapeTasks = asinList.map(async (asin) => {
    const productInfo = await scrapeProductInfo(asin);
    if (productInfo) {
      productInfoList.push(productInfo);
    }
  });

  await Promise.all(scrapeTasks);
  return productInfoList;
};

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
    const asinToRowMap = {};

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber !== 1) {
        const asinCell = row.getCell(1);
        const asin = asinCell.value;
        asinList.push(asin);
        asinToRowMap[asin] = rowNumber;
      }
    });

    const productInfoList = await scrapeProductInfoList(asinList);

    productInfoList.forEach((productInfo) => {
      const rowNumber = asinToRowMap[productInfo.asin];
      if (rowNumber) {
        const cellAddressImage = `B${rowNumber}`;
        const cellImage = worksheet.getCell(cellAddressImage);
        cellImage.value = productInfo.imageLink;

        const cellAddressName = `C${rowNumber}`;
        const cellName = worksheet.getCell(cellAddressName);
        cellName.value = productInfo.productName;

        const cellAddressCategory = `D${rowNumber}`;
        const cellCategory = worksheet.getCell(cellAddressCategory);
        cellCategory.value = productInfo.categoryHierarchy;

      }
    });

    const writeFileAsync = promisify(fs.writeFile);
    await writeFileAsync(outputFile, await workbook.xlsx.writeBuffer());

    res.setHeader('Content-Disposition', 'attachment; filename="output.xlsx"');
    res.sendFile(outputFile, { root: __dirname });
    
    // unlink the user file after completing data scraping
    fs.unlinkSync(inputFile);
  } catch (error) {
    console.error(`Failed to process the uploaded file: ${error.message}`);
    res.status(500).send('Error processing the uploaded file');
  }
});

const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

