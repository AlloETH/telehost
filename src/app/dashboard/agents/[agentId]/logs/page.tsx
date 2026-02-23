"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

export default function AgentLogsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const [logs, setLogs] = useState("");
  const [logType, setLogType] = useState<string>("");
  const [containerStatus, setContainerStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [tail, setTail] = useState(100);

  const fetchLogs = () => {
    fetch(`/api/agents/${agentId}/logs?tail=${tail}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || data.error || "No logs available");
        setLogType(data.type || "");
        setContainerStatus(data.status || "");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [agentId, tail]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/agents/${agentId}`}
            className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            &larr; Back to Agent
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Agent Logs</h1>
        </div>
        <div className="flex items-center gap-3">
          {containerStatus && (
            <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-500/20 text-blue-400">
              {containerStatus}
            </span>
          )}
          {logType && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                logType === "error"
                  ? "bg-red-500/20 text-red-400"
                  : logType === "runtime"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-gray-500/20 text-gray-400"
              }`}
            >
              {logType === "error" ? "Error" : logType === "runtime" ? "Runtime" : logType === "info" ? "Info" : logType}
            </span>
          )}
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            className="rounded-lg border border-[var(--border)] bg-[var(--secondary)] px-3 py-1.5 text-sm"
          >
            <option value={50}>Last 50 lines</option>
            <option value={100}>Last 100 lines</option>
            <option value={500}>Last 500 lines</option>
          </select>
          <button
            onClick={fetchLogs}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-auto rounded-xl border border-[var(--border)] bg-black p-4 max-h-[70vh]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-xs text-green-400 leading-relaxed">
            {logs}
          </pre>
        )}
      </div>
    </div>
  );
}
