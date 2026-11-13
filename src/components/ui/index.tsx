"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

/* ---------------- Button ---------------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" | "success"; size?: "sm" | "md" };
export function Button({ variant = "primary", size = "md", className, ...p }: ButtonProps) {
  const v = {
    primary: "bg-primary text-white hover:bg-primary/90",
    secondary: "bg-card text-fg border border-line hover:bg-subtle",
    danger: "bg-critical text-white hover:bg-critical/90",
    success: "bg-success text-white hover:bg-success/90",
    ghost: "text-muted hover:text-fg hover:bg-subtle",
  }[variant];
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50", size === "sm" ? "h-8 px-2.5" : "h-9 px-3.5", v, className)}
      {...p}
    />
  );
}

/* ---------------- Card ---------------- */
export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-card shadow-card", className)} {...p} />;
}
/** `icon` is accepted for backwards compatibility but intentionally not rendered. */
export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...p} />;
}

/* ---------------- Badge ---------------- */
export type Tone = "primary" | "success" | "warning" | "critical" | "cyan" | "purple" | "neutral";
const TONES: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary border-primary/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/30",
  critical: "bg-critical/10 text-critical border-critical/30",
  cyan: "bg-cyan/10 text-cyan border-cyan/25",
  purple: "bg-purple/10 text-purple border-purple/25",
  neutral: "bg-subtle text-muted border-line",
};
export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-px text-[11px] font-medium leading-5", TONES[tone], className)}>{children}</span>;
}

export function severityTone(s: string): Tone {
  return s === "critical" ? "critical" : s === "high" ? "warning" : s === "medium" ? "primary" : "neutral";
}

/* ---------------- Skeleton ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

/* ---------------- Stat strip ---------------- */
/** A single bordered strip of figures separated by hairlines – used instead of a row of identical cards. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-lg border border-line bg-line shadow-card", className)}>{children}</div>;
}
export function Stat({ label, value, hint, loading }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; loading?: boolean }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      {loading ? <Skeleton className="mt-2 h-6 w-20" /> : <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>}
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

/* ---------------- Form controls ---------------- */
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-9 w-full rounded-md border border-line bg-card px-2.5 text-sm text-fg", className)} {...p} />;
}
export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-9 w-full rounded-md border border-line bg-card px-2.5 text-sm text-fg placeholder:text-muted", className)} {...p} />;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Slider({ value, onChange, min = 0, max = 1, step = 0.05, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label: string }) {
  return (
    <SliderPrimitive.Root className="relative flex h-6 w-full touch-none select-none items-center" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
      <SliderPrimitive.Track className="relative h-1.5 grow rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-card shadow-card" />
    </SliderPrimitive.Root>
  );
}

/* ---------------- Modal ---------------- */
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string; children: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(720px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-line bg-card p-5 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-fg">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">{description ?? "Details"}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-fg" aria-label="Close">
              <X size={18} />
            </Dialog.Close>
          </div>
          <div className="mt-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------------- Page header & empty/error states ---------------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle && <p className="mt-0.5 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-critical/40 bg-critical/5 p-4">
      <p className="text-sm font-medium text-critical">That didn&apos;t work</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{children}</div>;
}

/** Quiet one-line reminder – the loud version lives in the top bar. */
export function SimBanner() {
  return (
    <p className="mb-4 border-l-2 border-warning pl-3 text-xs text-muted">
      <span className="font-medium text-warning">Simulation.</span> Attacks here run against a model of the IEEE 14-bus network, never against real equipment.
    </p>
  );
}
