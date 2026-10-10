"use client";

import { LayoutDashboard, ReceiptText, Upload } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";

const NAV_ITEMS = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Upload Receipt", href: "/upload", icon: Upload },
  { title: "Receipts", href: "/receipts", icon: ReceiptText },
] as const;

type AppSidebarProps = {
  user: { name: string | null; email: string | null };
};

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/dashboard"
          onClick={() => setOpenMobile(false)}
          className="px-2 py-1.5 text-base font-semibold text-sidebar-foreground"
        >
          {APP_NAME}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href} className="my-1">
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.href)}
                    render={
                      <Link href={item.href} onClick={() => setOpenMobile(false)} />
                    }
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex flex-col gap-3 p-2">
          <div className="min-w-0">
            {user.name && (
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {user.name}
              </p>
            )}
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
