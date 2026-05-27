"use client"

import { useEffect, useRef, useState } from "react"
import { useEditor, EditorContent, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List as BulletIcon,
  ListOrdered,
  Link as LinkIcon,
  Youtube as YoutubeIcon,
} from "lucide-react"
import LinkDialog, { type LinkDialogResult } from "./link-dialog"
import EmbedDialog, { type EmbedDialogResult } from "./embed-dialog"
import {
  LeafletImage,
  type LeafletImageStorage,
} from "./nodes/leaflet-image-node"
import { LeafletIframe } from "./nodes/leaflet-iframe-node"
import { asLinearDocument } from "@/lib/leaflet/guards"
import { tiptapToLinearDocument } from "@/lib/leaflet/from-tiptap"
import { linearDocumentToTipTap } from "@/lib/leaflet/to-tiptap"
import { safeHttpUrl } from "@/lib/utils/safe-url"
import type { LinearDocument } from "@/lib/leaflet/types"
import type { UploadedBlob } from "@/lib/atproto/profile"

/**
 * Reusable TipTap-backed editor for `pub.leaflet.pages.linearDocument`
 * content. Wraps StarterKit + Link and converts to/from the leaflet
 * wire format via the helpers in `@/lib/leaflet/`.
 *
 * Use this anywhere we let a user write rich text that should
 * round-trip through atproto records — currently the org
 * `longDescription`, future cert / project descriptions, etc. The
 * editor is the only place in the app that imports TipTap; every
 * other surface stays decoupled and consumes plain `LinearDocument`
 * values.
 */

export interface LeafletEditorProps {
  /** Current value — string (rendered as a single paragraph in the
   *  editor), structured `LinearDocument`, or null (renders an empty
   *  document). */
  value: LinearDocument | string | null | undefined
  /** Called with the structured document whenever the editor's
   *  content changes. Empty documents (no blocks / only empty text)
   *  still fire — the caller decides whether to persist or drop. */
  onChange: (next: LinearDocument) => void
  /** Placeholder shown when the editor is empty. */
  placeholder?: string
  /** Extra class for the outer wrapper. */
  className?: string
  /** When true, the toolbar collapses to a single line of mark buttons
   *  (no heading dropdown). Useful for compact surfaces. */
  minimal?: boolean
  /** Disable editing — the editor still renders the current value but
   *  ignores input. */
  readOnly?: boolean
  ariaLabel?: string
  /** DID of the repo that owns blobs referenced by image nodes. The
   *  node view uses this to build the `getBlob` URL for the editing
   *  preview. Image upload is only offered when this AND `onImageUpload`
   *  are both set. */
  did?: string
  /** Async file uploader. Implementations should call
   *  `uploadBlob(file, ...)` (or its group equivalent) and return the
   *  resulting blob ref. When omitted, the image toolbar button is
   *  disabled. */
  onImageUpload?: (file: File) => Promise<UploadedBlob>
}

