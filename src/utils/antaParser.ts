/**
 * 安踏防伪查询HTML解析工具
 * Anta Anti-Counterfeit HTML Parser Utility
 */

import * as cheerio from "cheerio";
import {
  type AntiCounterfeitError,
  AntiCounterfeitErrorType,
  createAntiCounterfeitError,
  type ParsedProductData,
} from "../types/anta";

/**
 * 解析安踏API返回的HTML内容
 * @param html HTML内容
 * @returns 解析后的产品数据
 */
export function parseAntaHTML(html: string): ParsedProductData {
  if (!html || typeof html !== "string") {
    throw createAntiCounterfeitError(AntiCounterfeitErrorType.PARSING_ERROR, "HTML内容为空或格式不正确");
  }

  try {
    const $ = cheerio.load(html);
    const productData: ParsedProductData = {};

    // 根据安踏官网的HTML结构解析产品信息
    // 这里需要根据实际的HTML结构进行调整

    // 解析条码 (Barcode)
    const barcodeElement = $('td:contains("条码"), td:contains("barcode")').next();
    if (barcodeElement.length > 0) {
      productData.barcode = cleanText(barcodeElement.text());
    }

    // 解析性别 (Gender)
    const genderElement = $('td:contains("性别"), td:contains("gender")').next();
    if (genderElement.length > 0) {
      productData.gender = cleanText(genderElement.text());
    }

    // 解析品名 (Product Name)
    const productNameElement = $('td:contains("品名"), td:contains("product"), td:contains("name")').next();
    if (productNameElement.length > 0) {
      productData.productName = cleanText(productNameElement.text());
    }

    // 解析系列 (Series)
    const seriesElement = $('td:contains("系列"), td:contains("series")').next();
    if (seriesElement.length > 0) {
      productData.series = cleanText(seriesElement.text());
    }

    // 解析货号 (Item Number)
    const itemNumberElement = $('td:contains("货号"), td:contains("item"), td:contains("number")').next();
    if (itemNumberElement.length > 0) {
      productData.itemNumber = cleanText(itemNumberElement.text());
    }

    // 解析EAN码
    const eanElement = $('td:contains("EAN"), td:contains("ean")').next();
    if (eanElement.length > 0) {
      productData.ean = cleanText(eanElement.text());
    }

    // 解析尺码 (Size)
    const sizeElement = $('td:contains("尺码"), td:contains("size")').next();
    if (sizeElement.length > 0) {
      productData.size = cleanText(sizeElement.text());
    }

    // 解析零售价 (Retail Price)
    const priceElement = $('td:contains("零售价"), td:contains("price"), td:contains("retail")').next();
    if (priceElement.length > 0) {
      productData.retailPrice = cleanText(priceElement.text());
    }

    // 备用解析策略：尝试从表格行中解析
    if (Object.keys(productData).length === 0) {
      Object.assign(productData, parseFromTableRows($));
    }

    // 备用解析策略：尝试从列表项中解析
    if (Object.keys(productData).length === 0) {
      Object.assign(productData, parseFromListItems($));
    }

    return productData;
  } catch (error) {
    throw createAntiCounterfeitError(AntiCounterfeitErrorType.PARSING_ERROR, "解析HTML内容时发生错误", error);
  }
}

/**
 * 从表格行中解析产品信息
 * @param $ Cheerio实例
 * @returns 解析后的产品数据
 */
function parseFromTableRows($: cheerio.CheerioAPI): ParsedProductData {
  const productData: ParsedProductData = {};

  $("tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length >= 2) {
      const label = cleanText($(cells[0]).text()).toLowerCase();
      const value = cleanText($(cells[1]).text());

      if (value) {
        if (label.includes("条码") || label.includes("barcode")) {
          productData.barcode = value;
        } else if (label.includes("性别") || label.includes("gender")) {
          productData.gender = value;
        } else if (label.includes("品名") || label.includes("product") || label.includes("name")) {
          productData.productName = value;
        } else if (label.includes("系列") || label.includes("series")) {
          productData.series = value;
        } else if (label.includes("货号") || label.includes("item")) {
          productData.itemNumber = value;
        } else if (label.includes("ean")) {
          productData.ean = value;
        } else if (label.includes("尺码") || label.includes("size")) {
          productData.size = value;
        } else if (label.includes("零售价") || label.includes("price") || label.includes("retail")) {
          productData.retailPrice = value;
        }
      }
    }
  });

  return productData;
}

