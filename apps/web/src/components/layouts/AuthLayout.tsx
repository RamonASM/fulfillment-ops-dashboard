import { LayoutDashboard } from 'lucide-react';

interface AuthLayoutProps {
  children: React.ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-primary flex-col justify-between p-12">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">Inventory IQ</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Intelligent Inventory
            <br />
            Management Platform
          </h1>
          <p className="text-lg text-primary-100 max-w-md">
            Replace manual spreadsheets with AI-powered insights. Get real-time
            visibility, predictive alerts, and smart recommendations.
          </p>

          {/* Feature highlights */}
          <div className="grid grid-cols-2 gap-4 pt-6">
            {[
              { label: 'Real-time Visibility', value: '30s' },
              { label: 'Stockout Prevention', value: '95%' },
              { label: 'Time Saved', value: '80%' },
              { label: 'Report Generation', value: '15min' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white/10 rounded-lg p-4">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-sm text-primary-200">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-sm text-primary-200">
          Powered by AI. Built for account managers.
        </div>
      </div>

      {/* Right panel - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