export default function LeafletEditor({
  value,
  onChange,
  placeholder,
  className,
  minimal = false,
  readOnly = false,
  ariaLabel,
  did,
  onImageUpload,
}: LeafletEditorProps) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const initial = toInitialDoc(value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        // StarterKit ships bulletList/orderedList without explicit HTML
        // class hooks; the renderer side targets <ul>/<ol> directly so
        // no extra config needed here.
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
        // The empty-state placeholder only renders on the very first
        // node — once the user adds a second paragraph (e.g. blank
        // line), subsequent empty paragraphs remain blank, which is
        // what you'd expect from a normal text editor.
        showOnlyCurrent: false,
      }),
      LeafletImage,
      LeafletIframe,
    ],
    content: initial,
    editable: !readOnly,
    onUpdate({ editor }) {
      const json = editor.getJSON() as {
        type: string
        content?: unknown[]
      }
      const next = tiptapToLinearDocument(
        json as Parameters<typeof tiptapToLinearDocument>[0],
      )
      onChangeRef.current(next)
    },
    editorProps: {
      attributes: {
        class: "leaflet-editor__surface",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    immediatelyRender: false,
  })

  // Keep the editor in sync when `value` changes from outside (e.g.
  // the parent resets the form).
  //
  // The naive `compare against lastExternalRef` pattern resets the
  // cursor on every keystroke when the parent is a controlled form:
  // each keystroke fires onUpdate → parent setState → re-render with
  // a fresh `value` whose `toInitialDoc(value)` doesn't shallow-match
  // `lastExternalRef` (the ref is the *prior* external doc, not what
  // the editor currently holds), so setContent runs every time and
  // ProseMirror's `tr.replaceWith` blows away the selection.
  //
  // Compare against the editor's *current* JSON instead — that is the
  // source of truth for "is the new value already on screen". When
  // they match, the parent's new `value` is the round-tripped echo of
  // what the editor just produced; skip the setContent.
  useEffect(() => {
    if (!editor) return
    const next = toInitialDoc(value)
    const current = editor.getJSON()
    if (!shallowEqual(next, current)) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [editor, value])

  // Wire the owning DID into the image node's storage slot so the
  // node view can build a `getBlob` URL without needing access to
  // the editor's React context.
  useEffect(() => {
    if (!editor) return
    const storage = (
      editor.storage as unknown as Record<string, LeafletImageStorage>
    ).leafletImage
    if (storage) storage.did = did ?? null
  }, [editor, did])

  const [linkDialog, setLinkDialog] = useState<{
    open: boolean
    initialUrl: string
    initialText: string
    allowTextEdit: boolean
  }>({ open: false, initialUrl: "", initialText: "", allowTextEdit: false })

  const [embedDialogOpen, setEmbedDialogOpen] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const openLinkDialog = () => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const currentUrl =
      (editor.getAttributes("link").href as string | undefined) ?? ""
    setLinkDialog({
      open: true,
      initialUrl: currentUrl,
      initialText: "",
      // No selection → let the user type the label that will be
      // inserted alongside the link. Selection present → keep the
      // selection as the label and only show the URL field.
      allowTextEdit: empty && !editor.isActive("link"),
    })
    // Stash the selection range so we can restore it on confirm —
    // opening the dialog moves focus out of the editor.
    selectionRef.current = { from, to, empty }
  }

  const selectionRef = useRef<{
    from: number
    to: number
    empty: boolean
  } | null>(null)

  const handleLinkConfirm = (result: LinkDialogResult) => {
    if (!editor) {
      setLinkDialog((prev) => ({ ...prev, open: false }))
      return
    }
    const stash = selectionRef.current
    selectionRef.current = null
    setLinkDialog((prev) => ({ ...prev, open: false }))

    if (stash) {
      editor.commands.setTextSelection({ from: stash.from, to: stash.to })
    }
    editor.commands.focus()

    const url = result.url.trim()
    if (url === "") {
      // Empty URL = remove the link (only meaningful when editing).
      editor.chain().focus().unsetLink().run()
      return
    }

    // Scheme-allowlist before BOTH branches. TipTap's Link extension
    // only runs isAllowedUri on setLink/toggleLink — insertContent
    // bypasses validation entirely. Without this check a typed or
    // pasted `javascript:` URL would persist into the editor's JSON,
    // round-trip through linearDocument, and render as a one-click
    // XSS anchor for every viewer.
    const safe = safeHttpUrl(url)
    if (!safe) {
      // Silently drop the invalid URL — the dialog should also reject
      // this on submit (LinkDialog has its own guard), but we keep
      // this branch as defense-in-depth.
      return
    }

    if (stash && !stash.empty) {
      // Selection: just wrap it in a link mark.
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: safe })
        .run()
      return
    }

    // No selection: insert the label (or the URL itself if blank) as
    // a fresh text node carrying the link mark.
    const label = result.text.trim() || safe
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href: safe } }],
        },
      ])
      .run()
  }

  const canUploadImages = !!did && !!onImageUpload

  const handleImageButtonClick = () => {
    if (!canUploadImages) return
    fileInputRef.current?.click()
  }

  const handleImageFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !editor || !onImageUpload) return
    // Lexicon caps blob size at 1MB for image blocks.
    const MAX = 1024 * 1024
    if (!file.type.startsWith("image/")) {
      setUploadError("Please pick an image file")
      return
    }
    if (file.size > MAX) {
      setUploadError("Image must be 1MB or smaller")
      return
    }
    setUploadError(null)
    setIsUploadingImage(true)
    try {
      const dims = await readImageDimensions(file)
      const blob = await onImageUpload(file)
      // Cache a local object URL keyed by the just-returned blob CID
      // so the NodeView can preview the file immediately. atproto PDSes
      // don't serve unreferenced blobs via getBlob, so without this
      // bridge the freshly-uploaded image would 404 in-editor until the
      // user saves the org marker record.
      const objectUrl = URL.createObjectURL(file)
      const storage = (
        editor.storage as unknown as Record<string, LeafletImageStorage>
      ).leafletImage
      if (storage) storage.pendingBlobs.set(blob.ref.$link, objectUrl)
      editor
        .chain()
        .focus()
        .insertContent({
          type: "leafletImage",
          attrs: {
            blobCid: blob.ref.$link,
            blobMimeType: blob.mimeType,
            blobSize: blob.size,
            alt: "",
            width: dims.width,
            height: dims.height,
            fullBleed: false,
          },
        })
        .run()
    } catch (err) {
      console.error("Image upload failed:", err)
      setUploadError(
        err instanceof Error ? err.message : "Upload failed",
      )
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleEmbedConfirm = (result: EmbedDialogResult) => {
    setEmbedDialogOpen(false)
    if (!editor) return
    editor
      .chain()
      .focus()
      .insertContent({
        type: "leafletIframe",
        attrs: {
          url: result.url,
          aspectWidth: result.aspectRatio.width,
          aspectHeight: result.aspectRatio.height,
        },
      })
      .run()
  }

  return (
    <div className={joinClass("leaflet-editor", className)}>
      {!readOnly ? (
        <Toolbar
          editor={editor}
          minimal={minimal}
          onLinkClick={openLinkDialog}
          onImageClick={canUploadImages ? handleImageButtonClick : undefined}
          onEmbedClick={() => setEmbedDialogOpen(true)}
          isUploadingImage={isUploadingImage}
        />
      ) : null}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="leaflet-editor__image-input"
        onChange={handleImageFileChange}
        hidden
      />
      <EditorContent editor={editor} className="leaflet-editor__content" />
      {uploadError ? (
        <p role="alert" className="leaflet-editor__error">
          {uploadError}
        </p>
      ) : null}
      {linkDialog.open ? (
        <LinkDialog
          initialUrl={linkDialog.initialUrl}
          initialText={linkDialog.initialText}
          allowTextEdit={linkDialog.allowTextEdit}
          onClose={() => {
            selectionRef.current = null
            setLinkDialog((prev) => ({ ...prev, open: false }))
          }}
          onConfirm={handleLinkConfirm}
        />
      ) : null}
      {embedDialogOpen ? (
        <EmbedDialog
          onCancel={() => setEmbedDialogOpen(false)}
          onConfirm={handleEmbedConfirm}
        />
      ) : null}
    </div>
  )
}

