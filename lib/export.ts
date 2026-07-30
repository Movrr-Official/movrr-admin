import * as XLSX from "xlsx-js-style";
import jsPDF from "jspdf";
import "jspdf-autotable";

// Extend jsPDF type to include autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

export interface ExportOptions {
  filename?: string;
  includeHeaders?: boolean;
  dateRange?: {
    start: Date;
    end: Date;
  };
  selectedFields?: string[];
  format: "csv" | "xlsx" | "pdf" | "json";
}

export interface ExportableData {
  [key: string]: any;
}

export function exportToCSV(
  data: ExportableData[],
  options: ExportOptions
): void {
  const {
    filename = "export",
    includeHeaders = true,
    selectedFields,
  } = options;

  if (!data.length) return;

  // Filter fields if specified
  const processedData = selectedFields
    ? data.map((row) => {
        const filteredRow: ExportableData = {};
        selectedFields.forEach((field) => {
          if (row[field] !== undefined) {
            filteredRow[field] = row[field];
          }
        });
        return filteredRow;
      })
    : data;

  const headers = Object.keys(processedData[0]);
  const csvContent = [
    ...(includeHeaders ? [headers.join(",")] : []),
    ...processedData.map((row) =>
      headers
        .map((header) => {
          const value = row[header];
          // Handle commas and quotes in CSV
          if (
            typeof value === "string" &&
            (value.includes(",") || value.includes('"'))
          ) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(",")
    ),
  ].join("\n");

  downloadFile(csvContent, `${filename}.csv`, "text/csv");
}

export function exportToExcel(
  data: ExportableData[],
  options: ExportOptions
): void {
  const {
    filename = "export",
    includeHeaders = true,
    selectedFields,
  } = options;

  if (!data.length) return;

  // Filter fields if specified
  const processedData = selectedFields
    ? data.map((row) => {
        const filteredRow: ExportableData = {};
        selectedFields.forEach((field) => {
          if (row[field] !== undefined) {
            filteredRow[field] = row[field];
          }
        });
        return filteredRow;
      })
    : data;

  const worksheet = XLSX.utils.json_to_sheet(processedData, {
    header: selectedFields || Object.keys(processedData[0]),
    skipHeader: !includeHeaders,
  });

  const headers = selectedFields || Object.keys(processedData[0]);

  // Apply header styling
  if (includeHeaders) {
    headers.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: colIndex });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { fgColor: { rgb: "23B245" } }, // Primary green color
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    });
  }

  // Apply alternating row colors and borders to data rows
  processedData.forEach((row, rowIndex) => {
    const actualRowIndex = includeHeaders ? rowIndex + 1 : rowIndex;
    headers.forEach((header, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({
        r: actualRowIndex,
        c: colIndex,
      });
      if (worksheet[cellAddress]) {
        worksheet[cellAddress].s = {
          fill: {
            fgColor: {
              rgb: rowIndex % 2 === 0 ? "FFFFFF" : "F8F9FA",
            },
          },
          alignment: { horizontal: "left", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "E5E7EB" } },
            bottom: { style: "thin", color: { rgb: "E5E7EB" } },
            left: { style: "thin", color: { rgb: "E5E7EB" } },
            right: { style: "thin", color: { rgb: "E5E7EB" } },
          },
        };
      }
    });
  });

  // Auto-size columns with enhanced width calculation
  const colWidths = headers.map((key) => {
    const headerLength = key.length;
    const maxDataLength = Math.max(
      ...processedData.map((row) => String(row[key] || "").length)
    );
    return { wch: Math.min(Math.max(headerLength, maxDataLength) + 2, 50) };
  });
  worksheet["!cols"] = colWidths;

  // Set row heights for better appearance
  const rowHeights = Array(
    processedData.length + (includeHeaders ? 1 : 0)
  ).fill({ hpt: 20 });
  if (includeHeaders) {
    rowHeights[0] = { hpt: 25 }; // Taller header row
  }
  worksheet["!rows"] = rowHeights;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Export");

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

export function exportToPDF(
  data: ExportableData[],
  options: ExportOptions
): void {
  const {
    filename = "export",
    includeHeaders = true,
    selectedFields,
  } = options;

  if (!data.length) return;

  const doc = new jsPDF();

  // Filter fields if specified
  const processedData = selectedFields
    ? data.map((row) => {
        const filteredRow: ExportableData = {};
        selectedFields.forEach((field) => {
          if (row[field] !== undefined) {
            filteredRow[field] = row[field];
          }
        });
        return filteredRow;
      })
    : data;

  const headers = Object.keys(processedData[0]);
  const tableData = processedData.map((row) =>
    headers.map((header) => String(row[header] || ""))
  );

  // Add title
  doc.setFontSize(16);
  doc.text("Data Export", 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);

  // Create table
  doc.autoTable({
    head: includeHeaders ? [headers] : undefined,
    body: tableData,
    startY: 35,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [35, 178, 69], // Using the primary green color
      textColor: 255,
      fontStyle: "bold",
    },
    alternateRowStyles: {
      fillColor: [245, 245, 245],
    },
  });

  doc.save(`${filename}.pdf`);
}

