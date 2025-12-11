// =============================================================================
// CLIENT LOCATIONS PAGE
// Admin page for managing client locations (multi-location tracking)
// =============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Plus,
  Search,
  Building2,
  Warehouse,
  Store,
  ChevronLeft,
  Edit2,
  Trash2,
  X,
  Phone,
  Mail,
  Users,
  ShoppingCart,
  Loader2,
} from 'lucide-react';
import { useState } from 'react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { api } from '@/api/client';
import { fadeInUp, staggerContainer, staggerItem } from '@/lib/animations';

interface Location {
  id: string;
  clientId: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  locationType: 'headquarters' | 'branch' | 'warehouse' | 'store';
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stats: {
    totalOrders: number;
    recentOrders: number;
    portalUserCount: number;
  };
}

interface LocationFormData {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  locationType: 'headquarters' | 'branch' | 'warehouse' | 'store';
}

const LOCATION_TYPE_CONFIG = {
  headquarters: { icon: Building2, label: 'Headquarters', color: 'bg-blue-100 text-blue-700' },
  branch: { icon: MapPin, label: 'Branch', color: 'bg-green-100 text-green-700' },
  warehouse: { icon: Warehouse, label: 'Warehouse', color: 'bg-amber-100 text-amber-700' },
  store: { icon: Store, label: 'Store', color: 'bg-purple-100 text-purple-700' },
};

const emptyForm: LocationFormData = {
  name: '',
  code: '',
  address: '',
  city: '',
  state: '',
  zipCode: '',
  contactName: '',
  contactEmail: '',
  contactPhone: '',
  locationType: 'branch',
};

