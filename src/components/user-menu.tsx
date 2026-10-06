"use client";

import {
  DesktopIcon,
  GearIcon,
  MoonStarsIcon,
  SignOutIcon,
  SunIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

/** The signed-in user's avatar, opening theme, settings, and sign out. */
export function UserMenu() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const onSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex size-6 cursor-pointer items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground uppercase ring-1 ring-foreground/10 transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {user ? initialsOf(user.name, user.email) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {user && (
          <>
            <DropdownMenuLabel className="space-y-0.5">
              {user.name && (
                <div className="truncate text-xs font-medium text-foreground">
                  {user.name}
                </div>
              )}
              <div className="truncate text-xs font-normal">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <div className="flex min-h-7 items-center justify-between gap-2 py-1 pr-1 pl-2 text-xs">
          Theme
          <ThemeSwitcher />
        </div>
        {/* No settings page yet. */}
        <DropdownMenuItem disabled>
          <GearIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut}>
          <SignOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const THEMES = [
  { value: "system", label: "System", Icon: DesktopIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonStarsIcon },
];

/**
 * Segmented system/light/dark toggle. Plain buttons rather than menu items,
 * so picking a theme leaves the menu open to see the change.
 */
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  return (
    <fieldset
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-full p-0.5 ring-1 ring-foreground/10"
    >
      {THEMES.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30",
              active &&
                "bg-background text-foreground shadow-xs ring-1 ring-foreground/10",
            )}
          >
            <Icon className="size-3" />
          </button>
        );
      })}
    </fieldset>
  );
}

/** First and last initials of a name, else the first letter of the email. */
export function initialsOf(name: string | null | undefined, email: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return email.charAt(0);
  if (words.length === 1) return words[0].charAt(0);
  return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`;
}
