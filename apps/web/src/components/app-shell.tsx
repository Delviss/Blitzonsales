import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Building2,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Minimize2,
  Moon,
  Package,
  RotateCw,
  ScrollText,
  Send,
  ShieldCheck,
  Sun,
  Upload,
  UserCog,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { getUser, logout } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLabel,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';

/* ----------------------------- theme handling ---------------------------- */

const THEME_KEY = 'blitzon:theme';

export function applyStoredTheme() {
  const stored = (() => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  })();
  const theme = stored === 'light' ? 'light' : 'dark';
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      /* private mode */
    }
  };
  return { dark, toggle };
}

/* An iOS-style dual-icon switch: the thumb slides behind the active icon, which
   lights up (sun → amber in light, moon → brand cyan in dark). Replaces the flat
   ghost icon-button so the mode you're in is unmistakable at a glance. */
function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={dark ? 'Zu hellem Design wechseln' : 'Zu dunklem Design wechseln'}
      title={dark ? 'Helles Design' : 'Dunkles Design'}
      onClick={toggle}
      className={cn(
        'relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border border-border bg-muted/70 p-0.5 outline-none transition-colors hover:border-brand/40 focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-0.5 h-6 w-6 rounded-full bg-card shadow-[0_2px_6px_rgba(0,0,0,0.25)] ring-1 ring-border transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          dark ? 'translate-x-[24px]' : 'translate-x-0',
        )}
      />
      <span className="relative z-10 flex h-6 w-6 items-center justify-center">
        <Sun className={cn('size-3.5 transition-colors', dark ? 'text-muted-foreground/40' : 'text-amber')} />
      </span>
      <span className="relative z-10 flex h-6 w-6 items-center justify-center">
        <Moon className={cn('size-3.5 transition-colors', dark ? 'text-brand' : 'text-muted-foreground/40')} />
      </span>
    </button>
  );
}

/* ------------------------------- navigation ------------------------------ */

const rollenLabels: Record<string, string> = {
  admin_gf: 'Admin / GF',
  backoffice: 'Backoffice',
  readonly: 'Nur Lesen',
  // Reserved portal roles (no Phase-1 UI) — labelled for the user menu only.
  aussendienst: 'Außendienst (Portal)',
  partner: 'Partner (Portal)',
  teamleiter: 'Teamleiter (Legacy)',
};

// I-05: Phase 1 is a Founder/Backoffice tool. Read surfaces are visible to
// Founder/Backoffice/read-only; operational surfaces exclude read-only. Portal
// roles reach no Phase-1 nav item.
const PHASE1_READ = ['admin_gf', 'backoffice', 'readonly'];
const PHASE1_OPS = ['admin_gf', 'backoffice'];

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Vertrieb',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid, roles: PHASE1_READ },
      { to: '/provisionslaeufe', label: 'Provisionsläufe', icon: Wallet, roles: PHASE1_READ },
      { to: '/import', label: 'Import', icon: Upload, roles: PHASE1_OPS },
    ],
  },
  {
    label: 'Stammdaten',
    items: [
      { to: '/verwaltung/organisationen', label: 'Organisationen', icon: Building2, roles: PHASE1_READ },
      { to: '/verwaltung/verkaeufer', label: 'Verkäufer', icon: Users, roles: PHASE1_READ },
      { to: '/verwaltung/produkte', label: 'Produkte', icon: Package, roles: PHASE1_READ },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/verwaltung/provisionsregeln', label: 'Provisionsregeln', icon: ScrollText, roles: ['admin_gf'] },
      { to: '/verwaltung/benutzer', label: 'Benutzer', icon: UserCog, roles: ['admin_gf'] },
    ],
  },
];

function usePageMeta(): { label: string; icon: React.ComponentType<{ className?: string }> } {
  const { pathname } = useLocation();
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return item;
    }
  }
  return { label: 'Dashboard', icon: LayoutGrid };
}

/* --------------------------------- pieces -------------------------------- */

function SidebarBrandRow() {
  const { open, isMobile, setOpen } = useSidebar();
  const collapsed = !open && !isMobile;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Seitenleiste ausklappen"
        className="flex h-8 w-full items-center justify-center rounded-lg text-brand transition-colors hover:bg-sidebar-accent"
      >
        <Zap className="size-4 fill-current" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="mr-auto flex items-center gap-1.5 pl-1 text-[13px] font-bold tracking-wide text-foreground">
        <Zap className="size-4 fill-current text-brand" />
        BlitzON <span className="font-medium text-muted-foreground">Control</span>
      </span>
      {!isMobile && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          title="Seitenleiste einklappen"
        >
          <Minimize2 className="!size-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={() => window.location.reload()}
        title="Neu laden"
      >
        <RotateCw className="!size-3.5" />
      </Button>
    </div>
  );
}

