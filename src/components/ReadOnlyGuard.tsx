// Wrapper voor knoppen/forms die uitgeschakeld moeten zijn tijdens impersonate.
// Toont een tooltip "Alleen-lezen tijdens impersonate" boven de gedisablede actie.

import * as React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useImpersonationReadOnly } from "./ImpersonationBanner"
import { useT } from "@/lib/i18n"

interface ReadOnlyGuardProps {
  children: React.ReactElement
  /** Of de child sowieso disabled is (combineer met read-only). */
  alsoDisabled?: boolean
}

/**
 * Wrap een knop of trigger om die automatisch te disablen wanneer een
 * super_admin een shop "bekijkt als" (impersonate). Toont een tooltip die
 * uitlegt waarom.
 *
 * Werkt op elk component dat een `disabled` prop accepteert (Button, button,
 * IconButton, etc.).
 */
export function ReadOnlyGuard({ children, alsoDisabled }: ReadOnlyGuardProps) {
  const readOnly = useImpersonationReadOnly()
  const { t } = useT()
  const disabled = readOnly || Boolean(alsoDisabled)

  const child = React.cloneElement(children, {
    disabled,
    "aria-disabled": disabled,
  } as Record<string, unknown>)

  if (!readOnly) return child

  return (
    <TooltipProvider>
      <Tooltip>
        {/* span wrapper zodat tooltip ook werkt op disabled buttons */}
        <TooltipTrigger asChild>
          <span className="inline-flex">{child}</span>
        </TooltipTrigger>
        <TooltipContent>{t("impersonate.readOnlyTooltip")}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
