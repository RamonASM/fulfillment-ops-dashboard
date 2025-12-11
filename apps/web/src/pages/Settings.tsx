import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';
import { api } from '@/api/client';
import { User, Bell, Users, Plus, Loader2, X, Shield } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operations_manager' | 'account_manager';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  clients: { id: string; name: string; code: string }[];
}

interface PortalUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  client: { id: string; name: string; code: string };
}

export default function Settings() {
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  // Profile state
  const [name, setName] = useState(user?.name || '');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);

  // Modal states
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', role: 'account_manager' as const });

  // Fetch admin users (admin only)
  const { data: adminUsers, isLoading: loadingAdminUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<{ data: AdminUser[] }>('/users'),
    enabled: isAdmin,
  });

  // Fetch portal users (admin and account managers)
  const { data: portalUsers, isLoading: loadingPortalUsers } = useQuery({
    queryKey: ['portal-users'],
    queryFn: () => api.get<{ data: PortalUser[] }>('/users/portal'),
    enabled: isAdmin || user?.role === 'account_manager',
  });

  // Create admin user mutation
  const createUserMutation = useMutation({
    mutationFn: (data: { email: string; name: string; password: string; role: string }) =>
      api.post('/users', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setShowCreateUserModal(false);
      setNewUser({ email: '', name: '', password: '', role: 'account_manager' });
      toast.success('User created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create user');
    },
  });

  // Toggle user active status
  const toggleUserMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/users/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('User updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.email || !newUser.name || !newUser.password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (newUser.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    createUserMutation.mutate(newUser);
  };

  const handleSaveProfile = () => {
    // TODO: Implement profile update API
    toast.success('Profile saved');
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-100 text-purple-700';
      case 'operations_manager':
        return 'bg-blue-100 text-blue-700';
      case 'account_manager':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">
          Manage your account and {isAdmin && 'team '}preferences
        </p>
      </div>

      {/* Profile section */}
      <div className="card">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input max-w-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              defaultValue={user?.email || ''}
              className="input max-w-md"
              disabled
            />
            <p className="text-xs text-gray-500 mt-1">
              Contact your administrator to change your email
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getRoleBadgeColor(user?.role || '')}`}>
              <Shield className="w-3 h-3 mr-1" />
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
          <button onClick={handleSaveProfile} className="btn-primary mt-2">
            Save Profile
          </button>
        </div>
      </div>

      {/* Notifications section */}
      <div className="card">
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Bell className="w-5 h-5 text-gray-400" />
          <h2 className="font-semibold text-gray-900">Notifications</h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Email Notifications</p>
              <p className="text-sm text-gray-500">
                Receive email alerts for critical stock issues
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">Push Notifications</p>
              <p className="text-sm text-gray-500">
                Browser notifications for real-time alerts
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => setPushNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* User Management (Admin only) */}
      {isAdmin && (
        <div className="card">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-gray-400" />
              <h2 className="font-semibold text-gray-900">Team Members</h2>
            </div>
            <button
              onClick={() => setShowCreateUserModal(true)}
              className="btn-primary btn-sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add User
            </button>
          </div>
          <div className="p-4">
            {loadingAdminUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {adminUsers?.data?.map((adminUser) => (
                  <div
                    key={adminUser.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      adminUser.isActive ? 'border-border bg-white' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                        <span className="text-primary-600 font-medium">
                          {adminUser.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className={`font-medium ${adminUser.isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                          {adminUser.name}
                          {adminUser.id === user?.id && (
                            <span className="ml-2 text-xs text-gray-400">(You)</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">{adminUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(adminUser.role)}`}>
                        {adminUser.role.replace('_', ' ')}
                      </span>
                      {adminUser.id !== user?.id && (
                        <button
                          onClick={() => toggleUserMutation.mutate({
                            id: adminUser.id,
                            isActive: !adminUser.isActive,
                          })}
                          className={`text-sm px-2 py-1 rounded ${
                            adminUser.isActive
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-green-600 hover:bg-green-50'
                          }`}
                        >
                          {adminUser.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {(!adminUsers?.data || adminUsers.data.length === 0) && (
                  <p className="text-center text-gray-500 py-4">No team members found</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Portal Users section (Admin and Account Managers) */}
      {(isAdmin || user?.role === 'account_manager') && (
        <div className="card">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <Users className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Portal Users (Clients)</h2>
          </div>
          <div className="p-4">
            {loadingPortalUsers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {portalUsers?.data?.map((portalUser) => (
                  <div
                    key={portalUser.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                        <span className="text-emerald-600 font-medium">
                          {portalUser.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{portalUser.name}</p>
                        <p className="text-sm text-gray-500">{portalUser.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 bg-gray-100 px-2 py-1 rounded">
                        {portalUser.client?.name || 'No client'}
                      </span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        {portalUser.role}
                      </span>
                    </div>
                  </div>
                ))}
                {(!portalUsers?.data || portalUsers.data.length === 0) && (
                  <p className="text-center text-gray-500 py-4">No portal users found</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreateUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreateUserModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-gray-900">Add Team Member</h2>
                <button
                  onClick={() => setShowCreateUserModal(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleCreateUser} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    className="input"
                    placeholder="John Smith"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="input"
                    placeholder="john@company.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="input"
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <select
                    value={newUser.role}
                    onChange={(e) => setNewUser({ ...newUser, role: e.target.value as typeof newUser.role })}
                    className="input"
                  >
                    <option value="account_manager">Account Manager</option>
                    <option value="operations_manager">Operations Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateUserModal(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    className="btn-primary flex-1"
                  >
                    {createUserMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Creating...
                      </>
                    ) : (
                      'Create User'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
