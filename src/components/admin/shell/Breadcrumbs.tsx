"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/ui/breadcrumb";
import { breadcrumbTrail } from "@/lib/admin/nav";
import { cn } from "@/lib/admin/utils";

/** Group, screen and detail of the current console path (nav.ts). */
export function Breadcrumbs() {
  const pathname = usePathname();
  const trail = breadcrumbTrail(pathname);
  if (trail.length === 0) return <div className="min-w-0 flex-1" />;

  return (
    <Breadcrumb className="console-breadcrumb min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem className={cn("min-w-0", !last && "hidden sm:inline-flex")}>
                {last ? (
                  <BreadcrumbPage className="truncate font-semibold text-foreground">{crumb.label}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href} className="truncate">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="truncate">{crumb.label}</span>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator className="hidden sm:block" />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
