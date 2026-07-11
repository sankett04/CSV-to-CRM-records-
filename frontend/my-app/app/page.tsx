
'use client';

import { useMemo, useRef, useState } from 'react';

type CsvRow = string[];
type PreviewState = {
  headers: string[];
  rows: CsvRow[];
  totalRows: number;
  fileName: string | null;
  rowObjects: Array<Record<string, string | number | boolean | null>>;
};

type ConvertedRecord = {
  [key: string]: string | number | boolean | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

export default function Home() {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<PreviewState | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [importProgress, setImportProgress] = useState<string>('');
  const [convertedRecords, setConvertedRecords] = useState<ConvertedRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setUploadedFile(file);
        setCsvPreview(null);
        setIsPreviewOpen(false);
        setPreviewError(null);
      } else {
        alert('Please drop a CSV file');
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        setUploadedFile(file);
        setCsvPreview(null);
        setIsPreviewOpen(false);
        setPreviewError(null);
      } else {
        alert('Please select a CSV file');
      }
    }
  };

  const handlePreview = async () => {
    if (!uploadedFile) return;

    setIsPreparingPreview(true);
    setPreviewError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);

      const response = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Unable to preview this file right now.');
      }

      setCsvPreview({
        headers: data.headers || [],
        rows: data.rows || [],
        totalRows: data.totalRows || 0,
        fileName: data.fileName || null,
        rowObjects: Array.isArray(data.rowObjects) ? data.rowObjects : [],
      });
      setSearchTerm('');
      setCurrentPage(1);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Preview error:', error);
      setPreviewError(error instanceof Error ? error.message : 'Unable to preview this file right now.');
      setCsvPreview(null);
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleUpload = async () => {
    if (!csvPreview) return;

    setIsUploading(true);
    setImportProgress('Preparing conversion...');
    setConvertedRecords([]);

    try {
      const response = await fetch(`${apiBaseUrl}/api/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: csvPreview.fileName,
          rowObjects: csvPreview.rowObjects,
          headers: csvPreview.headers,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Import failed. Please try again.');
      }

      const records = Array.isArray(data.records) ? data.records : [];
      setConvertedRecords(records);
      setImportProgress(`Conversion complete. ${records.length} record(s) generated.`);
      setIsPreviewOpen(true);
      setPreviewError(null);
    } catch (error) {
      console.error('Upload error:', error);
      setImportProgress(error instanceof Error ? error.message : 'An error occurred during import.');
      setConvertedRecords([]);
    } finally {
      setIsUploading(false);
    }
  };

  const previewData = useMemo(() => {
    if (!csvPreview || csvPreview.rows.length === 0) {
      return { headers: csvPreview?.headers ?? [], rows: [] as CsvRow[], totalRows: csvPreview?.totalRows ?? 0 };
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredRows = normalizedSearch
      ? csvPreview.rows.filter((row) => row.some((cell) => cell.toLowerCase().includes(normalizedSearch)))
      : csvPreview.rows;

    return {
      headers: csvPreview.headers,
      rows: filteredRows,
      totalRows: filteredRows.length,
    };
  }, [csvPreview, searchTerm]);

  const rowsPerPage = 12;
  const totalPages = Math.max(1, Math.ceil(previewData.totalRows / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = previewData.rows.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-6xl flex-col items-center justify-between px-8 py-16 bg-white dark:bg-black sm:items-start sm:px-16">
        <div className="flex w-full flex-col items-start gap-6 text-left">
          <h1 className="max-w-full whitespace-nowrap text-2xl font-semibold leading-8 tracking-tight text-black dark:text-zinc-50 sm:text-3xl">
            Upload CSV and convert into CRM records
          </h1>
        </div>

        <div className="mt-8 w-full">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-600'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInputChange}
              className="hidden"
              aria-hidden="true"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer"
            >
              <div className="mb-3 flex justify-center">
                <svg
                  className="h-12 w-12 text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 16v-4m0 0V8m0 4H8m4 0h4M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-base font-medium text-zinc-900 dark:text-zinc-50">
                {isDragging ? 'Drop your CSV file here' : 'Upload CSV file here'}
              </p>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Click to browse and select a CSV file
              </p>
            </div>
          </div>

          {uploadedFile && (
            <div className="mt-6 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
              <p className="mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                Selected file: <span className="font-semibold">{uploadedFile.name}</span>
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handlePreview}
                  disabled={isPreparingPreview}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-400"
                >
                  {isPreparingPreview ? 'Uploading CSV...' : 'Upload CSV'}
                </button>
              </div>
            </div>
          )}

          {isPreviewOpen && (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    Uploaded CSV
                  </h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Your file is ready. Convert it into CRM records below.
                  </p>
                </div>
              </div>

              {previewError ? (
                <p className="mt-3 text-sm text-red-600">{previewError}</p>
              ) : csvPreview && csvPreview.rows.length > 0 ? (
                <>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    <span>
                      Showing {previewData.totalRows > 0 ? (safePage - 1) * rowsPerPage + 1 : 0}–{Math.min(safePage * rowsPerPage, previewData.totalRows)} of {previewData.totalRows} rows
                    </span>
                    <span>
                      {previewData.headers.length} columns
                    </span>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-zinc-100 dark:bg-zinc-700">
                        <tr>
                          {previewData.headers.map((header, headerIndex) => (
                            <th key={`${header}-${headerIndex}`} className="whitespace-nowrap px-3 py-3 font-semibold text-zinc-700 dark:text-zinc-100">
                              {header || `Column ${headerIndex + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedRows.length > 0 ? (
                          pagedRows.map((row, rowIndex) => (
                            <tr key={`${rowIndex}-${row.join('-')}`} className="border-t border-zinc-200 odd:bg-white even:bg-zinc-50 dark:border-zinc-700 dark:odd:bg-zinc-800 dark:even:bg-zinc-900">
                              {previewData.headers.map((_, columnIndex) => (
                                <td key={`${rowIndex}-${columnIndex}`} className="max-w-[220px] whitespace-nowrap px-3 py-2 text-zinc-700 dark:text-zinc-300">
                                  <span className="block overflow-hidden text-ellipsis">
                                    {row[columnIndex] || '—'}
                                  </span>
                                </td>
                              ))}
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={Math.max(previewData.headers.length, 1)} className="px-3 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
                              No rows match your search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Previewing one page at a time for easier scanning.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={safePage === 1}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-zinc-600 dark:text-zinc-300">
                        Page {safePage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={safePage === totalPages}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                  This file is empty.
                </p>
              )}

              <div className="mt-4 flex flex-col gap-3">
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
                >
                  {isUploading ? 'Converting...' : 'Convert into CRM records'}
                </button>

                {importProgress && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <p className="font-medium">Conversion status</p>
                    <p className="mt-1">{importProgress}</p>
                  </div>
                )}

                {convertedRecords.length > 0 && (
                  <div className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <p className="font-medium">Converted CRM records</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Showing {convertedRecords.length} record(s) generated from the CSV.
                    </p>
                    <div className="mt-3 max-h-72 overflow-auto">
                      <pre className="whitespace-pre-wrap break-words text-xs">
                        {JSON.stringify(convertedRecords, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