/**
 * 从列表项中解析产品信息
 * @param $ Cheerio实例
 * @returns 解析后的产品数据
 */
function parseFromListItems($: cheerio.CheerioAPI): ParsedProductData {
  const productData: ParsedProductData = {};

  $("li, div, span").each((_, element) => {
    const text = cleanText($(element).text());
    let colonIndex = text.indexOf("：");
    if (colonIndex === -1) {
      colonIndex = text.indexOf(":");
    }

    if (colonIndex > 0) {
      const label = text.substring(0, colonIndex).toLowerCase();
      const value = text.substring(colonIndex + 1).trim();

      if (value) {
        if (label.includes("条码") || label.includes("barcode")) {
          productData.barcode = value;
        } else if (label.includes("性别") || label.includes("gender")) {
          productData.gender = value;
        } else if (label.includes("品名") || label.includes("product") || label.includes("name")) {
          productData.productName = value;
        } else if (label.includes("系列") || label.includes("series")) {
          productData.series = value;
        } else if (label.includes("货号") || label.includes("item")) {
          productData.itemNumber = value;
        } else if (label.includes("ean")) {
          productData.ean = value;
        } else if (label.includes("尺码") || label.includes("size")) {
          productData.size = value;
        } else if (label.includes("零售价") || label.includes("price") || label.includes("retail")) {
          productData.retailPrice = value;
        }
      }
    }
  });

  return productData;
}

/**
 * 清理文本内容
 * @param text 原始文本
 * @returns 清理后的文本
 */
function cleanText(text: string): string {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .replace(/\s+/g, " ") // 替换多个空白字符为单个空格
    .replace(/[\r\n\t]/g, "") // 移除换行符和制表符
    .trim(); // 移除首尾空白
}

/**
 * 验证解析结果是否包含有效的产品信息
 * @param data 解析后的产品数据
 * @returns 是否包含有效信息
 */
export function isValidParsedData(data: ParsedProductData): boolean {
  if (!data || typeof data !== "object") {
    return false;
  }

  // 至少需要包含条码和产品名称
  return !!(data.barcode && data.productName);
}

/**
 * 从HTML中提取错误信息
 * @param html HTML内容
 * @returns 错误信息，如果没有错误则返回null
 */
export function extractErrorFromHTML(html: string): string | null {
  if (!html || typeof html !== "string") {
    return null;
  }

  try {
    const $ = cheerio.load(html);

    // 查找常见的错误提示元素
    const errorSelectors = [
      ".error",
      ".alert-danger",
      ".warning",
      '[class*="error"]',
      '[class*="fail"]',
      'div:contains("错误")',
      'div:contains("失败")',
      'div:contains("不存在")',
      'div:contains("未找到")',
    ];

    for (const selector of errorSelectors) {
      const errorElement = $(selector);
      if (errorElement.length > 0) {
        const errorText = cleanText(errorElement.text());
        if (errorText) {
          return errorText;
        }
      }
    }

    // 检查是否包含"未找到"或"不存在"等关键词
    const bodyText = cleanText($("body").text()).toLowerCase();
    if (
      bodyText.includes("未找到") ||
      bodyText.includes("不存在") ||
      bodyText.includes("无效") ||
      bodyText.includes("错误") ||
      bodyText.includes("失败")
    ) {
      return "产品信息未找到或查询失败";
    }

    return null;
  } catch (_error) {
    return null;
  }
}

/**
 * 解析HTML并返回完整的产品信息或错误
 * @param html HTML内容
 * @returns 解析结果
 */
export function parseAntaResponse(html: string): { data?: ParsedProductData; error?: string } {
  try {
    // 首先检查是否包含错误信息
    const errorMessage = extractErrorFromHTML(html);
    if (errorMessage) {
      return { error: errorMessage };
    }

    // 解析产品信息
    const productData = parseAntaHTML(html);

    // 验证解析结果
    if (!isValidParsedData(productData)) {
      return { error: "未能从响应中提取有效的产品信息" };
    }

    return { data: productData };
  } catch (error) {
    if (error instanceof Error && "type" in error) {
      // 如果是我们自定义的错误，直接返回错误信息
      return { error: (error as AntiCounterfeitError).message };
    }
    return { error: "解析响应数据时发生未知错误" };
  }
}
