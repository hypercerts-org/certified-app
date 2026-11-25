import { connection, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth/dal";
import { nameOfPoint, searchPlaces } from "@/lib/geocode";

// Places for the location picker (components/location-picker), through
// Nominatim (lib/geocode): `?q=` finds places by name; `?lat=&lng=` names a
// dropped pin. For signed-in users only, so it isn't an open proxy to
// Nominatim, whose limit (a request a second) this server shares.

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  await connection();
  if (!(await getUser())) {
    return Response.json({ error: "SignedOut" }, { status: 401, headers: privateHeaders });
  }
  const params = request.nextUrl.searchParams;
  const q = params.get("q");
  if (q !== null) {
    if (q.length > 200) return Response.json({ error: "InvalidQuery" }, { status: 400 });
    return Response.json({ places: await searchPlaces(q) }, { headers: privateHeaders });
  }
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "InvalidPoint" }, { status: 400 });
  }
  return Response.json({ name: await nameOfPoint({ lat, lng }) }, { headers: privateHeaders });
}
