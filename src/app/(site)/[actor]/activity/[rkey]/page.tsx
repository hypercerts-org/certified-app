import { Text } from "@hypercerts-org/ui-react";
import { Suspense } from "react";
import { activityFrom } from "@/components/activity-page";
import { ProfileFeedSkeleton } from "@/components/profile-feed";
import { RecordTimeline } from "@/components/record-timeline";
import { RichText } from "@/components/rich-text";
import { leadOf } from "@/lib/rich-text";

async function Overview({ params }: Pick<PageProps<"/[actor]/activity/[rkey]">, "params">) {
  const { activity, uri, base } = await activityFrom(params);
  const lead = leadOf(activity.shortDescription, activity.description);
  const text = lead || activity.description;
  return (
    <div className="stack">
      {/* The short description leads; the full text follows, never cut. */}
      {text && (
        <article className="activity-body">
          {lead && (
            <Text className="activity-lead" dir="auto">
              {lead}
            </Text>
          )}
          {activity.description && <RichText text={activity.description} />}
        </article>
      )}
      <Suspense fallback={<ProfileFeedSkeleton />}>
        <RecordTimeline
          uri={uri}
          owner={activity.author}
          href={base}
          noun="activity"
          emptyless={Boolean(text)}
        />
      </Suspense>
    </div>
  );
}

/** The activity's text, then what happened in it: its default tab. */
export default function ActivityOverviewPage(props: PageProps<"/[actor]/activity/[rkey]">) {
  return (
    <Suspense fallback={<ProfileFeedSkeleton />}>
      <Overview params={props.params} />
    </Suspense>
  );
}