function SidebarChangelog() {
  const { open, isMobile } = useSidebar();
  if (!open && !isMobile) return null;
  return (
    <div className="mx-1 rounded-lg border border-sidebar-border bg-sidebar-accent/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Changelog</div>
      <div className="mt-1 text-[12.5px] font-semibold text-foreground">Neues Dashboard-Design</div>
      <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
        Überarbeitete Oberfläche und schnellere Auswertungen.
      </div>
      <a
        href="https://github.com/delviss/blitzonsales/blob/main/PROGRESS.md"
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-[11.5px] font-medium text-foreground underline underline-offset-2 hover:text-brand"
      >
        Mehr erfahren
      </a>
    </div>
  );
}

function SidebarFooterLinks() {
  const { open, isMobile } = useSidebar();
  const collapsed = !open && !isMobile;
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <a href="https://github.com/delviss/blitzonsales/blob/main/docs/admin-guide.md" target="_blank" rel="noreferrer">
          <SidebarMenuButton tooltip="Hilfe-Center">
            <LifeBuoy />
            <SidebarMenuLabel>Hilfe-Center</SidebarMenuLabel>
          </SidebarMenuButton>
        </a>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <a href="https://github.com/delviss/blitzonsales/tree/main/docs" target="_blank" rel="noreferrer">
          <SidebarMenuButton tooltip="Dokumentation">
            <BookOpen />
            <SidebarMenuLabel>Dokumentation</SidebarMenuLabel>
          </SidebarMenuButton>
        </a>
      </SidebarMenuItem>
      {!collapsed && (
        <div className="px-2 pt-1 text-[10.5px] text-muted-foreground/70">
          © {new Date().getFullYear()} BlitzON Consulting
        </div>
      )}
    </SidebarMenu>
  );
}

function HeaderUserMenu() {
  const user = getUser();
  const navigate = useNavigate();
  const initial = (user?.email?.[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full outline-none ring-ring focus-visible:ring-2" aria-label="Benutzermenü">
          <Avatar className="h-8 w-8 border border-border">
            <AvatarFallback className="bg-gradient-to-br from-brand-soft to-brand-deep text-xs font-black text-[#05090F]">
              {initial}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-semibold text-foreground">{user?.email}</div>
          <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3" />
            {rollenLabels[user?.rolle ?? ''] ?? user?.rolle}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red focus:text-red"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          <LogOut />
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HeaderNotifications() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label="Benachrichtigungen">
          <Bell className="!size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Benachrichtigungen</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-4 text-center text-xs text-muted-foreground">Keine neuen Benachrichtigungen.</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* -------------------------------- app shell ------------------------------ */

export function AppShell({ children }: { children?: React.ReactNode }) {
  const user = getUser();
  const location = useLocation();
  const navigate = useNavigate();
  const page = usePageMeta();
  const PageIcon = page.icon;

  const visible = (item: NavItem) => !item.roles || (user && item.roles.includes(user.rolle));

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border">
          <SidebarBrandRow />
        </SidebarHeader>

        <SidebarContent>
          {NAV_GROUPS.map(group => {
            const items = group.items.filter(visible);
            if (items.length === 0) return null;
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map(item => {
                      const Icon = item.icon;
                      const isActive =
                        location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                      return (
                        <SidebarMenuItem key={item.to}>
                          <SidebarMenuButton
                            isActive={isActive}
                            tooltip={item.label}
                            onClick={() => navigate(item.to)}
                          >
                            <Icon />
                            <SidebarMenuLabel>{item.label}</SidebarMenuLabel>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarChangelog />
          <SidebarFooterLinks />
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mx-1 h-4" />
          <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <PageIcon className="size-4 text-muted-foreground" />
            {page.label}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Separator orientation="vertical" className="mx-0.5 h-4" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label="Feedback senden"
              onClick={() => {
                window.location.href = 'mailto:support@blitzon.example?subject=BlitzON%20Control%20Feedback';
              }}
            >
              <Send className="!size-4" />
            </Button>
            <HeaderNotifications />
            <HeaderUserMenu />
          </div>
        </header>

        <div key={location.pathname} className="relative flex-1 animate-fade-in p-4 md:p-6">
          <div className="app-backdrop" />
          <div className="relative z-[1]">{children ?? <Outlet />}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