export function exportToJSON(
  data: ExportableData[],
  options: ExportOptions
): void {
  const { filename = "export", selectedFields } = options;

  if (!data.length) return;

  // Filter fields if specified
  const processedData = selectedFields
    ? data.map((row) => {
        const filteredRow: ExportableData = {};
        selectedFields.forEach((field) => {
          if (row[field] !== undefined) {
            filteredRow[field] = row[field];
          }
        });
        return filteredRow;
      })
    : data;

  const exportData = {
    exportedAt: new Date().toISOString(),
    totalRecords: processedData.length,
    data: processedData,
  };

  const jsonContent = JSON.stringify(exportData, null, 2);
  downloadFile(jsonContent, `${filename}.json`, "application/json");
}

function filterExportRows(
  data: ExportableData[],
  options: ExportOptions,
): ExportableData[] {
  let filteredData = data;
  if (options.dateRange) {
    filteredData = data.filter((row) => {
      const rowDate = new Date(row.created_at || row.date || "");
      return (
        rowDate >= options.dateRange!.start && rowDate <= options.dateRange!.end
      );
    });
  }

  if (!options.selectedFields?.length) return filteredData;

  return filteredData.map((row) => {
    const filteredRow: ExportableData = {};
    options.selectedFields!.forEach((field) => {
      if (row[field] !== undefined) {
        filteredRow[field] = row[field];
      }
    });
    return filteredRow;
  });
}

export type SerializedExport = {
  content: string;
  contentType: string;
  filename: string;
  rowCount: number;
  /** When true, content is base64 (xlsx). */
  encoding?: "utf8" | "base64";
};

/**
 * Build export payload without triggering a browser download.
 * Callers must audit via executeAuditedExport before downloading.
 */
export function serializeExportData(
  data: ExportableData[],
  options: ExportOptions,
): SerializedExport | null {
  const processedData = filterExportRows(data, options);
  if (!processedData.length) return null;

  const baseName = options.filename || "export";
  const includeHeaders = options.includeHeaders !== false;
  const headers = Object.keys(processedData[0]);

  switch (options.format) {
    case "csv": {
      const csvContent = [
        ...(includeHeaders ? [headers.join(",")] : []),
        ...processedData.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              if (
                typeof value === "string" &&
                (value.includes(",") || value.includes('"'))
              ) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            })
            .join(","),
        ),
      ].join("\n");
      return {
        content: csvContent,
        contentType: "text/csv;charset=utf-8;",
        filename: `${baseName}.csv`,
        rowCount: processedData.length,
      };
    }
    case "json": {
      const payload = {
        exportedAt: new Date().toISOString(),
        totalRecords: processedData.length,
        data: processedData,
      };
      return {
        content: JSON.stringify(payload, null, 2),
        contentType: "application/json",
        filename: `${baseName}.json`,
        rowCount: processedData.length,
      };
    }
    case "xlsx": {
      const worksheet = XLSX.utils.json_to_sheet(processedData, {
        header: headers,
        skipHeader: !includeHeaders,
      });
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Export");
      const base64 = XLSX.write(workbook, {
        type: "base64",
        bookType: "xlsx",
      }) as string;
      return {
        content: base64,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${baseName}.xlsx`,
        rowCount: processedData.length,
        encoding: "base64",
      };
    }
    case "pdf": {
      // PDF binary is awkward to audit as text — serialize JSON twin for audit,
      // then still generate PDF client-side after audit succeeds.
      return {
        content: JSON.stringify({
          exportedAt: new Date().toISOString(),
          totalRecords: processedData.length,
          format: "pdf",
          data: processedData,
        }),
        contentType: "application/json",
        filename: `${baseName}.pdf`,
        rowCount: processedData.length,
      };
    }
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
}

export function downloadSerializedExport(serialized: SerializedExport): void {
  if (serialized.filename.endsWith(".pdf")) {
    // Reconstruct PDF from JSON twin for download after audit.
    try {
      const parsed = JSON.parse(serialized.content) as {
        data?: ExportableData[];
      };
      if (parsed.data?.length) {
        exportToPDF(parsed.data, {
          format: "pdf",
          filename: serialized.filename.replace(/\.pdf$/i, ""),
          includeHeaders: true,
        });
        return;
      }
    } catch {
      // fall through
    }
  }

  if (serialized.encoding === "base64") {
    const binary = atob(serialized.content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: serialized.contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = serialized.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return;
  }

  downloadFile(serialized.content, serialized.filename, serialized.contentType);
}

/**
 * @deprecated Prefer serializeExportData + executeAuditedExport + downloadSerializedExport.
 */
export function exportData(
  data: ExportableData[],
  options: ExportOptions
): void {
  const serialized = serializeExportData(data, options);
  if (!serialized) return;

  if (options.format === "pdf") {
    const processedData = filterExportRows(data, options);
    exportToPDF(processedData, options);
    return;
  }

  downloadSerializedExport(serialized);
}

export function batchExport(
  datasets: { name: string; data: ExportableData[] }[],
  options: Omit<ExportOptions, "filename">
): void {
  datasets.forEach((dataset) => {
    exportData(dataset.data, {
      ...options,
      filename: `${dataset.name}_${new Date().toISOString().split("T")[0]}`,
    });
  });
}

function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function getAvailableFields(data: ExportableData[]): string[] {
  if (!data.length) return [];
  return Object.keys(data[0]);
}

export function formatFieldName(fieldName: string): string {
  return fieldName
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
