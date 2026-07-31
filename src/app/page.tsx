import { IncidentCard } from "@/components/incident-card"
import { mockIncidents } from "@/lib/mock-data"
import { Activity } from "lucide-react"
import { AgentResult } from "@/lib/agents/types"

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* Page Header */}
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 mb-2">Command Center</h1>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
            System actively monitoring • 1 Critical Incident
          </div>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Main Column: Incident Feed */}
          <div className="col-span-1 md:col-span-8 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Activity size={16} />
                Active Incidents
              </h2>
            </div>
            
            <div className="grid gap-4">
              {mockIncidents.map((incident: AgentResult, index: number) => (
                <IncidentCard key={index} result={incident} />
              ))}
            </div>
          </div>

          {/* Sidebar Column: Quick Stats / Activity */}
          <div className="col-span-1 md:col-span-4 border-t md:border-t-0 md:border-l border-zinc-800 pt-8 md:pt-0 md:pl-8">
            <h2 className="text-sm font-medium text-zinc-400 mb-4">Orchestrator Status</h2>
            <div className="space-y-4 font-mono text-xs">
              <div className="p-3 bg-zinc-900 rounded-md border border-zinc-800">
                <span className="block text-zinc-500 mb-1">Agent Workers</span>
                <span className="text-emerald-400">3 / 3 Idle</span>
              </div>
              <div className="p-3 bg-zinc-900 rounded-md border border-zinc-800">
                <span className="block text-zinc-500 mb-1">DataHub MCP</span>
                <span className="text-amber-400">Connected</span>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}