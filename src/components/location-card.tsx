import { Card, Heading } from "@hypercerts-org/ui-react";
import { MapPin } from "lucide-react";
import { LocationMap } from "@/components/location-map";
import type { Place } from "@/lib/hypercerts/views";

/**
 * Where an account or a project is: a small map when the place has a point,
 * then its full name. `who` names it on the pin ("SELVA, Bogotá, Colombia");
 * `imageUrl` is the pin's picture.
 */
export function LocationCard({
  place,
  who,
  imageUrl,
}: {
  place: Place;
  who: string;
  imageUrl: string | null;
}) {
  return (
    <Card variant="panel" className="overview-box rail-card">
      <Heading level={2} size="heading">
        Location
      </Heading>
      <div className="location">
        {place.point && (
          <LocationMap point={place.point} label={`${who}, ${place.short}`} imageUrl={imageUrl} />
        )}
        <p className="location-name">
          <MapPin size={16} aria-hidden />
          <span dir="auto">{place.name}</span>
        </p>
      </div>
    </Card>
  );
}
