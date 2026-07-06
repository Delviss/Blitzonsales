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

/* ------------------------------- navigation ------------------------------ */

const rollenLabels: Record<string, string> = {
  admin_gf: 'Admin / GF',
  teamleiter: 'Teamleiter',
  backoffice: 'Backoffice',
  aussendienst: 'Außendienst',
};

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
      { to: '/dashboard', label: 'Dashboard', icon: LayoutGrid },
      { to: '/provisionslaeufe', label: 'Provisionsläufe', icon: Wallet, roles: ['admin_gf', 'teamleiter', 'backoffice'] },
      { to: '/import', label: 'Import', icon: Upload, roles: ['admin_gf', 'teamleiter', 'backoffice'] },
    ],
  },
  {
    label: 'Stammdaten',
    items: [
      { to: '/verwaltung/organisationen', label: 'Organisationen', icon: Building2 },
      { to: '/verwaltung/verkaeufer', label: 'Verkäufer', icon: Users, roles: ['admin_gf', 'teamleiter', 'backoffice'] },
      { to: '/verwaltung/produkte', label: 'Produkte', icon: Package },
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
  const { dark, toggle } = useTheme();
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
        onClick={toggle}
        title={dark ? 'Helles Design' : 'Dunkles Design'}
      >
        {dark ? <Sun className="!size-3.5" /> : <Moon className="!size-3.5" />}
      </Button>
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

        <div key={location.pathname} className="flex-1 animate-fade-in p-4 md:p-6">
          {children ?? <Outlet />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