export default function ClientLocations() {
  const { clientId } = useParams<{ clientId: string }>();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [form, setForm] = useState<LocationFormData>(emptyForm);

  // Fetch client info
  const { data: clientData } = useQuery({
    queryKey: ['client', clientId],
    queryFn: () => api.get<{ id: string; name: string; code: string }>(`/clients/${clientId}`),
    enabled: !!clientId,
  });

  // Fetch locations
  const { data: locationsData, isLoading } = useQuery({
    queryKey: ['locations', clientId, typeFilter],
    queryFn: () =>
      api.get<{ data: Location[]; meta: { total: number; typeCounts: Record<string, number> } }>(
        `/clients/${clientId}/locations`,
        { params: { type: typeFilter || undefined, includeInactive: 'true' } }
      ),
    enabled: !!clientId,
  });

  // Create location mutation
  const createMutation = useMutation({
    mutationFn: (data: LocationFormData) =>
      api.post<Location>(`/clients/${clientId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations', clientId] });
      setShowModal(false);
      setForm(emptyForm);
      toast.success('Location created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create location');
    },
  });

  // Update location mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LocationFormData> }) =>
      api.patch<Location>(`/clients/${clientId}/locations/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations', clientId] });
      setShowModal(false);
      setEditingLocation(null);
      setForm(emptyForm);
      toast.success('Location updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update location');
    },
  });

  // Delete location mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message: string }>(`/clients/${clientId}/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations', clientId] });
      toast.success('Location deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete location');
    },
  });

  const client = clientData;
  const locations = locationsData?.data || [];
  const typeCounts = locationsData?.meta?.typeCounts || {};

  const filteredLocations = locations.filter(
    (loc) =>
      loc.name.toLowerCase().includes(search.toLowerCase()) ||
      loc.code.toLowerCase().includes(search.toLowerCase()) ||
      loc.city?.toLowerCase().includes(search.toLowerCase()) ||
      loc.state?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreateModal = () => {
    setEditingLocation(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEditModal = (location: Location) => {
    setEditingLocation(location);
    setForm({
      name: location.name,
      code: location.code,
      address: location.address || '',
      city: location.city || '',
      state: location.state || '',
      zipCode: location.zipCode || '',
      contactName: location.contactName || '',
      contactEmail: location.contactEmail || '',
      contactPhone: location.contactPhone || '',
      locationType: location.locationType,
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingLocation) {
      const { code, ...updateData } = form;
      updateMutation.mutate({ id: editingLocation.id, data: updateData });
    } else {
      createMutation.mutate(form);
    }
  };

  const handleDelete = (location: Location) => {
    if (window.confirm(`Are you sure you want to delete "${location.name}"?`)) {
      deleteMutation.mutate(location.id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <motion.div
      className="space-y-6"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
    >
      {/* Back link and header */}
      <div>
        <Link
          to={`/clients/${clientId}`}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {client?.name || 'Client'}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Locations</h1>
            <p className="text-text-secondary mt-1">
              Manage locations for {client?.name || 'this client'}
            </p>
          </div>
          <button className="btn-primary" onClick={openCreateModal}>
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(['headquarters', 'branch', 'warehouse', 'store'] as const).map((type) => {
          const config = LOCATION_TYPE_CONFIG[type];
          const Icon = config.icon;
          const count = typeCounts[type] || 0;
          return (
            <button
              key={type}
              onClick={() => setTypeFilter(typeFilter === type ? '' : type)}
              className={clsx(
                'card p-4 text-left transition-all',
                typeFilter === type && 'ring-2 ring-primary-500'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx('p-2 rounded-lg', config.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-sm text-gray-500">{config.label}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search locations..."
          className="input pl-10"
        />
      </div>

      {/* Locations Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6">
              <div className="skeleton h-6 w-32 mb-2" />
              <div className="skeleton h-4 w-24 mb-4" />
              <div className="skeleton h-4 w-full mb-2" />
              <div className="skeleton h-4 w-48" />
            </div>
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="card p-12 text-center">
          <MapPin className="w-12 h-12 mx-auto text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No locations found
          </h3>
          <p className="mt-2 text-gray-500">
            {search || typeFilter
              ? 'Try adjusting your filters'
              : 'Get started by adding your first location'}
          </p>
          {!search && !typeFilter && (
            <button className="btn-primary mt-4" onClick={openCreateModal}>
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </button>
          )}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {filteredLocations.map((location) => {
            const config = LOCATION_TYPE_CONFIG[location.locationType];
            const Icon = config.icon;
            return (
              <motion.div
                key={location.id}
                variants={staggerItem}
                className={clsx(
                  'card p-6 hover:shadow-lg transition-shadow',
                  !location.isActive && 'opacity-60'
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={clsx('p-2 rounded-lg', config.color)}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{location.name}</h3>
                      <p className="text-sm text-gray-500">{location.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEditModal(location)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(location)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {(location.city || location.state) && (
                  <p className="text-sm text-gray-600 mb-3">
                    {[location.city, location.state].filter(Boolean).join(', ')}
                  </p>
                )}

                {location.address && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {location.address}
                  </p>
                )}

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <ShoppingCart className="w-4 h-4" />
                    <span>{location.stats.totalOrders} orders</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span>{location.stats.portalUserCount} users</span>
                  </div>
                </div>

                {location.contactName && (
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-sm font-medium text-gray-700">
                      {location.contactName}
                    </p>
                    {location.contactEmail && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Mail className="w-3 h-3" />
                        <span>{location.contactEmail}</span>
                      </div>
                    )}
                    {location.contactPhone && (
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Phone className="w-3 h-3" />
                        <span>{location.contactPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {!location.isActive && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <span className="badge badge-gray">Inactive</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-gray-100">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-gray-900">
                    {editingLocation ? 'Edit Location' : 'Add Location'}
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location Name *
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code *
                    </label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      className="input w-full"
                      required
                      disabled={!!editingLocation}
                      placeholder="e.g., NYC-01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    value={form.locationType}
                    onChange={(e) =>
                      setForm({ ...form, locationType: e.target.value as LocationFormData['locationType'] })
                    }
                    className="input w-full"
                  >
                    <option value="branch">Branch</option>
                    <option value="headquarters">Headquarters</option>
                    <option value="warehouse">Warehouse</option>
                    <option value="store">Store</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="input w-full"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={form.zipCode}
                      onChange={(e) => setForm({ ...form, zipCode: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Contact Information</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Contact Name
                      </label>
                      <input
                        type="text"
                        value={form.contactName}
                        onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                        className="input w-full"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email
                        </label>
                        <input
                          type="email"
                          value={form.contactEmail}
                          onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                          className="input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={form.contactPhone}
                          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                          className="input w-full"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="btn-secondary flex-1"
                    disabled={isSubmitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : editingLocation ? (
                      'Update Location'
                    ) : (
                      'Create Location'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
