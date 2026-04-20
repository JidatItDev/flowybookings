// Admin-only widget: lists all registered React Email templates and lets
// super_admins preview the rendered HTML in a modal using their previewData.
// Rendering happens client-side via @react-email/components — no email is sent.

import { useMemo, useState } from 'react'
import { createElement } from 'react'
import { render } from '@react-email/components'
import { Eye, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { useT } from '@/lib/i18n'

type RenderState =
  | { status: 'idle' }
  | { status: 'rendering' }
  | { status: 'ready'; html: string; subject: string }
  | { status: 'no-preview-data' }
  | { status: 'error'; message: string }

export function EmailTemplatesPreview() {
  const { t } = useT()
  const [openName, setOpenName] = useState<string | null>(null)
  const [renderState, setRenderState] = useState<RenderState>({ status: 'idle' })

  const entries = useMemo(
    () =>
      Object.entries(TEMPLATES)
        .map(([name, entry]) => ({
          name,
          displayName: entry.displayName ?? name,
          hasPreview: Boolean(entry.previewData),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [],
  )

  const handleOpen = async (name: string) => {
    setOpenName(name)
    const entry = TEMPLATES[name]
    if (!entry) return
    if (!entry.previewData) {
      setRenderState({ status: 'no-preview-data' })
      return
    }
    setRenderState({ status: 'rendering' })
    try {
      const html = await render(createElement(entry.component, entry.previewData))
      const subject =
        typeof entry.subject === 'function'
          ? entry.subject(entry.previewData)
          : entry.subject
      setRenderState({ status: 'ready', html, subject })
    } catch (err) {
      setRenderState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleClose = () => {
    setOpenName(null)
    setRenderState({ status: 'idle' })
  }

  const activeEntry = openName ? TEMPLATES[openName] : null
  const activeDisplay = activeEntry?.displayName ?? openName ?? ''

  return (
    <div className="rounded-2xl border border-border bg-card shadow-soft">
      <div className="border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">
            {t('adminMessages.emailTemplates')}
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('adminMessages.emailTemplatesSub')}
        </p>
      </div>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li
            key={e.name}
            className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{e.displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{e.name}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOpen(e.name)}
              disabled={!e.hasPreview}
              title={
                e.hasPreview ? undefined : t('adminMessages.noPreviewData')
              }
            >
              <Eye className="h-4 w-4" />
              {t('adminMessages.preview')}
            </Button>
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(openName)} onOpenChange={(o) => !o && handleClose()}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{activeDisplay}</DialogTitle>
            <DialogDescription>
              {renderState.status === 'ready'
                ? `${t('adminMessages.previewSubject')}: ${renderState.subject}`
                : t('adminMessages.previewDescription')}
            </DialogDescription>
          </DialogHeader>

          {renderState.status === 'rendering' && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {renderState.status === 'no-preview-data' && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t('adminMessages.noPreviewData')}
            </p>
          )}

          {renderState.status === 'error' && (
            <p className="py-10 text-center text-sm text-destructive">
              {renderState.message}
            </p>
          )}

          {renderState.status === 'ready' && (
            <div className="overflow-hidden rounded-xl border border-border bg-white">
              <iframe
                title={`${activeDisplay} preview`}
                srcDoc={renderState.html}
                sandbox=""
                className="h-[70vh] w-full bg-white"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
