const puppeteer = require("puppeteer");
const fs = require("fs");

class BookInfoLoader {
  constructor(numberLoadedBooksInCategory = 5) {

    this._bookPage = "https://www.ozon.ru/context/detail/id/";
    this._bookSelector = "div.tile[data-v-13c5b513]";

    this._bookAuthor = "p.author-wrapper[data-v-837fc770] > span ";
    this._bookTitle = "a.name-link[data-v-837fc770]";
    this._bookCover = ".cover[data-v-cc97ef84] > img.img[data-v-0e6d3626]";
    this._bookRank = "div.stars[data-v-6cd1bede]  > div.fill[data-v-6cd1bede]";
    this._bookPrice = "span.price-number[data-v-4c2afb42] > span.main[data-v-4c2afb42]"; 

    this._bookMicroGallery = "div.eMicroGallery_previews  > div.eMicroGallery_previewsOne";
    this._bookFullImageOne = "div.eMicroGallery_fullView > img.eMicroGallery_fullImage";
    this._bookFullImage = "div.eMicroGallery_fullView.mActive > img.eMicroGallery_fullImage";
    this._bookMoreInfoText = "div.eItemDescription_text";

    this._overlaySubscription = "div.overlay-subscription";

    this._waitPageDownSelectorStart = "div.five-dots[data-v-88c73e72].m-page-preloader";
    this._waitPageDownSelectorEnd = "div:not(.m-page-preloader).five-dots[data-v-88c73e72]";

    this._numberLoadedBooksInCategory = numberLoadedBooksInCategory;
    this._database = null;
    this._fileName = "loaded_db.json";
    this._visible = false;
  }

  /**
   * Set number of books you wand to load in every category
   * @param {*} number : number
   */
  setNumberLoadBooks(number) {
    this._numberLoadedBooksInCategory = +number;     
  }

  /**
   * Set crape process visible or not 
   * launch a full version of Chromium or headless mode (more speed ~2X)
   * @param {*} visible : boolean
   */
  setVisible(visible) {
    this._visible = visible;     
  }

  async _readFile() {
    return new Promise( (resolve, reject) => {
      fs.readFile(this._fileName, "utf8", (error, data) => {
        if(error) {
          return reject(error); 
        }
        let result;
        try {
          result = JSON.parse(data);
        }
        catch(err) {
          return reject(err); 
        }
        resolve(result);
      });
    });
  }

  async _writeFile(data) {
    return new Promise( (resolve, reject) => {
      const dbString = JSON.stringify(data, [
        "title",
        "author",
        "covers",
        "id",
        "price",
        "rank",
        "text",
        "coverSmall"
      ]);

      fs.writeFile(this._fileName, dbString, "utf8", (error) => {
        if(error) {
          return reject(error); 
        }
        resolve(true);
      });
    });
  }

  /**
   * Main entry point - return array of books 
   * run scrap process or return save file if no changed in params
   * @param {*} forseLoad : boolean - forsce scrap (no file check)
   */
  async getDBContent(forseLoad = false) {
    if(!this._database || forseLoad || this._database[0].length != this._numberLoadedBooksInCategory) {
      let db;
      try {
        db = await this._readFile();
      }
      catch(error) {
        console.error(`error load file in "getDBContent" error=${error}`);
      }

      if(forseLoad || !db || db[0].length != this._numberLoadedBooksInCategory) {
        try {
          this._database = await this._run();  
          await this._writeFile(this._database);
        }
        catch(error) {
          console.error(`error in "_run" method or write file error=${error}`);
        }
      } else {
         this._database = db;
      }
    }
    return this._database;
  }

  async _run() {
    let browser;
    // profiler 
    this._startTime = Date.now();

    try {
        browser = await puppeteer.launch({
        headless: !this._visible,
        devtools: false
      });

      const listCategory = await this._loadListCategory();
      let result = [];
      
      /**
       * multipage (parallel)
       * in view mode : 
       * 174 sec 3 books in any category 5 books -> 518 sec 
       * in hide mode: 
       * 5->79 sec, 10->133 sec, 20->273 sec 
       */
      if(!this._visible) {
          result = await Promise.all(listCategory.map(async (item) => {
          return await this.loadCategory(item.path, this._numberLoadedBooksInCategory, browser);
        }));
      } else {

        /**
         * singlepage
         * in view mode : 
         * 112 sec 3 books in any category 
         * in hide mode: 
         * 5->151 sec, 10->285
         */
        for(let item of listCategory) {
          result.push(
            await this.loadCategory(item.path, this._numberLoadedBooksInCategory, browser)
          );
        }
      }

      await browser.close();
      console.log(`Total time work = ${Math.round((Date.now() - this._startTime) / 1000)} sec`);
      return result;
    }
    catch (error) {
      console.error(`Error in "_run" method error=${error}`);
      await browser.close();
    }
  }

