import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Clock, Database } from "lucide-react"
import { AgentResult } from "@/lib/agents/types"

// We map Claude's severity strings directly to Tailwind colors
const getSeverityStyles = (severity: string) => {
  switch (severity) {
    case "critical": 
      return { card: "border-l-rose-500", badge: "bg-rose-500/10 text-rose-500 border-rose-500/20" }
    case "high": 
      return { card: "border-l-orange-500", badge: "bg-orange-500/10 text-orange-500 border-orange-500/20" }
    case "medium": 
      return { card: "border-l-amber-500", badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" }
    case "low": 
      return { card: "border-l-blue-500", badge: "bg-blue-500/10 text-blue-500 border-blue-500/20" }
    default: 
      return { card: "border-l-zinc-600", badge: "bg-zinc-800 text-zinc-300 border-zinc-700" }
  }
}

const formatTimeAgo = (dateString: string) => {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function IncidentCard({ result }: { result: AgentResult }) {
  const primaryFinding = result.findings[0]
  if (!primaryFinding) return null

  const styles = getSeverityStyles(primaryFinding.severity)

  return (
    <Card className={`p-4 border-l-4 rounded-md bg-zinc-900 border-y-zinc-800 border-r-zinc-800 hover:bg-zinc-800 transition-colors cursor-pointer ${styles.card}`}>
      <div className="flex justify-between items-start mb-3">
        <span className="font-mono text-xs text-zinc-500 uppercase">{primaryFinding.id}</span>
        <Badge variant="outline" className={`uppercase text-[10px] tracking-wider ${styles.badge}`}>
          {primaryFinding.severity}
        </Badge>
      </div>
      
      <h3 className="text-sm font-medium text-zinc-100 leading-snug mb-4">
        {primaryFinding.summary}
      </h3>
      
      <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono mt-auto">
        <div className="flex items-center gap-1.5">
          <Clock size={14} className="text-zinc-600" />
          {formatTimeAgo(result.startedAt)}
        </div>
        
        {primaryFinding.relatedUrns && primaryFinding.relatedUrns.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Database size={14} className="text-zinc-600" />
            {primaryFinding.relatedUrns.length} Asset{primaryFinding.relatedUrns.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </Card>
  )
}