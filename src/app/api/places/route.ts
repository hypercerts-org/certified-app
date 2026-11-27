import { connection, type NextRequest } from "next/server";
import { apiUnavailable, PRIVATE_NO_STORE_HEADERS } from "@/lib/api-response";
import { getUser } from "@/lib/auth/dal";
import { store, storeKey } from "@/lib/auth/valkey";
import { nameOfPoint, searchPlaces } from "@/lib/geocode";

// Places for the location picker (components/location-picker), through
// Nominatim (lib/geocode): `?q=` finds places by name; `?lat=&lng=` names a
// dropped pin. For signed-in users only, rate-limited per user, so it isn't
// an open proxy to Nominatim, whose limit (a request a second) this server
// shares.

async function allowPlaceLookup(did: string): Promise<boolean> {
  try {
    const key = storeKey(`ratelimit:places:${did}:${Math.floor(Date.now() / 60_000)}`);
    const [count] = await store((r) => r.multi().incr(key).expire(key, 60).exec());
    return Number(count) <= 30;
  } catch {
    // Valkey unavailable: fall through to Nominatim's own 1 req/s queue.
    return true;
  }
}

export async function GET(request: NextRequest) {
  await connection();
  try {
    const user = await getUser();
    if (!user) {
      return Response.json(
        { error: "SignedOut" },
        { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    if (!(await allowPlaceLookup(user.did))) {
      return Response.json(
        { error: "RateLimited" },
        { status: 429, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const params = request.nextUrl.searchParams;
    const q = params.get("q");
    if (q !== null) {
      if (q.length > 200) {
        return Response.json(
          { error: "InvalidQuery" },
          { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
        );
      }
      return Response.json(
        { places: await searchPlaces(q) },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const rawLat = params.get("lat");
    const rawLng = params.get("lng");
    if (!rawLat || !rawLng) {
      return Response.json(
        { error: "InvalidPoint" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return Response.json(
        { error: "InvalidPoint" },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return Response.json(
      { name: await nameOfPoint({ lat, lng }) },
      { headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (err) {
    return apiUnavailable("[api/places] GET /api/places failed", err);
  }
}
