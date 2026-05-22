"use client"

import { useMemo } from "react"
import { useParams } from "next/navigation"
import { usePageTitleBreadcrumb } from "@/lib/navbar-context"
import { useActivity } from "@/hooks/use-activity"
import { useAuthorInfo } from "@/hooks/use-author-info"
import CertExplore from "@/components/explore/cert-explore"

export default function CertExplorePage() {
  const params = useParams()
  const did = useMemo(() => {
    const raw = params.did
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.did])
  const rkey = useMemo(() => {
    const raw = params.rkey
    return typeof raw === "string" ? decodeURIComponent(raw) : null
  }, [params.rkey])

  const { activity } = useActivity(did, rkey)
  const { info: authorInfo } = useAuthorInfo(did)

  const handle = authorInfo?.handle ?? null
  const certTitle = activity?.value.title ?? null
  usePageTitleBreadcrumb(
    handle && certTitle && did && rkey
      ? {
          left: { text: handle, href: `/profile/${encodeURIComponent(handle)}` },
          right: {
            text: `${certTitle} · context`,
            href: `/activity/${encodeURIComponent(did)}/${encodeURIComponent(rkey)}/explore`,
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

  const subjectUri = `at://${did}/org.hypercerts.claim.activity/${rkey}`

  return (
    <div className="cert-explore-page">
      <CertExplore
        subjectUri={subjectUri}
        subjectTitle={certTitle ?? "Cert"}
        subjectKind="Cert"
      />
    </div>
  )
}
