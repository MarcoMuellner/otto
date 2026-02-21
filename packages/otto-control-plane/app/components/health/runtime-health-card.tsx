import type { RuntimeHealthSnapshot } from "../../server/health.server.js"
import { Button } from "../ui/button.js"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card.js"

type RuntimeHealthCardProps = {
  health: RuntimeHealthSnapshot
  refreshState: "idle" | "loading" | "error"
  onRefresh: () => Promise<void>
}

/**
 * Encapsulates runtime health presentation and refresh controls so status semantics stay
 * uniform across all pages that surface backend availability.
 */
export const RuntimeHealthCard = ({ health, refreshState, onRefresh }: RuntimeHealthCardProps) => {
  const statusClass = health.status === "ok" ? "text-[#147246]" : "text-[#eb3b3b]"

  return (
    <Card>
      <CardHeader className="flex items-start justify-between gap-3 max-[720px]:flex-col">
        <div>
          <CardDescription>Runtime Health</CardDescription>
          <CardTitle className={statusClass}>{health.runtimeStatus.toUpperCase()}</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshState === "loading"}
        >
          {refreshState === "loading" ? "Refreshing" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="m-0 text-[0.96rem]">{health.message}</p>
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <p className="m-0 text-[0.83rem] text-[#888888]">
          Last check: {new Date(health.checkedAt).toLocaleString()}
        </p>
        {refreshState === "error" ? (
          <p className="m-0 text-[0.83rem] text-[#eb3b3b]">
            Refresh failed. Check control-plane logs.
          </p>
        ) : null}
      </CardFooter>
    </Card>
  )
}
