import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Sparkles, MessageSquare, Send, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface InsightSummary {
  clientId: string;
  clientName: string;
  generatedAt: string;
  overview: {
    totalProducts: number;
    evergreenCount: number;
    eventCount: number;
    activeAlerts: number;
    criticalAlerts: number;
    riskLevel: string;
    riskScore: number;
  };
  keyInsights: string[];
  recommendations: string[];
  narrative: string;
}

interface AIResponse {
  type: string;
  intent: string;
  response: string;
  suggestedAction?: string;
  suggestedQueries?: string[];
}

interface AIInsightsProps {
  clientId?: string;
}

export function AIInsights({ clientId }: AIInsightsProps) {
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);

  const { data: summary, isLoading } = useQuery<InsightSummary>({
    queryKey: ['ai', 'insights', 'summary', clientId],
    queryFn: () => api.get<InsightSummary>(`/ai/insights/summary/${clientId}`),
    enabled: !!clientId,
    refetchInterval: 10 * 60 * 1000, // Refresh every 10 minutes
  });

  const handleAskQuestion = async () => {
    if (!question.trim()) return;

    setIsAsking(true);
    try {
      const response = await api.post<AIResponse>('/ai/ask', { query: question });
      setAiResponse(response);
    } catch (error) {
      toast.error('Failed to get AI response');
      if ((import.meta as any).env?.DEV) console.error('Failed to get AI response:', error);
    } finally {
      setIsAsking(false);
    }
  };

  const handleSuggestedQuery = (query: string) => {
    setQuestion(query);
    setAiResponse(null);
  };

  return (
    <div className="space-y-6">
      {/* AI Chat Interface */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Ask Your Data</h2>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion()}
              placeholder="Which products need attention this week?"
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <button
            onClick={handleAskQuestion}
            disabled={isAsking || !question.trim()}
            className="btn btn-primary px-4"
          >
            {isAsking ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Suggested queries */}
        {!aiResponse && (
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              'Which products are at risk?',
              'Show me products needing attention',
              'What items are stocked out?',
              'Generate a reorder list',
            ].map((query) => (
              <button
                key={query}
                onClick={() => handleSuggestedQuery(query)}
                className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-full text-gray-700 transition-colors"
              >
                {query}
              </button>
            ))}
          </div>
        )}

        {/* AI Response */}
        {aiResponse && (
          <div className="mt-4 p-4 bg-primary/5 border border-primary/10 rounded-lg">
            <p className="text-gray-700">{aiResponse.response}</p>
            {aiResponse.suggestedQueries && (
              <div className="mt-3 flex flex-wrap gap-2">
                {aiResponse.suggestedQueries.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleSuggestedQuery(query)}
                    className="text-xs bg-white hover:bg-gray-50 px-3 py-1.5 rounded-full text-gray-700 border transition-colors"
                  >
                    {query}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Client Summary */}
      {clientId && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">AI Summary</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            </div>
          ) : summary ? (
            <div className="space-y-4">
              {/* Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.overview.totalProducts}
                  </div>
                  <div className="text-xs text-gray-500">Products</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.overview.activeAlerts}
                  </div>
                  <div className="text-xs text-gray-500">Active Alerts</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.overview.riskScore}
                  </div>
                  <div className="text-xs text-gray-500">Risk Score</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${
                    summary.overview.riskLevel === 'critical' ? 'text-red-600' :
                    summary.overview.riskLevel === 'high' ? 'text-orange-600' :
                    summary.overview.riskLevel === 'moderate' ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {summary.overview.riskLevel.toUpperCase()}
                  </div>
                  <div className="text-xs text-gray-500">Risk Level</div>
                </div>
              </div>

              {/* Narrative */}
              <div className="p-4 bg-primary/5 rounded-lg">
                <p className="text-gray-700">{summary.narrative}</p>
              </div>

              {/* Key Insights */}
              {summary.keyInsights.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Key Insights</h3>
                  <ul className="space-y-1">
                    {summary.keyInsights.map((insight, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-primary">•</span>
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {summary.recommendations.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Recommendations</h3>
                  <ul className="space-y-1">
                    {summary.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                        <span className="text-green-500">→</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a client to view AI insights
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AIInsights;
