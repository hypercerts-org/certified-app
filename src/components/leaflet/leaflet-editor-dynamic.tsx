"use client"

import dynamic from "next/dynamic"
import type { LeafletEditorProps } from "./leaflet-editor"

/**
 * Dynamic import wrapper around the TipTap-backed `LeafletEditor`. Use
 * THIS from any caller — never `./leaflet-editor` directly — so the
 * ~9.7 MB TipTap + prosemirror dependency tree loads only when a user
 * actually enters edit mode, instead of shipping in every read-heavy
 * route bundle (profile / activity-detail / project-detail).
 *
 *   import LeafletEditor from "@/components/leaflet/leaflet-editor-dynamic"
 */
const LeafletEditor = dynamic<LeafletEditorProps>(
  () => import("./leaflet-editor"),
  {
    ssr: false,
    loading: () => <div className="leaflet-editor" aria-hidden />,
  },
)

export default LeafletEditor
export type { LeafletEditorProps } from "./leaflet-editor"
