import { useState } from "react";
import { Printer, Upload, Download, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { portalApi } from "@/api/client";

interface PrintMergeStats {
  rowsIn: number;
  rowsOut: number;
  personalized: number;
  withTwoLines: number;
  withDate: number;
}

interface PrintMergeResponse {
  success: boolean;
  filename: string;
  stats: PrintMergeStats;
  csv: string;
}

function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PrintMerge() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PrintMergeResponse | null>(null);
  const [storedLoading, setStoredLoading] = useState(false);

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await portalApi.upload<PrintMergeResponse>("/exports/print-merge", file);
      setResult(res);
      downloadCsv(res.csv, res.filename);
      toast.success(`Converted ${res.stats.rowsIn} order lines`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conversion failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStored = async () => {
    setStoredLoading(true);
    try {
      const res = await portalApi.get<{ filename: string; rowCount: number; csv: string }>(
        "/exports/print-merge/stored"
      );
      if (!res.rowCount) {
        toast("No received orders yet.");
        return;
      }
      downloadCsv(res.csv, res.filename);
      toast.success(`Exported ${res.rowCount} rows from received orders`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setStoredLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <Printer className="h-6 w-6 text-emerald-600" />
          Four51 &rarr; CorelDRAW Print Merge
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload a Four51 orders CSV export. This fixes the column-shift parsing issue,
          splits the imprint into separate title lines, and returns a CorelDRAW-ready
          Print Merge file.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">
        <label
          htmlFor="four51-file"
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-emerald-400 transition-colors"
        >
          <Upload className="h-8 w-8 text-gray-400 mb-2" />
          <span className="text-sm font-medium text-gray-700">
            {file ? file.name : "Choose a Four51 orders CSV"}
          </span>
          <span className="text-xs text-gray-400 mt-1">.csv up to 50MB</span>
          <input
            id="four51-file"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        <button
          type="button"
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled={!file || loading}
          onClick={handleConvert}
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Converting&hellip;
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Convert &amp; Download
            </>
          )}
        </button>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-900">From received orders</h2>
        <p className="text-sm text-gray-500 mt-1 mb-3">
          Build a Print Merge file from orders Four51 has sent automatically via the
          cXML listener &mdash; no upload needed.
        </p>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          disabled={storedLoading}
          onClick={handleStored}
        >
          {storedLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Building&hellip;
            </>
          ) : (
            <>
              <Download className="h-4 w-4" /> Export received orders
            </>
          )}
        </button>
      </div>

      {result && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Conversion summary</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Order lines</dt>
              <dd className="text-lg font-semibold text-gray-900">{result.stats.rowsIn}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Rows written</dt>
              <dd className="text-lg font-semibold text-gray-900">{result.stats.rowsOut}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Personalized</dt>
              <dd className="text-lg font-semibold text-gray-900">{result.stats.personalized}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Split into 2 lines</dt>
              <dd className="text-lg font-semibold text-gray-900">{result.stats.withTwoLines}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Trailing date found</dt>
              <dd className="text-lg font-semibold text-gray-900">{result.stats.withDate}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => downloadCsv(result.csv, result.filename)}
          >
            <Download className="h-4 w-4" /> Download again
          </button>
        </div>
      )}
    </div>
  );
}