/** Read natural image dimensions from a File without a network round-trip. */
function readImageDimensions(file: File): Promise<{
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Could not read image dimensions"))
    }
    img.src = url
  })
}

function joinClass(base: string, extra: string | undefined): string {
  return extra ? `${base} ${extra}` : base
}

function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function toInitialDoc(value: LinearDocument | string | null | undefined) {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      return linearDocumentToTipTap(null)
    }
    // Plain-string longDescription — hydrate as a single paragraph.
    return {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: value }],
        },
      ],
    }
  }
  const doc = asLinearDocument(value)
  return linearDocumentToTipTap(doc)
}

interface ToolbarProps {
  editor: Editor | null
  minimal: boolean
  onLinkClick: () => void
  onImageClick?: () => void
  onEmbedClick: () => void
  isUploadingImage: boolean
}

function Toolbar({
  editor,
  minimal,
  onLinkClick,
  onImageClick,
  onEmbedClick,
  isUploadingImage,
}: ToolbarProps) {
  if (!editor) {
    return <div className="leaflet-editor__toolbar" aria-hidden />
  }

  const btn = (
    key: string,
    label: string,
    Icon: typeof BoldIcon,
    active: boolean,
    onClick: () => void,
    disabled = false,
  ) => (
    <button
      key={key}
      type="button"
      className={
        "leaflet-editor__btn" +
        (active ? " leaflet-editor__btn--active" : "")
      }
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={() => {
        onClick()
        editor.commands.focus()
      }}
      disabled={disabled}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden />
    </button>
  )

  return (
    <div
      className="leaflet-editor__toolbar"
      role="toolbar"
      aria-label="Formatting"
    >
      {!minimal &&
        btn(
          "h1",
          "Heading 1",
          Heading1,
          editor.isActive("heading", { level: 1 }),
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        )}
      {!minimal &&
        btn(
          "h2",
          "Heading 2",
          Heading2,
          editor.isActive("heading", { level: 2 }),
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        )}
      {!minimal &&
        btn(
          "h3",
          "Heading 3",
          Heading3,
          editor.isActive("heading", { level: 3 }),
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        )}
      {btn(
        "bold",
        "Bold",
        BoldIcon,
        editor.isActive("bold"),
        () => editor.chain().focus().toggleBold().run(),
      )}
      {btn(
        "italic",
        "Italic",
        ItalicIcon,
        editor.isActive("italic"),
        () => editor.chain().focus().toggleItalic().run(),
      )}
      {btn(
        "ul",
        "Bullet list",
        BulletIcon,
        editor.isActive("bulletList"),
        () => editor.chain().focus().toggleBulletList().run(),
      )}
      {btn(
        "ol",
        "Numbered list",
        ListOrdered,
        editor.isActive("orderedList"),
        () => editor.chain().focus().toggleOrderedList().run(),
      )}
      {btn(
        "link",
        editor.isActive("link") ? "Edit link" : "Add link",
        LinkIcon,
        editor.isActive("link"),
        onLinkClick,
      )}
      {onImageClick
        ? btn(
            "image",
            isUploadingImage ? "Uploading image…" : "Insert image",
            ImageIcon,
            false,
            onImageClick,
            isUploadingImage,
          )
        : null}
      {btn(
        "embed",
        "Embed video",
        YoutubeIcon,
        false,
        onEmbedClick,
      )}
    </div>
  )
}
