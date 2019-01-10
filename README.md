# ozon-parser
###### Books information from popular bookstore ozon

Retrive books information such as book title, author, description, price, rank, small main cover and all other in array

Easy use:

```
const InfoLoader = require("./scrape");
```

```
InfoLoader.setNumberLoadBooks(50);
```
Set number of books you wand to load in every category

```
InfoLoader.setVisible(false);
```
Set crape process visible or not - launch a full version of Chromium or headless mode (more speed ~2X in hide mode)

```
const contentDB = await InfoLoader.getDBContent();
```

scrap data


