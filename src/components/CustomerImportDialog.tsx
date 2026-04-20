import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, X, AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { shopKeys } from "@/lib/queries";
import { useT } from "@/lib/i18n";
import { assertNotImpersonating } from "@/components/ImpersonationBanner";
import {
  parseFile,
  presetMapping,
  applyMapping,
  IMPORT_SOURCE_LABELS,
  PLATFORM_INSTRUCTIONS,
  type ColumnMapping,
  type ImportRow,
  type ImportSource,
  type ParsedRow,
  type DedupStrategy,
  type ImportSummary,
} from "@/lib/customer-import";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  shopId: string | null;
  onImported?: () => void;
};

type Step = "upload" | "map" | "result";

const PLATFORMS: { value: ImportSource; label: string }[] = [
  { value: "csv", label: "CSV / Excel (algemeen)" },
  { value: "fresha", label: "Fresha" },
  { value: "salonized", label: "Salonized" },
  { value: "treatwell", label: "Treatwell" },
  { value: "simplybook", label: "SimplyBook" },
  { value: "planity", label: "Planity" },
];

export function CustomerImportDialog({ open, onClose, shopId, onImported }: Props) {
  const { t } = useT();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<"file" | "platform" | "manual">("file");
  const [source, setSource] = useState<ImportSource>("csv");
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({ full_name: null, email: null, phone: null, notes: null });
  const [dedup, setDedup] = useState<DedupStrategy>("skip");
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const reset = () => {
    setStep("upload");
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setMapping({ full_name: null, email: null, phone: null, notes: null });
    setSummary(null);
    setDedup("skip");
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 200);
  };

  const handleFile = async (file: File, src: ImportSource) => {
    try {
      const { headers: h, rows: r } = await parseFile(file);
      if (h.length === 0 || r.length === 0) {
        toast.error(t("customerImport.errEmpty"));
        return;
      }
      setFileName(file.name);
      setHeaders(h);
      setRows(r);
      setSource(src);
      setMapping(presetMapping(src, h));
      setStep("map");
    } catch (e) {
      toast.error((e as Error).message || t("customerImport.errParse"));
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file, source);
  };

  const { valid, invalid } = useMemo(() => {
    if (step !== "map") return { valid: [] as ImportRow[], invalid: [] as { row: number; reason: string }[] };
    return applyMapping(rows, mapping);
  }, [rows, mapping, step]);

  const importMut = useMutation({
    mutationFn: async (): Promise<ImportSummary> => {
      assertNotImpersonating();
      if (!shopId) throw new Error(t("errors.noActiveShop"));
      if (valid.length === 0) throw new Error(t("customerImport.errNoValid"));

      // Fetch existing emails to dedupe
      const emails = valid.map((v) => v.email).filter((e): e is string => !!e);
      const phones = valid.map((v) => v.phone).filter((p): p is string => !!p);
      const existingByEmail = new Map<string, string>();
      const existingByPhone = new Map<string, string>();

      if (emails.length > 0) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id, email")
          .eq("shop_id", shopId)
          .in("email", emails);
        (existing ?? []).forEach((c) => {
          if (c.email) existingByEmail.set(c.email.toLowerCase(), c.id);
        });
      }
      if (phones.length > 0) {
        const { data: existing } = await supabase
          .from("customers")
          .select("id, phone")
          .eq("shop_id", shopId)
          .in("phone", phones);
        (existing ?? []).forEach((c) => {
          if (c.phone) existingByPhone.set(c.phone, c.id);
        });
      }

      const now = new Date().toISOString();
      const toInsert: Array<{
        shop_id: string;
        full_name: string;
        email: string | null;
        phone: string | null;
        notes: string | null;
        import_source: ImportSource;
        imported_at: string;
      }> = [];
      const toUpdate: Array<{ id: string; patch: Record<string, unknown> }> = [];
      let skipped = 0;
      let withoutEmail = 0;
      const errors: { row: number; reason: string }[] = [...invalid];

      valid.forEach((v, idx) => {
        const dupId =
          (v.email && existingByEmail.get(v.email)) ||
          (v.phone && existingByPhone.get(v.phone)) ||
          null;
        if (!v.email) withoutEmail += 1;
        if (dupId) {
          if (dedup === "skip") {
            skipped += 1;
            return;
          }
          toUpdate.push({
            id: dupId,
            patch: {
              full_name: v.full_name,
              email: v.email,
              phone: v.phone,
              notes: v.notes,
              import_source: source,
              imported_at: now,
            },
          });
          return;
        }
        toInsert.push({
          shop_id: shopId,
          full_name: v.full_name,
          email: v.email,
          phone: v.phone,
          notes: v.notes,
          import_source: source,
          imported_at: now,
        });
      });

      let inserted = 0;
      let updated = 0;

      // Insert in batches of 200 to avoid payload limits
      const BATCH = 200;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const slice = toInsert.slice(i, i + BATCH);
        const { error, count } = await supabase
          .from("customers")
          .insert(slice, { count: "exact" });
        if (error) {
          errors.push({ row: i, reason: error.message });
        } else {
          inserted += count ?? slice.length;
        }
      }

      for (const u of toUpdate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("customers").update(u.patch as any).eq("id", u.id);
        if (error) errors.push({ row: 0, reason: `Update ${u.id}: ${error.message}` });
        else updated += 1;
      }

      return { inserted, updated, skipped, withoutEmail, errors };
    },
    onSuccess: async (s) => {
      setSummary(s);
      setStep("result");
      if (shopId) qc.invalidateQueries({ queryKey: shopKeys.customers(shopId) });
      onImported?.();

      // Activity-log entry zodat admins (LiveEventFeed) en de shop-eigenaar
      // de import terugzien. Failures stil negeren — de import zelf is al klaar.
      if (shopId && (s.inserted > 0 || s.updated > 0)) {
        try {
          await supabase.from("activity_log").insert({
            entity: "customers",
            action: "customers_imported",
            shop_id: shopId,
            metadata: {
              source,
              file_name: fileName,
              inserted: s.inserted,
              updated: s.updated,
              skipped: s.skipped,
              without_email: s.withoutEmail,
              errors: s.errors.length,
            },
          });
        } catch (err) {
          console.error("[customer-import] activity_log insert failed", err);
        }
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadErrorReport = () => {
    if (!summary) return;
    const lines = ["row,reason", ...summary.errors.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("customerImport.title")}</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="file" className="flex-1">{t("customerImport.tabCsv")}</TabsTrigger>
              <TabsTrigger value="platform" className="flex-1">{t("customerImport.tabPlatform")}</TabsTrigger>
              <TabsTrigger value="manual" className="flex-1">{t("customerImport.tabManual")}</TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">{t("customerImport.csvIntro")}</p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition",
                  dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/50",
                )}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">{t("customerImport.dropZone")}</p>
                <p className="text-xs text-muted-foreground">{t("customerImport.acceptedFormats")}</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f, "csv");
                  e.target.value = "";
                }}
              />
            </TabsContent>

            <TabsContent value="platform" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">{t("customerImport.platformIntro")}</p>
              <div>
                <Label>{t("customerImport.fromPlatform")}</Label>
                <Select value={source} onValueChange={(v) => setSource(v as ImportSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.filter((p) => p.value !== "csv").map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {PLATFORM_INSTRUCTIONS[source] && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                  {PLATFORM_INSTRUCTIONS[source]}
                </div>
              )}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition",
                  dragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/50",
                )}
              >
                <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
                <p className="text-sm font-medium">{t("customerImport.dropZoneShort")}</p>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-3 pt-4">
              <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center">
                <Plus className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{t("customerImport.manualTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("customerImport.manualHint")}</p>
                <Button variant="hero" className="mt-4" onClick={handleClose}>
                  <Plus className="h-4 w-4" /> {t("customerImport.manualCta")}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("customerImport.fileLabel")}: <span className="font-medium text-foreground">{fileName}</span>
              </span>
              <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground">
                {t("customerImport.changeFile")}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <MappingSelect label={t("customerImport.mapName")} value={mapping.full_name} headers={headers} required onChange={(v) => setMapping({ ...mapping, full_name: v })} />
              <MappingSelect label={t("customerImport.mapEmail")} value={mapping.email} headers={headers} onChange={(v) => setMapping({ ...mapping, email: v })} />
              <MappingSelect label={t("customerImport.mapPhone")} value={mapping.phone} headers={headers} onChange={(v) => setMapping({ ...mapping, phone: v })} />
              <MappingSelect label={t("customerImport.mapNotes")} value={mapping.notes} headers={headers} onChange={(v) => setMapping({ ...mapping, notes: v })} />
            </div>

            <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs">
              <p className="font-medium text-foreground">{t("customerImport.dedupTitle")}</p>
              <div className="mt-2 flex gap-3">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={dedup === "skip"} onChange={() => setDedup("skip")} />
                  <span>{t("customerImport.dedupSkip")}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={dedup === "merge"} onChange={() => setDedup("merge")} />
                  <span>{t("customerImport.dedupMerge")}</span>
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">{t("customerImport.previewTitle")} <span className="text-muted-foreground font-normal">({t("customerImport.firstFive")})</span></p>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left">{t("customerImport.colName")}</th>
                      <th className="px-2 py-1.5 text-left">{t("customerImport.colEmail")}</th>
                      <th className="px-2 py-1.5 text-left">{t("customerImport.colPhone")}</th>
                      <th className="px-2 py-1.5 text-left">{t("customerImport.colNotes")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {valid.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{r.full_name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.email ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.phone ?? "—"}</td>
                        <td className="px-2 py-1.5 truncate max-w-[200px] text-muted-foreground">{r.notes ?? "—"}</td>
                      </tr>
                    ))}
                    {valid.length === 0 && (
                      <tr><td colSpan={4} className="px-2 py-3 text-center text-muted-foreground">{t("customerImport.noPreviewRows")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-success-foreground" />{t("customerImport.foundCount", { count: String(valid.length) })}</span>
              {invalid.length > 0 && (
                <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />{t("customerImport.invalidCount", { count: String(invalid.length) })}</span>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>{t("customers.cancel")}</Button>
              <Button
                variant="hero"
                onClick={() => importMut.mutate()}
                disabled={!mapping.full_name || valid.length === 0 || importMut.isPending}
              >
                {importMut.isPending ? t("customerImport.importing") : t("customerImport.importNow", { count: String(valid.length) })}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "result" && summary && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/20 p-5 text-sm">
              <p className="text-base font-semibold">{t("customerImport.resultTitle")}</p>
              <ul className="mt-3 space-y-1.5">
                <li>✅ <span className="font-medium">{summary.inserted}</span> {t("customerImport.resultInserted")}</li>
                {summary.updated > 0 && <li>🔄 <span className="font-medium">{summary.updated}</span> {t("customerImport.resultUpdated")}</li>}
                {summary.skipped > 0 && <li>⏭️ <span className="font-medium">{summary.skipped}</span> {t("customerImport.resultSkipped")}</li>}
                {summary.withoutEmail > 0 && <li>⚠️ <span className="font-medium">{summary.withoutEmail}</span> {t("customerImport.resultNoEmail")}</li>}
                {summary.errors.length > 0 && <li className="text-destructive">❌ <span className="font-medium">{summary.errors.length}</span> {t("customerImport.resultErrors")}</li>}
              </ul>
            </div>
            <DialogFooter>
              {summary.errors.length > 0 && (
                <Button variant="outline" onClick={downloadErrorReport}>
                  <X className="h-4 w-4" /> {t("customerImport.downloadErrors")}
                </Button>
              )}
              <Button variant="hero" onClick={handleClose}>{t("customerImport.viewImported")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MappingSelect({
  label,
  value,
  headers,
  onChange,
  required,
}: {
  label: string;
  value: string | null;
  headers: string[];
  onChange: (v: string | null) => void;
  required?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? null : v)}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">—</SelectItem>
          {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
