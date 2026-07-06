import * as React from 'react';
import { PanelLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* A lean port of the shadcn sidebar: desktop rail that collapses to an icon
   strip, off-canvas overlay on mobile, state persisted in localStorage. */

const SIDEBAR_STORAGE_KEY = 'blitzon:sidebar';
const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_ICON = '3.25rem';

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within a SidebarProvider.');
  return ctx;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  React.useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function SidebarProvider({ children, className, style, ...props }: React.ComponentProps<'div'>) {
  const isMobile = useIsMobile();
  const [open, setOpenState] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) !== 'collapsed';
    } catch {
      return true;
    }
  });
  const [openMobile, setOpenMobile] = React.useState(false);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, value ? 'expanded' : 'collapsed');
    } catch {
      /* private mode */
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile(v => !v);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  const value = React.useMemo(
    () => ({ open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar }),
    [open, setOpen, openMobile, isMobile, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        data-state={open ? 'expanded' : 'collapsed'}
        style={{ '--sidebar-width': SIDEBAR_WIDTH, '--sidebar-width-icon': SIDEBAR_WIDTH_ICON, ...style } as React.CSSProperties}
        className={cn('group/sidebar-wrapper flex min-h-screen w-full', className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ children, className }: React.ComponentProps<'div'>) {
  const { open, openMobile, setOpenMobile, isMobile } = useSidebar();

  if (isMobile) {
    return (
      <>
        {openMobile && (
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpenMobile(false)}
            aria-hidden
          />
        )}
        <aside
          data-state={openMobile ? 'expanded' : 'collapsed'}
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300',
            openMobile ? 'translate-x-0' : '-translate-x-full',
            className,
          )}
        >
          {children}
        </aside>
      </>
    );
  }

  return (
    <aside
      data-state={open ? 'expanded' : 'collapsed'}
      className={cn(
        'group/sidebar sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-in-out',
        open ? 'w-[var(--sidebar-width)]' : 'w-[var(--sidebar-width-icon)]',
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7 text-muted-foreground hover:text-foreground', className)}
      onClick={e => {
        onClick?.(e);
        toggleSidebar();
      }}
      aria-label="Seitenleiste umschalten"
      {...props}
    >
      <PanelLeft />
    </Button>
  );
}

export function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return <main className={cn('relative flex min-h-screen w-full min-w-0 flex-1 flex-col bg-background', className)} {...props} />;
}

export function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 p-3', className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-1', className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 p-3', className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('relative flex w-full min-w-0 flex-col px-3 py-2', className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.ComponentProps<'div'>) {
  const { open, isMobile } = useSidebar();
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center rounded-md px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80 transition-opacity',
        !open && !isMobile && 'sr-only',
        className,
      )}
      {...props}
    />
  );
}

export function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('w-full text-sm', className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return <ul className={cn('flex w-full min-w-0 flex-col gap-0.5', className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li className={cn('group/menu-item relative', className)} {...props} />;
}

type SidebarMenuButtonProps = React.ComponentProps<'button'> & {
  asChild?: false;
  isActive?: boolean;
  tooltip?: string;
};

export const SidebarMenuButton = React.forwardRef<HTMLButtonElement, SidebarMenuButtonProps>(
  ({ className, isActive = false, tooltip, children, ...props }, ref) => {
    const { open, isMobile } = useSidebar();
    const collapsed = !open && !isMobile;
    return (
      <button
        ref={ref}
        type="button"
        data-active={isActive}
        title={collapsed ? tooltip : undefined}
        className={cn(
          'flex w-full items-center gap-2.5 overflow-hidden rounded-lg p-2 text-left text-[13px] font-medium text-sidebar-foreground outline-none transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          'data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground',
          'data-[active=true]:shadow-[inset_2px_0_0_theme(colors.brand)]',
          '[&_svg]:size-4 [&_svg]:shrink-0',
          collapsed && 'justify-center',
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export function SidebarMenuLabel({ children }: { children: React.ReactNode }) {
  const { open, isMobile } = useSidebar();
  if (!open && !isMobile) return null;
  return <span className="truncate">{children}</span>;
}