  async loadCategory(startPage, numberOfBook, browser) {
    try {
      const page = await browser.newPage();
      await page.goto(startPage);
      await page.setViewport({ width: 1024, height: 768 });
      await page.waitForSelector(this._bookSelector);

      let arrayUnicElement = [];
      let lastCounter = 0;
      let throttle = 0;

      do {
        let arrayElementHandle = await page.$$(this._bookSelector);

        let arrayLoadedId = await Promise.all(
          arrayElementHandle.map(async element => {
            return {
              id: await page.evaluate(item => item.id, element),
              element
            };
          })
        );

        arrayLoadedId.forEach( item => {
          if(!arrayUnicElement.find(loadedItem => loadedItem.id === item.id)) {
            arrayUnicElement.push(item);
          }
        }); 

        await Promise.all(arrayUnicElement.map(async (item) => {

          if(!item.title) {
            let requestElements = [
              item.element.$(this._bookAuthor),
              item.element.$(this._bookTitle),
              item.element.$(this._bookCover),
              item.element.$(this._bookRank),
              item.element.$(this._bookPrice)
            ];
      
            let elements = await Promise.all(requestElements);
      
            let requestData = [
              page.evaluate(element => element.textContent, elements[0]),
              page.evaluate(element => element.textContent, elements[1]),
              page.evaluate(element => element.currentSrc, elements[2]),
              page.evaluate(element => element && element.style.width, elements[3]),
              page.evaluate(element => element.innerHTML, elements[4]),
            ];
      
            let data = await Promise.all(requestData);
            
            item.author = data[0].trim();
            item.title = data[1].trim();
            item.coverSmall = data[2].trim();
            item.rank = data[3] ? parseInt(data[3]) : 0;
            item.price = parseInt(data[4].replace(/&nbsp;/g, ''));
          }
        }));

        if(lastCounter < arrayUnicElement.length) {
            lastCounter = arrayUnicElement.length;
        } else {
          if(throttle++ > 1000) {
            break;
          }
        }
        await this._scrollEndPage(page);

      } while (arrayUnicElement.length  < numberOfBook);

      console.log(`Path=${startPage} loaded=${arrayUnicElement.length}`);
      
      arrayUnicElement = arrayUnicElement.slice(0, numberOfBook);

      for(let item of arrayUnicElement) {
        let bookInfoEx = await this._getAdditionBookInfo(page, item.id);
        item.covers = bookInfoEx.covers;
        item.text = bookInfoEx.text;
      }

      return arrayUnicElement;
    }
    catch (error) {
      console.error(`Throw in "loadCategory"(startPage=${startPage}) error=${error}`);
    }
  }

  async _scrollEndPage(page) {
    try {
      await page.evaluate( () => {
        let bookContainer = document.querySelector("div.item-wrapper[data-v-fc15957c]");
        window.scrollTo(0, bookContainer.scrollHeight);
      });

      await page.waitForSelector(this._waitPageDownSelectorStart);
      await page.waitForSelector(this._waitPageDownSelectorEnd);
    }
    catch (error) {
      console.log(`Throw in "_scrollEndPage" error=${error}, continue...`);
    }
  }

  async _getAdditionBookInfo(page, id) {
    try {
      await page.goto(this._bookPage + id, { waitUntil: "load", timeout: 30000 }); 

      let result = {};
      result.covers = [];
      
      // disable advertising banner
      let overlayDiv = await page.$$(this._overlaySubscription);
      if(overlayDiv.length) {
        await page.evaluate(element => element.style.display = "none", overlayDiv[0]);
      }

      let arrayElementHandle = await page.$$(this._bookMicroGallery);

      let lastCover = "";

      if(arrayElementHandle.length == 1) {
        let fullPicture = await page.$$(this._bookFullImageOne);
        if(fullPicture.length) {
          const cover = await page.evaluate(element => element.currentSrc, fullPicture[0]);
          result.covers.push(cover);
          console.log(`load cover : ${cover}`);
        }
      } else {

        for(let i = 0; i < arrayElementHandle.length; i++) {
          try {
            await arrayElementHandle[i].hover();

          } catch (error) {
            console.log(`Exception in hover in "_getAdditionBookInfo" method, error=: ${error}, run recursion  `);
            return await this._getAdditionBookInfo(page, id);
          }
        
          let src = "";
          let counter = 0;

          while((src === "" || src === lastCover) && counter < 50) {

            await page.waitFor(30);
            counter++;
            let fullPicture = await page.$$(this._bookFullImage);

            if(!fullPicture.length) {
              break;
            }
            src = await page.evaluate(element => element.currentSrc, fullPicture[0]);
          }

          if(src != "" && src != lastCover) {
            result.covers.push(src);
            console.log(`load cover : ${src}`);
          }

          lastCover = src;
        }
      }

      let moreInfoText = await page.$$(this._bookMoreInfoText);
      if(moreInfoText.length) {
        const text = await page.evaluate(element => element.textContent, moreInfoText[0]);
        result.text = text;
      }

      return result;

    } catch (error) {
      console.log(`exeption in "getAdditionBookInfo" method, id=${id} error=${error}, run recursion`);
      return await this._getAdditionBookInfo(page, id);
    }
  }

  /**
   * return array of links of books category
   * add or change
   */
  async _loadListCategory() {
    const list = [
      {
        id: 1,
        path: "https://www.ozon.ru/category/40006/"
      },
      {
        id: 2,
        path: "https://www.ozon.ru/category/40002/"
      },
      {
        id: 3,
        path: "https://www.ozon.ru/category/40014/"
      },
      {
        id: 4,
        path: "https://www.ozon.ru/category/40003/"
      },
      {
        id: 5,
        path: "https://www.ozon.ru/category/40005/"
      },
      {
        id: 6,
        path: "https://www.ozon.ru/category/40020/"
      },
      {
        id: 7,
        path: "https://www.ozon.ru/category/40025/"
      },
    ];

    return list;
  }
}

const InfoLoader = new BookInfoLoader();

module.exports = InfoLoader;
