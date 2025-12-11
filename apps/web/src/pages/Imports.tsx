import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileSpreadsheet, Upload, Clock, CheckCircle, XCircle, AlertTriangle, ChevronRight, Search } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/api/client';
import { fadeInUp } from '@/lib/animations';

interface ImportHistory {
  id: string;
  clientId: string;
  clientName: string;
  filename: string;
  fileType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  rowCount: number;
  processedCount?: number;
  errorCount?: number;
  createdAt: string;
  completedAt?: string;
}

interface Client {
  id: string;
  name: string;
  code: string;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500 bg-yellow-50', label: 'Pending' },
  processing: { icon: Clock, color: 'text-blue-500 bg-blue-50', label: 'Processing' },
  completed: { icon: CheckCircle, color: 'text-green-500 bg-green-50', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-500 bg-red-50', label: 'Failed' },
};

export default function Imports() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<string>('all');

  // Fetch clients for dropdown
  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => api.get<{ data: Client[] }>('/clients'),
  });

  // Fetch import history
  const { data: importsData, isLoading } = useQuery({
    queryKey: ['imports', 'history', selectedClient],
    queryFn: () => api.get<{ data: ImportHistory[] }>('/imports/history', {
      params: selectedClient !== 'all' ? { clientId: selectedClient } : undefined,
    }),
  });

  const clients = clientsData?.data || [];
  const imports = importsData?.data || [];

  // Filter by search
  const filteredImports = imports.filter(imp =>
    imp.filename.toLowerCase().includes(search.toLowerCase()) ||
    imp.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeInUp} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
          <p className="text-gray-500">Upload and manage inventory data imports</p>
        </div>
      </motion.div>

      {/* Client Cards for Quick Import */}
      <motion.div {...fadeInUp} className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Import to Client</h2>
        <p className="text-sm text-gray-500 mb-4">Select a client to upload inventory data</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {clients.map((client) => (
            <button
              key={client.id}
              onClick={() => navigate(`/clients/${client.id}?import=true`)}
              className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 hover:border-primary-500 hover:bg-primary-50 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <Upload className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">{client.name}</div>
                <div className="text-xs text-gray-500">{client.code}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-500" />
            </button>
          ))}
        </div>

        {clients.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No clients available. Create a client first to import data.</p>
          </div>
        )}
      </motion.div>

      {/* Import History */}
      <motion.div {...fadeInUp} className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900">Import History</h2>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search imports..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Client Filter */}
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Clients</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">
            <Clock className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <p>Loading import history...</p>
          </div>
        ) : filteredImports.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rows</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredImports.map((imp) => {
                  const StatusIcon = statusConfig[imp.status]?.icon || Clock;
                  const statusColor = statusConfig[imp.status]?.color || 'text-gray-500 bg-gray-50';
                  const statusLabel = statusConfig[imp.status]?.label || imp.status;

                  return (
                    <tr key={imp.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <FileSpreadsheet className="w-5 h-5 text-gray-400" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">{imp.filename}</div>
                            <div className="text-xs text-gray-500">{imp.fileType}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-700">{imp.clientName}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusColor}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {imp.status === 'completed' ? (
                          <span>
                            {imp.processedCount || 0} processed
                            {imp.errorCount && imp.errorCount > 0 && (
                              <span className="text-red-500 ml-1">({imp.errorCount} errors)</span>
                            )}
                          </span>
                        ) : (
                          <span>{imp.rowCount} rows</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(imp.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="font-medium">No imports found</p>
            <p className="text-sm">Select a client above to start importing data</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
