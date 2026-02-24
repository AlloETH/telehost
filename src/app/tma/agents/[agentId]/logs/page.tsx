"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { useTelegramBackButton } from "@/lib/hooks/use-telegram";

export default function TMAAgentLogsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const router = useRouter();
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(true);
  const [tail, setTail] = useState(100);

  useTelegramBackButton(() => router.push(`/tma/agents/${agentId}`));

  const fetchLogs = () => {
    fetch(`/api/agents/${agentId}/logs?tail=${tail}`)
      .then((r) => r.json())
      .then((data) => setLogs(data.logs || data.error || "No logs available"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [agentId, tail]);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-lg font-bold">Logs</h1>
        <select
          value={tail}
          onChange={(e) => setTail(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-base appearance-none"
        >
          <option value={50}>50 lines</option>
          <option value={100}>100 lines</option>
          <option value={500}>500 lines</option>
        </select>
      </div>

      <div className="overflow-auto rounded-xl border border-[var(--border)] bg-black p-3 max-h-[calc(100vh-8rem)] -webkit-overflow-scrolling-touch" style={{ WebkitOverflowScrolling: "touch" }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-green-400 leading-relaxed">
            {logs}
          </pre>
        )}
      </div>
    </div>
  );
}
