import { Check } from "lucide-react"

export type WorkflowStep = "area" | "imagery" | "analysis" | "route"

const workflowSteps: Array<{ id: WorkflowStep; label: string }> = [
  { id: "area", label: "Area" },
  { id: "imagery", label: "Imagery" },
  { id: "analysis", label: "Analysis" },
  { id: "route", label: "Route" },
]

export function WorkflowProgress({ currentStep }: { currentStep: WorkflowStep }) {
  const currentIndex = workflowSteps.findIndex((step) => step.id === currentStep)

  return (
    <ol className="hidden items-center gap-2 sm:flex" aria-label="Workflow progress">
      {workflowSteps.map((step, index) => {
        const complete = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={step.id} className="flex items-center gap-2 text-[11px]">
            <span
              className={`flex items-center gap-1 ${active ? "text-cyan-300" : complete ? "text-slate-300" : "text-slate-600"}`}
              aria-current={active ? "step" : undefined}
            >
              {complete ? <Check className="size-3" aria-hidden="true" /> : `${index + 1}.`}
              {step.label}
            </span>
            {index < workflowSteps.length - 1 && <span className="h-px w-5 bg-slate-800" />}
          </li>
        )
      })}
    </ol>
  )
}
