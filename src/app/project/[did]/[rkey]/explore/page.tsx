"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useProject } from "@/hooks/use-project"
import { useAuthorInfo } from "@/hooks/use-author-info"
import CertExplore from "@/components/explore/cert-explore"

export default function ProjectExplorePage() {
  const params = useParams()
  const did = useMemo(() => {
    const raw = params.did
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.did])
  const rkey = useMemo(() => {
    const raw = params.rkey
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.rkey])

  const { project } = useProject(did, rkey)
  const { info: authorInfo } = useAuthorInfo(did)

  const handle = authorInfo?.handle ?? null
  const projectTitle =
    (typeof project?.value.title === "string" && project.value.title) ||
    (typeof project?.value.name === "string" && project.value.name) ||
    null
  usePageTitleBreadcrumb(
    handle && projectTitle && did && rkey
      ? {
          left: { text: handle, href: `/profile/${encodeURIComponent(handle)}` },
          right: {
            text: `${projectTitle} · context`,
            href: `/project/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}/explore`,
          },
        }
      : null,
  )

  if (!did || !rkey) {
    return (
      <div className="cert-explore-page">
        <p className="ctx-empty">Malformed URL.</p>
      </div>
    )
  }

  const subjectUri = `at://${did}/org.hypercerts.collection/${rkey}`

  return (
    <div className="cert-explore-page">
      <CertExplore
        subjectUri={subjectUri}
        subjectTitle={projectTitle ?? "Project"}
        subjectKind="Project"
      />
    </div>
  )
}
