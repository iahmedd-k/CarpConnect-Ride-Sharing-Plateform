import { Calendar as CalendarIcon } from "lucide-react";
import { format, parseISO } from "date-fns";

import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateFieldProps = {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  placeholder?: string;
  label?: string;
  className?: string;
};

const toDate = (value: string) => {
  if (!value) return undefined;
  try {
    return parseISO(value);
  } catch {
    return undefined;
  }
};

const toIsoDate = (date?: Date) => {
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export function DateField({
  value,
  onChange,
  min,
  placeholder = "Select date",
  label,
  className,
}: DateFieldProps) {
  const selectedDate = toDate(value);
  const minDate = toDate(min || "");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "w-full rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 text-left transition-all hover:border-primary/30",
            className,
          )}
        >
          {label && (
            <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </span>
          )}
          <span className="flex items-center justify-between gap-3">
            <span className={cn("text-sm font-semibold leading-none", value ? "text-foreground" : "text-muted-foreground")}>
              {selectedDate ? format(selectedDate, "dd MMM yyyy") : placeholder}
            </span>
            <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
              <CalendarIcon className="h-4 w-4" />
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-auto rounded-[28px] border-0 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
      >
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => onChange(toIsoDate(date))}
          disabled={minDate ? { before: minDate } : undefined}
          className="rounded-3xl bg-white p-3"
          classNames={{
            months: "flex flex-col",
            month: "space-y-4",
            caption: "flex items-center justify-center relative px-8 pt-1",
            caption_label: "text-sm font-semibold text-slate-700",
            nav: "flex items-center gap-1",
            nav_button:
              "h-8 w-8 rounded-full border-0 bg-transparent p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700",
            nav_button_previous: "absolute left-1",
            nav_button_next: "absolute right-1",
            head_row: "flex justify-between",
            head_cell: "w-9 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-300",
            row: "mt-1 flex w-full justify-between",
            cell: "relative h-9 w-9 p-0 text-center text-sm",
            day: "h-9 w-9 rounded-full p-0 text-sm font-medium text-slate-700 hover:bg-slate-100",
            day_selected: "bg-orange-500 text-white hover:bg-orange-500 focus:bg-orange-500",
            day_today: "bg-slate-100 text-slate-900",
            day_outside: "text-slate-300 opacity-100",
            day_disabled: "text-slate-200",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
