"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { NotificationBell } from "./dashboard/NotificationBell";
import { HelpCenter } from "./HelpCenter";
import { ThemeSwitcher } from "./theme/ThemeSwitcher";

export function Navbar() {
    const pathname = usePathname();
    const isAdmin = Boolean(pathname?.startsWith("/admin"));
    const badge =
        pathname === "/" ? "Developer portal" : isAdmin ? "Admin" : null;

    return (
        <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/70 backdrop-blur-xl transition-all">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
                <div className="flex items-center gap-2">
                    <Link href="/" className="group flex items-center space-x-2 transition-opacity hover:opacity-90">
                        <Image src="/logo.png" alt="Fluid Logo" width={32} height={32} className="rounded-lg shadow-sm" />
                        <span className="text-xl font-bold tracking-tight text-foreground">
                            Fluid
                        </span>
                        {badge ? (
                        <span className="hidden max-w-[11rem] truncate rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:inline-block">
                            {badge}
                        </span>
                        ) : null}
                    </Link>
                </div>

                <nav className="flex items-center gap-4 sm:gap-8">
                    <Link
                        href="/plugins"
                        className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
                    >
                        Plugins
                    </Link>
                    <Link
                        href="/sdk"
                        className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
                    >
                        SDKs
                    </Link>
                    <Link
                        href="/changelog"
                        className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-block"
                    >
                        Changelog
                    </Link>
                    <ThemeSwitcher />
                    <HelpCenter />
                    {isAdmin && <NotificationBell />}
                </nav>
            </div>
        </header>
    );
}
