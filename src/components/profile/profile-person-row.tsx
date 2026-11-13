"use client"

import EndorsementSubjectRow, {
  type EndorsementSubjectRowClasses,
} from "@/components/endorsements/endorsement-subject-row"
import { useAuthorInfo } from "@/hooks/use-author-info"

/** The classes the shared subject row wears in the profile's people
 *  lists (endorsements, followers, following). Styles: profile.css. */
export const PERSON_ROW_CLASSES: EndorsementSubjectRowClasses = {
  main: "profile-person__main hover-tint hover-tint--bleed",
  meta: "profile-person__text",
  name: "profile-person__name",
  handle: "profile-person__handle",
  note: "profile-person__note",
  date: "profile-person__date",
}

/**
 * One account as a row in a people list: avatar, name, @handle and the
 * date, linking to the account's profile. `trailing` holds a row action
 * (e.g. unfollow). Render inside a `<ul className="profile-people">`.
 */
export default function ProfilePersonRow({
  did,
  since,
  trailing,
}: {
  did: string
  /** ISO date the relation started (followed at, endorsed at). */
  since: string
  trailing?: React.ReactNode
}) {
  const { info, isLoading } = useAuthorInfo(did)
  return (
    <li className="profile-person">
      <EndorsementSubjectRow
        did={did}
        info={info}
        isLoading={isLoading}
        createdAt={since}
        avatarSize="sm"
        classes={PERSON_ROW_CLASSES}
        trailing={trailing}
      />
    </li>
  )
}
