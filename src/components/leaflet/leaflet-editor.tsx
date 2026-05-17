"use client"

import { useEffect, useRef } from "react"
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
  List as BulletIcon,
  ListOrdered,
  Link as LinkIcon,
} from "lucide-react"
import { asLinearDocument } from "@/lib/leaflet/guards"
import { tiptapToLinearDocument } from "@/lib/leaflet/from-tiptap"
import { linearDocumentToTipTap } from "@/lib/leaflet/to-tiptap"
import type { LinearDocument } from "@/lib/leaflet/types"

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
}

export default function LeafletEditor({
  value,
  onChange,
  placeholder,
  className,
  minimal = false,
  readOnly = false,
  ariaLabel,
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
  // the parent resets the form). We only re-set content when the
  // change came from outside the editor — comparing against the
  // current editor JSON would cause feedback loops.
  const lastExternalRef = useRef(initial)
  useEffect(() => {
    if (!editor) return
    const next = toInitialDoc(value)
    if (!shallowEqual(next, lastExternalRef.current)) {
      lastExternalRef.current = next
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [editor, value])

  return (
    <div className={joinClass("leaflet-editor", className)}>
      {!readOnly ? <Toolbar editor={editor} minimal={minimal} /> : null}
      <EditorContent editor={editor} className="leaflet-editor__content" />
    </div>
  )
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
}

function Toolbar({ editor, minimal }: ToolbarProps) {
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

  const handleLink = () => {
    const current = editor.getAttributes("link").href as string | undefined
    const next = window.prompt("Link URL", current ?? "https://")
    if (next === null) return
    if (next.trim().length === 0) {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: next.trim() })
      .run()
  }

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
        handleLink,
      )}
    </div>
  )
}
