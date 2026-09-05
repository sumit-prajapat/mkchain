import { useQuery } from '@tanstack/react-query';
import { endpoints } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, TrendingUp, BarChart3, Database } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

interface UsageData {
  date: string;
  analyses: number;
  api_calls: number;
  storage_gb: number;
}

interface UsageAnalyticsData {
  current_period: {
    analyses_count: number;
    api_calls_count: number;
    storage_used_gb: number;
  };
  historical: UsageData[];
}

export function UsageAnalytics() {
  const { data, isLoading, error } = useQuery<UsageAnalyticsData>({
    queryKey: ['usage-analytics'],
    queryFn: () => endpoints.getUsageHistory(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load usage analytics
      </div>
    );
  }

  const chartData = data.historical?.map((item) => ({
    date: format(new Date(item.date), 'MMM d'),
    analyses: item.analyses,
    apiCalls: item.api_calls,
    storage: parseFloat(item.storage_gb.toFixed(2)),
  })) || [];

  return (
    <div className="space-y-6">
      {/* Current Period Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Analyses</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.current_period.analyses_count}</div>
            <p className="text-xs text-muted-foreground">This billing period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Calls</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.current_period.api_calls_count.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">This billing period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.current_period.storage_used_gb.toFixed(2)} GB</div>
            <p className="text-xs text-muted-foreground">Current usage</p>
          </CardContent>
        </Card>
      </div>

      {/* Analyses Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Analyses Over Time</CardTitle>
          <CardDescription>Daily analysis count for the current billing period</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="analyses" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                name="Analyses"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* API Calls Trend */}
      <Card>
        <CardHeader>
          <CardTitle>API Calls Over Time</CardTitle>
          <CardDescription>Daily API call volume</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar 
                dataKey="apiCalls" 
                fill="hsl(var(--primary))" 
                name="API Calls"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Storage Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Usage Over Time</CardTitle>
          <CardDescription>Storage consumption in GB</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="storage" 
                stroke="hsl(var(--chart-2))" 
                strokeWidth={2}
                name="Storage (GB)"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
