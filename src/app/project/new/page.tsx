"use client"

import Link from "next/link"
import { ArrowLeft, FolderGit2 } from "lucide-react"
import Button from "@/components/ui/button"
import EmptyState from "@/components/ui/empty-state"
import { usePageTitle } from "@/lib/navbar-context"

/**
 * `/project/new` — placeholder destination for the "Create new
 * project" CTA on the profile Projects tab. The project editor
 * itself is still being built; surfacing a friendly placeholder
 * here keeps the navigation flow consistent and lets us validate
 * the entry point without blocking on the editor.
 *
 * Lives at a static segment under `/project/`. The dynamic
 * `[did]/[rkey]` route below requires two path segments, so this
 * page never collides.
 */
export default function CreateProjectPlaceholderPage() {
  usePageTitle("Create project")
  return (
    <div className="create-project-placeholder">
      <EmptyState
        icon={FolderGit2}
        title="Project editor — coming soon"
        description="The flow for creating and editing projects on Certified is in the works. Once it ships, this is where you'll launch into it."
      >
        <Link href="/">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden />
            Back home
          </Button>
        </Link>
      </EmptyState>
    </div>
  )
}
