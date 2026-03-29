import { cn } from "@/lib/utils";

type BrandLogoProps = {
  compact?: boolean;
  dark?: boolean;
  iconClassName?: string;
  textClassName?: string;
  className?: string;
};

const BrandLogo = ({
  compact = false,
  dark = false,
  iconClassName,
  textClassName,
  className,
}: BrandLogoProps) => {
  const textTone = dark ? "text-white" : "text-foreground";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow",
          compact && "h-9 w-9 rounded-xl",
          iconClassName
        )}
      >
        <svg
          viewBox="0 0 64 64"
          className="h-6 w-6 text-white"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M15 37L21 25C22.1 22.9 24.3 21.5 26.7 21.5H37.5C40.6 21.5 43.4 23.2 44.8 26L48.8 34.2C49.6 35.8 48.4 37.7 46.6 37.7H15Z"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.5 37.7V41.5C18.5 43.4 20.1 45 22 45H42C43.9 45 45.5 43.4 45.5 41.5V37.7"
            stroke="currentColor"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="23.5" cy="45.5" r="3.5" fill="currentColor" />
          <circle cx="40.5" cy="45.5" r="3.5" fill="currentColor" />
          <path
            d="M31.5 13.5C37.3 14.5 41.8 19 42.8 24.8"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M31.8 26.5C28.8 23.4 27.7 18.9 28.8 14.8C32.9 15.9 37.3 17 40.4 20.1C37.8 25.3 34.9 26.7 31.8 26.5Z"
            fill="currentColor"
            opacity="0.95"
          />
          <path
            d="M14 30C18.2 25.8 23.4 22.8 29 21"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeDasharray="3.5 4"
            opacity="0.95"
          />
        </svg>
      </div>

      {!compact && (
        <span className={cn("font-display text-xl font-bold tracking-tight", textTone, textClassName)}>
          Carp<span className="text-gradient-primary">Connect</span>
        </span>
      )}
    </div>
  );
};

export default BrandLogo;
