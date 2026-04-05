import { Clock3 } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  minuteStep?: number;
};

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const pad = (value: number) => String(value).padStart(2, "0");

const parseTime = (value: string) => {
  const [rawHour = "08", rawMinute = "00"] = String(value || "08:00").split(":");
  let hour24 = Number(rawHour);
  const minute = Number(rawMinute);

  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) hour24 = 8;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  return {
    hour12,
    minute: Number.isFinite(minute) ? minute : 0,
    period,
  };
};

const to24Hour = (hour12: number, period: string) => {
  if (period === "AM") return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
};

const formatDisplay = (value: string) => {
  if (!value) return "";
  const { hour12, minute, period } = parseTime(value);
  return `${pad(hour12)}:${pad(minute)} ${period}`;
};

const buildMinuteOptions = (step: number) => {
  const minutes: number[] = [];
  for (let value = 0; value < 60; value += step) minutes.push(value);
  return minutes;
};

export function TimeField({
  value,
  onChange,
  placeholder = "Select time",
  label,
  className,
  minuteStep = 5,
}: TimeFieldProps) {
  const { hour12, minute, period } = parseTime(value);
  const minuteOptions = buildMinuteOptions(minuteStep);

  const updateValue = (nextHour12: number, nextMinute: number, nextPeriod: string) => {
    const hour24 = to24Hour(nextHour12, nextPeriod);
    onChange(`${pad(hour24)}:${pad(nextMinute)}`);
  };

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
              {value ? formatDisplay(value) : placeholder}
            </span>
            <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
              <Clock3 className="h-4 w-4" />
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={10}
        className="w-[248px] rounded-[28px] border-0 bg-white p-3 shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
      >
        <div className="grid grid-cols-[72px_72px_72px] gap-2 rounded-3xl bg-white p-1">
          <div className="h-64 space-y-1 overflow-y-auto pr-1">
            {HOURS_12.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateValue(option, minute, period)}
                className={cn(
                  "h-11 w-full rounded-2xl text-base font-semibold transition-all",
                  option === hour12 ? "bg-blue-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {pad(option)}
              </button>
            ))}
          </div>
          <div className="h-64 space-y-1 overflow-y-auto pr-1">
            {minuteOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateValue(hour12, option, period)}
                className={cn(
                  "h-11 w-full rounded-2xl text-base font-semibold transition-all",
                  option === minute ? "bg-blue-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {pad(option)}
              </button>
            ))}
          </div>
          <div className="h-64 space-y-1">
            {["AM", "PM"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => updateValue(hour12, minute, option)}
                className={cn(
                  "h-11 w-full rounded-2xl text-base font-semibold transition-all",
                  option === period ? "bg-blue-600 text-white shadow-sm" : "text-slate-700 hover:bg-slate-100",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
